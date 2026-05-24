import { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Leaf, Calendar, RefreshCw, ChevronDown, Zap, Building2, ChevronLeft, ChevronRight, FileDown, Loader2 } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const API_BASE = 'http://localhost:8084/api';
const COST_PER_KWH_MILLIMES = 50;

// ─── Types ───────────────────────────────────────────────────────────────────

interface SensorMeasurement {
  id: number;
  sensorId: string;
  sensorType: string;
  label: string | null;
  ifcGlobalId: string | null;
  roomName: string | null;
  unit: string | null;
  value: number | null;
  status: string | null;
  measuredAt: string;
  recordedAt: string;
  timestamp: string;
}

interface SpaceFloorMapping {
  id: number;
  spaceGlobalId: string;
  spaceName: string | null;
  spaceLongName: string | null;
  storeyGlobalId: string | null;
  storeyName: string | null;
  storeyElevation: number | null;
}

interface MonthlyData { month: string; energy: number; cost: number; }
interface HourlyData { hour: string; avg: number; }
interface SensorTypeData { category: string; avg: number; }

type PeriodPreset = '1w' | '1m' | '3m' | 'custom';
interface DateRange { from: Date; to: Date; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMillimes(millimes: number): string {
  if (millimes >= 1000) return `${(millimes / 1000).toFixed(2)} DT`;
  return `${Math.round(millimes)} mill.`;
}

function groupByMonth(measurements: SensorMeasurement[]): MonthlyData[] {
  const map: Record<string, MonthlyData> = {};
  measurements.forEach(m => {
    if (m.value == null || m.sensorType?.toLowerCase() !== 'energy') return;
    const d = new Date(m.measuredAt || m.timestamp);
    const key = d.toLocaleString('fr-FR', { month: 'short', year: '2-digit' });
    if (!map[key]) map[key] = { month: key, energy: 0, cost: 0 };
    map[key].energy += m.value;
    map[key].cost += m.value * COST_PER_KWH_MILLIMES;
  });
  return Object.values(map).slice(-6);
}

interface DailyData {
  day: string;
  energy: number;
}

function groupByDay(measurements: SensorMeasurement[]): DailyData[] {
  const map: Record<string, number> = {};

  measurements.forEach(m => {
    if (
      m.value == null ||
      m.sensorType?.toLowerCase() !== 'energy'
    ) return;

    const d = new Date(m.measuredAt || m.timestamp);

    const key = d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    });

    if (!map[key]) map[key] = 0;

    map[key] += m.value;
  });

  return Object.entries(map)
    .map(([day, energy]) => ({
      day,
      energy: +energy.toFixed(2),
    }))
    .sort((a, b) => {
      const [da, ma] = a.day.split('/');
      const [db, mb] = b.day.split('/');

      return (
        new Date(2025, Number(ma) - 1, Number(da)).getTime() -
        new Date(2025, Number(mb) - 1, Number(db)).getTime()
      );
    });
}

function groupByHour(measurements: SensorMeasurement[]): HourlyData[] {
  const map: Record<string, { total: number; count: number }> = {};

  measurements.forEach(m => {
    if (m.value == null) return;

    const d = new Date(m.measuredAt || m.timestamp);
    const hour = d.getHours().toString().padStart(2, '0') + ':00';

    if (!map[hour]) {
      map[hour] = { total: 0, count: 0 };
    }

    map[hour].total += m.value;
    map[hour].count++;
  });

  return Object.entries(map)
    .map(([hour, v]) => ({
      hour,
      avg: +(v.total / v.count).toFixed(2),
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

function groupBySensorType(measurements: SensorMeasurement[]): SensorTypeData[] {
  const map: Record<string, { total: number; count: number }> = {};
  measurements.forEach(m => {
    if (m.value == null) return;
    const type = m.sensorType || 'Unknown';
    if (!map[type]) map[type] = { total: 0, count: 0 };
    map[type].total += m.value;
    map[type].count++;
  });
  return Object.entries(map).map(([category, g]) => ({
    category,
    avg: +(g.total / g.count).toFixed(2),
  }));
}

function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function endOfDay(d: Date): Date { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function getRangeForPreset(preset: PeriodPreset): DateRange {
  const now = new Date();
  if (preset === '1w') return { from: startOfDay(addDays(now, -6)), to: endOfDay(now) };
  if (preset === '1m') return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
  if (preset === '3m') return { from: startOfDay(addDays(now, -89)), to: endOfDay(now) };
  return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) };
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  '1w': '7 derniers jours',
  '1m': '30 derniers jours',
  '3m': '3 derniers mois',
  'custom': 'Periode personnalisee',
};

const darkTooltipStyle = {
  contentStyle: {
    backgroundColor: '#0f0f14', border: '1px solid #2a2a3a',
    borderRadius: '10px', color: '#e2e8f0', fontSize: 12,
  },
};

// ─── PDF Generation ───────────────────────────────────────────────────────────

async function loadJsPDF(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).jspdf) { resolve((window as any).jspdf.jsPDF); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve((window as any).jspdf.jsPDF);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadAutoTable(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).jspdfAutoTable) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

interface ReportData {
  periodLabel: string;
  roomLabel: string;
  totalEnergy: number;
  totalCost: number;
  uniqueSensors: number;
  totalMeasures: number;
  avgValue: number;
  monthlyData: MonthlyData[];
  hourlyData: HourlyData[];
  sensorTypeData: SensorTypeData[];
  recentReadings: SensorMeasurement[];
}

async function generatePDF(data: ReportData): Promise<void> {
  const JsPDF = await loadJsPDF();
  await loadAutoTable();

  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 15;
  const contentW = W - margin * 2;

  const DARK: [number, number, number] = [15, 15, 20];
  const BLUE: [number, number, number] = [56, 189, 248];
  const GREEN: [number, number, number] = [52, 211, 153];
  const PURPLE: [number, number, number] = [129, 140, 248];
  const AMBER: [number, number, number] = [251, 146, 60];
  const GREY_LIGHT: [number, number, number] = [245, 246, 250];
  const GREY_MID: [number, number, number] = [148, 163, 184];
  const WHITE: [number, number, number] = [255, 255, 255];

  let y = 0;

  // ── Header band ──
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 42, 'F');
  doc.setFillColor(...BLUE);
  doc.rect(0, 38, W, 4, 'F');

  // Logo circle
  doc.setFillColor(30, 40, 60);
  doc.circle(margin + 8, 19, 8, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLUE);
  doc.text('DT', margin + 4.8, 22.5);

  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text("Rapport d'Analyse Energetique", margin + 20, 16);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GREY_MID);
  doc.text(`Digital Twin Building  |  Periode: ${data.periodLabel}`, margin + 20, 23);
  doc.text(`Genere le ${new Date().toLocaleString('fr-FR')}  |  Salle: ${data.roomLabel}`, margin + 20, 29);

  y = 52;

  // ── KPI Cards 2x2 ──
  const cardW = (contentW - 6) / 2;
  const cardH = 28;
  const cards = [
    { label: 'COUT TOTAL ENERGIE', value: formatMillimes(data.totalCost), sub: `${data.totalEnergy.toFixed(1)} kWh consommes`, color: GREEN },
    { label: 'ENERGIE CONSOMMEE', value: `${data.totalEnergy.toFixed(1)} kWh`, sub: `${data.totalMeasures} releves sur la periode`, color: BLUE },
    { label: 'CAPTEURS ACTIFS', value: String(data.uniqueSensors), sub: `${data.totalMeasures} mesures totales`, color: PURPLE },
    { label: 'VALEUR MOYENNE', value: String(data.avgValue), sub: 'toutes unites confondues', color: AMBER },
  ];

  cards.forEach((card, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = margin + col * (cardW + 6);
    const cy = y + row * (cardH + 5);

    doc.setFillColor(...GREY_LIGHT);
    doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'F');
    doc.setFillColor(...card.color);
    doc.roundedRect(cx, cy, 3, cardH, 1.5, 1.5, 'F');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREY_MID);
    doc.text(card.label, cx + 7, cy + 8);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(card.value, cx + 7, cy + 18);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREY_MID);
    doc.text(card.sub, cx + 7, cy + 24.5);
  });

  y += 2 * (cardH + 5) + 10;

  // ── Energie & Cout mensuel ──
  if (data.monthlyData.length > 0) {
    doc.setFillColor(...DARK);
    doc.roundedRect(margin, y, contentW, 8, 2, 2, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLUE);
    doc.text('  Energie & Cout mensuel', margin + 2, y + 5.5);
    y += 11;

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Mois', 'Energie (kWh)', 'Cout (mill.)', 'Cout (DT)']],
      body: data.monthlyData.map(r => [
        r.month,
        r.energy.toFixed(1),
        Math.round(r.cost).toLocaleString('fr-FR'),
        (r.cost / 1000).toFixed(3),
      ]),
      headStyles: { fillColor: [25, 25, 35], textColor: BLUE, fontSize: 8, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 8, textColor: DARK, halign: 'center' },
      alternateRowStyles: { fillColor: GREY_LIGHT },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
      tableLineColor: [210, 215, 230],
      tableLineWidth: 0.2,
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Moyenne par type ──
  if (data.sensorTypeData.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFillColor(...DARK);
    doc.roundedRect(margin, y, contentW, 8, 2, 2, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PURPLE);
    doc.text('  Valeur moyenne par type de capteur', margin + 2, y + 5.5);
    y += 11;

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Type de capteur', 'Valeur moyenne']],
      body: data.sensorTypeData.map(r => [r.category, r.avg.toFixed(2)]),
      headStyles: { fillColor: [25, 25, 35], textColor: PURPLE, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: DARK },
      alternateRowStyles: { fillColor: GREY_LIGHT },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      tableLineColor: [210, 215, 230],
      tableLineWidth: 0.2,
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Dernières mesures ──
  if (data.recentReadings.length > 0) {
    if (y > 215) { doc.addPage(); y = 20; }
    doc.setFillColor(...DARK);
    doc.roundedRect(margin, y, contentW, 8, 2, 2, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREEN);
    doc.text('  Dernieres mesures', margin + 2, y + 5.5);
    y += 11;

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Label / Capteur', 'Type', 'Salle', 'Valeur', 'Unite', 'Horodatage']],
      body: data.recentReadings.slice(0, 25).map(m => {
        const ts = new Date(m.measuredAt || m.timestamp);
        return [
          m.label || m.sensorId || '—',
          m.sensorType || '—',
          m.roomName || '—',
          m.value != null ? m.value.toFixed(2) : '—',
          m.unit || '—',
          ts.toLocaleString('fr-FR'),
        ];
      }),
      headStyles: { fillColor: [25, 25, 35], textColor: GREEN, fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: DARK },
      alternateRowStyles: { fillColor: GREY_LIGHT },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 22 },
        2: { cellWidth: 18 },
        3: { halign: 'right', cellWidth: 16 },
        4: { cellWidth: 12 },
        5: { cellWidth: 38 },
      },
      tableLineColor: [210, 215, 230],
      tableLineWidth: 0.2,
    });
  }

  // ── Footer sur toutes les pages ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFillColor(...DARK);
    doc.rect(0, 287, W, 10, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREY_MID);
    doc.text(`Digital Twin Building  |  Rapport energetique  |  ${data.periodLabel}`, margin, 293);
    doc.text(`Page ${p} / ${pageCount}`, W - margin - 14, 293);
  }

  const filename = `rapport_energie_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

interface MiniCalendarProps {
  value: Date; rangeStart: Date | null; rangeEnd: Date | null;
  onSelect: (d: Date) => void; label: string;
}

function MiniCalendar({ value, rangeStart, rangeEnd, onSelect, label }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDow = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const offset = (firstDow + 6) % 7;
  const monthLabel = viewMonth.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
        <span className="text-xs font-semibold text-white capitalize">{monthLabel}</span>
        <button onClick={() => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="text-center text-zinc-600 text-[10px] font-medium py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1);
          const isStart = rangeStart && isSameDay(day, rangeStart);
          const isEnd = rangeEnd && isSameDay(day, rangeEnd);
          const inRange = rangeStart && rangeEnd && day > rangeStart && day < rangeEnd;
          const today = isSameDay(day, new Date());
          let cls = 'text-[11px] w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-all select-none font-medium ';
          if (isStart || isEnd) cls += 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 ';
          else if (inRange) cls += 'bg-blue-500/20 text-blue-300 rounded-none ';
          else if (today) cls += 'text-blue-400 border border-blue-500/40 ';
          else cls += 'text-zinc-400 hover:bg-zinc-700 hover:text-white ';
          return <div key={i} className={cls} onClick={() => onSelect(day)}>{i + 1}</div>;
        })}
      </div>
    </div>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────────────────

function DateRangePicker({ range, preset, onPresetChange, onRangeChange }: {
  range: DateRange; preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  onRangeChange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<'from' | 'to'>('from');
  const [tempFrom, setTempFrom] = useState<Date>(range.from);
  const [tempTo, setTempTo] = useState<Date>(range.to);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setTempFrom(range.from); setTempTo(range.to); }, [range]);

  function handleDaySelect(d: Date) {
    if (selecting === 'from') { setTempFrom(startOfDay(d)); setSelecting('to'); }
    else {
      if (d < tempFrom) { setTempTo(endOfDay(tempFrom)); setTempFrom(startOfDay(d)); }
      else { setTempTo(endOfDay(d)); }
      setSelecting('from');
    }
  }

  const label = preset === 'custom'
    ? `${formatDateLabel(range.from)} → ${formatDateLabel(range.to)}`
    : PRESET_LABELS[preset];

  return (
  <div className="relative" ref={ref}>
    <button
      onClick={() => setOpen(o => !o)}
      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-xl text-sm transition-all"
    >
      <Calendar className="w-4 h-4 text-blue-500 flex-shrink-0" />
      <span className="max-w-44 truncate">{label}</span>
      <ChevronDown
        className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>

    {open && (
      <div className="absolute z-50 top-full mt-2 right-0 bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden w-max">
        
        <div className="flex border-b border-zinc-200">
          {(['1w', '1m', '3m'] as PeriodPreset[]).map(p => (
            <button
              key={p}
              onClick={() => {
                onPresetChange(p);
                onRangeChange(getRangeForPreset(p));
                setOpen(false);
              }}
              className={`flex-1 px-4 py-2.5 text-xs font-semibold transition-colors ${
                preset === p
                  ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-500'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}

          <button
            onClick={() => setSelecting('from')}
            className={`flex-1 px-4 py-2.5 text-xs font-semibold transition-colors ${
              preset === 'custom'
                ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-500'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            Personnalise
          </button>
        </div>

        <div className="p-5 bg-white">
          <div className="flex gap-8">
            <MiniCalendar
              label={
                selecting === 'from'
                  ? '📅 Date de debut (selection)'
                  : '✅ Date de debut'
              }
              value={tempFrom}
              rangeStart={tempFrom}
              rangeEnd={selecting === 'to' ? null : tempTo}
              onSelect={handleDaySelect}
            />

            <div className="w-px bg-zinc-200 self-stretch" />

            <MiniCalendar
              label={
                selecting === 'to'
                  ? '📅 Date de fin (selection)'
                  : '✅ Date de fin'
              }
              value={tempTo}
              rangeStart={tempFrom}
              rangeEnd={tempTo}
              onSelect={handleDaySelect}
            />
          </div>

          <div className="mt-4 p-3 bg-white rounded-xl border border-zinc-200 flex items-center justify-between gap-4 shadow-sm">
            <div className="text-xs text-zinc-600 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  selecting === 'from'
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-zinc-400'
                }`}
              />

              <span className="font-medium text-zinc-900">
                {formatDateLabel(tempFrom)}
              </span>

              <span className="text-zinc-400">→</span>

              <span
                className={`w-2 h-2 rounded-full ${
                  selecting === 'to'
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-zinc-400'
                }`}
              />

              <span className="font-medium text-zinc-900">
                {formatDateLabel(tempTo)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setTempFrom(range.from);
                  setTempTo(range.to);
                  setSelecting('from');
                }}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Reinitialiser
              </button>

              <button
                onClick={() => {
                  onPresetChange('custom');
                  onRangeChange({ from: tempFrom, to: tempTo });
                  setOpen(false);
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Appliquer
              </button>
            </div>
          </div>

          <p className="text-center text-zinc-500 text-[10px] mt-2">
            {selecting === 'from'
              ? 'Cliquez pour choisir la date de debut'
              : 'Cliquez maintenant pour choisir la date de fin'}
          </p>
        </div>
      </div>
    )}
  </div>
);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AnalyticsView() {
  const [rooms, setRooms] = useState<SpaceFloorMapping[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [measurements, setMeasurements] = useState<SensorMeasurement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [generatingPDF, setGeneratingPDF] = useState<boolean>(false);

  const [preset, setPreset] = useState<PeriodPreset>('1m');
  const [dateRange, setDateRange] = useState<DateRange>(getRangeForPreset('1m'));

  useEffect(() => {
    fetch(`${API_BASE}/building/spaces-floors`)
      .then(r => r.json())
      .then((data: SpaceFloorMapping[]) => setRooms(data || []))
      .catch(() => {});
  }, []);

  const fetchMeasurements = useCallback(() => {
    setLoading(true);
    const fromStr = dateRange.from.toISOString();
    const toStr = dateRange.to.toISOString();
    fetch(`${API_BASE}/measurements/range?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`)
      .then(r => r.json())
      .then((data: SensorMeasurement[]) => { setMeasurements(data || []); setLastRefresh(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateRange]);

  useEffect(() => {
    fetchMeasurements();
    const interval = setInterval(fetchMeasurements, 30000);
    return () => clearInterval(interval);
  }, [fetchMeasurements]);

  function handlePresetChange(p: PeriodPreset) {
    setPreset(p);
    if (p !== 'custom') setDateRange(getRangeForPreset(p));
  }

  const filtered: SensorMeasurement[] = selectedRoom === 'all'
    ? measurements
    : measurements.filter(m => m.roomName === selectedRoom);

  const energyMeasures = filtered.filter(m => m.sensorType?.toLowerCase() === 'energy' && m.value != null);
  const totalEnergy = energyMeasures.reduce((s, m) => s + (m.value as number), 0);
  const totalCost = totalEnergy * COST_PER_KWH_MILLIMES;
  const allEnergy = measurements.filter(m => m.sensorType?.toLowerCase() === 'energy' && m.value != null);
  const prevEnergy = allEnergy.length > 0 ? allEnergy.reduce((s, m) => s + (m.value as number), 0) / 2 : 1;
  const energyChange = prevEnergy ? +((totalEnergy - prevEnergy) / prevEnergy * 50).toFixed(1) : 0;
  const uniqueSensors = new Set(filtered.map(m => m.sensorId)).size;
  const avgValue = filtered.length ? +(filtered.reduce((s, m) => s + (m.value ?? 0), 0) / filtered.length).toFixed(2) : 0;

  const monthlyData = groupByMonth(filtered);
  const dailyData = groupByDay(filtered);
  const hourlyData = groupByHour(filtered);
  const sensorTypeData = groupBySensorType(filtered);
  const recentReadings = [...filtered]
    .sort((a, b) => new Date(b.measuredAt || b.timestamp).getTime() - new Date(a.measuredAt || a.timestamp).getTime())
    .slice(0, 25);

  const selectedLabel = selectedRoom === 'all'
    ? 'Toutes les salles'
    : rooms.find(r => r.spaceName === selectedRoom)?.spaceLongName || selectedRoom;

  const periodSummary = preset === 'custom'
    ? `${formatDateLabel(dateRange.from)} → ${formatDateLabel(dateRange.to)}`
    : PRESET_LABELS[preset];

  async function handleGenerateReport() {
    setGeneratingPDF(true);
    try {
      await generatePDF({
        periodLabel: periodSummary,
        roomLabel: selectedLabel,
        totalEnergy,
        totalCost,
        uniqueSensors,
        totalMeasures: filtered.length,
        avgValue,
        monthlyData,
        hourlyData,
        sensorTypeData,
        recentReadings,
      });
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Erreur lors de la generation du rapport PDF.');
    } finally {
      setGeneratingPDF(false);
    }
  }

  const kpis = [
    { label: 'Coût total énergie', value: formatMillimes(totalCost), sub: `${totalEnergy.toFixed(1)} kWh consommés`, change: energyChange, icon: DollarSign, gradient: 'from-emerald-600 to-teal-600' },
    { label: 'Énergie consommée', value: `${totalEnergy.toFixed(1)} kWh`, sub: `${energyMeasures.length} relevés`, change: energyChange, icon: Zap, gradient: 'from-blue-600 to-cyan-600' },
    { label: 'Capteurs actifs', value: String(uniqueSensors), sub: `${filtered.length} mesures totales`, change: 0, icon: TrendingUp, gradient: 'from-violet-600 to-purple-600' },
    { label: 'Valeur moyenne', value: String(avgValue), sub: 'toutes unités confondues', change: 0, icon: Leaf, gradient: 'from-orange-500 to-amber-500' },
  ];

  return (
    <div className="soft-page p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Analyse et Rapports</h2>
          <p className="text-zinc-400 text-sm">
            {periodSummary} · Coût: 50 mill./kWh
            {lastRefresh && <span className="ml-2 text-zinc-600">· Mis à jour {lastRefresh.toLocaleTimeString('fr-FR')}</span>}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Room dropdown */}
          <div className="relative">
            <button onClick={() => setDropdownOpen(o => !o)}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-xl text-sm transition-all min-w-48">
              <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{selectedLabel}</span>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute z-50 top-full mt-1 right-0 w-64 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <button onClick={() => { setSelectedRoom('all'); setDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm bg-white hover:bg-zinc-50 text-zinc-700 ${selectedRoom === 'all' ? 'text-blue-600 font-semibold' : ''}`}>
                    Toutes les salles
                  </button>
                  {rooms.map(r => (
                    <button key={r.spaceGlobalId} onClick={() => { setSelectedRoom(r.spaceName ?? ''); setDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm bg-white hover:bg-zinc-50 text-zinc-700 ${selectedRoom === r.spaceName ? 'text-blue-600 font-semibold' : ''}`}>
                      <div className="font-medium">{r.spaceLongName || r.spaceName}</div>
                      <div className="text-zinc-500 text-xs">{r.storeyName}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DateRangePicker range={dateRange} preset={preset} onPresetChange={handlePresetChange} onRangeChange={setDateRange} />

          <button onClick={fetchMeasurements} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-xl text-sm transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Rafraîchir
          </button>

          {/* ── Bouton Générer rapport PDF ── */}
          <button
            onClick={handleGenerateReport}
            disabled={generatingPDF || loading}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg ${
              generatingPDF
                ? 'bg-blue-800/70 text-blue-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-blue-500/20 hover:shadow-blue-500/40'
            }`}
          >
            {generatingPDF
              ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Génération en cours...</span></>
              : <><FileDown className="w-4 h-4" /><span>Générer rapport PDF</span></>
            }
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="bg-white backdrop-blur-xl border border-zinc-200 rounded-2xl p-5">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center mb-4 shadow-lg`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-zinc-500 text-xs mb-1">{kpi.label}</p>
              <div className="text-2xl font-bold text-white mb-1">{kpi.value}</div>
              <p className="text-zinc-600 text-xs mb-2">{kpi.sub}</p>
              {kpi.change !== 0 && (
                <div className={`flex items-center gap-1 text-xs ${kpi.change > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {kpi.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{Math.abs(kpi.change)}% vs estimation</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white backdrop-blur-xl border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-white mb-1">Énergie & Coût mensuel</h3>
          <p className="text-zinc-500 text-xs mb-5">Consommation kWh et coût en millimes</p>
          {monthlyData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-zinc-600 text-sm">{loading ? 'Chargement...' : 'Pas de données énergie disponibles'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="month" stroke="#52525b" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" stroke="#52525b" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#52525b" tick={{ fontSize: 11 }} />
                <Tooltip {...darkTooltipStyle} formatter={(value: number, name: string) => name === 'Coût (mill.)' ? [`${Math.round(value)} mill.`, name] : [`${value.toFixed(1)} kWh`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="energy" stroke="#38bdf8" strokeWidth={2} dot={{ r: 4 }} name="Énergie (kWh)" />
                <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#34d399" strokeWidth={2} dot={{ r: 4 }} name="Coût (mill.)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white backdrop-blur-xl border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-white mb-1">Valeur moyenne par type</h3>
          <p className="text-zinc-500 text-xs mb-5">Moyenne par type de capteur</p>
          {sensorTypeData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-zinc-600 text-sm">{loading ? 'Chargement...' : 'Pas de données disponibles'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sensorTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis type="number" stroke="#52525b" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="category" stroke="#52525b" tick={{ fontSize: 10 }} width={80} />
                <Tooltip {...darkTooltipStyle} />
                <Bar dataKey="avg" fill="#818cf8" radius={[0, 6, 6, 0]} name="Moy." />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white backdrop-blur-xl border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-white mb-1">
  Consommation réelle par jour
</h3>

<p className="text-zinc-500 text-xs mb-5">
  Comparaison quotidienne de la consommation énergétique
</p>

{dailyData.length === 0 ? (
  <div className="h-56 flex items-center justify-center text-zinc-600 text-sm">
    {loading ? 'Chargement...' : 'Pas de données disponibles'}
  </div>
) : (
  <ResponsiveContainer width="100%" height={240}>
    <AreaChart data={dailyData}>
      <defs>
        <linearGradient id="dayGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
        </linearGradient>
      </defs>

      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />

      <XAxis
        dataKey="day"
        stroke="#52525b"
        tick={{ fontSize: 10 }}
      />

      <YAxis
        stroke="#52525b"
        tick={{ fontSize: 11 }}
      />

      <Tooltip
        {...darkTooltipStyle}
        formatter={(value: number) => [`${value.toFixed(2)} kWh`, 'Énergie']}
      />

      <Area
        type="monotone"
        dataKey="energy"
        stroke="#38bdf8"
        fill="url(#dayGrad)"
        strokeWidth={2}
        name="Consommation"
      />
    </AreaChart>
  </ResponsiveContainer>
)}
        </div>

        <div className="bg-white backdrop-blur-xl border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-white mb-5">Dernières mesures</h3>
          <div className="space-y-3">
            {recentReadings.length === 0 ? (
              <p className="text-zinc-600 text-sm">{loading ? 'Chargement...' : 'Aucune mesure'}</p>
            ) : recentReadings.slice(0, 4).map((m, i) => {
              const ts = new Date(m.measuredAt || m.timestamp);
              const isCost = m.sensorType?.toLowerCase() === 'energy';
              return (
                <div key={i} className="p-3 bg-zinc-800/30 rounded-xl border border-zinc-800/40">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-zinc-400 text-xs truncate max-w-[55%]">{m.label || m.sensorId}</span>
                    <span className="font-bold text-sm text-white">{m.value?.toFixed(2)} <span className="text-zinc-500 font-normal text-xs">{m.unit}</span></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 text-xs">{m.roomName || '—'}</span>
                    {isCost && m.value != null && <span className="text-emerald-400 text-xs">{formatMillimes(m.value * COST_PER_KWH_MILLIMES)}</span>}
                  </div>
                  <p className="text-zinc-700 text-xs mt-0.5">{ts.toLocaleString('fr-FR')}</p>
                </div>
              );
            })}
          </div>
          {totalEnergy > 0 && (
            <div className="mt-4 p-3 bg-emerald-900/20 border border-emerald-800/30 rounded-xl">
              <p className="text-emerald-400 text-xs font-medium mb-1">Coût estimé</p>
              <p className="text-white font-bold">{formatMillimes(totalCost)}</p>
              <p className="text-zinc-500 text-xs">pour {totalEnergy.toFixed(1)} kWh × 50 mill.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}