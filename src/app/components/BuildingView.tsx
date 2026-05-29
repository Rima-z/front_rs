import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import { IFCSPACE } from 'web-ifc';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Droplets,
  Layers,
  ShieldAlert,
  Sun,
  Thermometer,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
  Clock,
  MapPin,
} from 'lucide-react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import {
  getAnomalies,
  acknowledgeAnomaly,
  type AnomalyDto,
  type AnomalySeverity,
} from '../../services/api';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface RoomSensorData {
  roomName: string;
  temperature?: number;
  humidity?: number;
  luminosity?: number;
  occupancy?: number;
  lastUpdate?: string;
}

interface SpaceFloorMapping {
  spaceGlobalId: string;
  spaceName: string;
  spaceLongName: string;
  storeyName: string;
  storeyElevation: number;
}

interface SensorMessage {
  roomName: string;
  sensorType: 'temperature' | 'humidity' | 'luminosity' | 'occupancy' | string;
  value: number | null;
  timestamp?: string;
  measuredAt?: string;
}

type IfcModel = THREE.Mesh & {
  modelID: number;
  ifcManager: {
    createSubset: (config: {
      modelID: number;
      ids: number[];
      material: THREE.Material;
      scene?: THREE.Object3D;
      removePrevious: boolean;
      customID?: string;
    }) => THREE.Mesh;
    removeSubset: (modelID: number, material?: THREE.Material, customID?: string) => void;
    getAllItemsOfType: (modelID: number, type: number, verbose: boolean) => Promise<IfcEntity[]>;
    dispose?: () => Promise<void>;
  };
};

type IfcEntityValue<T> = { value?: T };
type IfcEntity = {
  expressID: number;
  GlobalId?: IfcEntityValue<string> | string;
  Name?: IfcEntityValue<string> | string;
  LongName?: IfcEntityValue<string> | string;
};

type CameraTween = {
  startTime: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
};

type UiSeverity = AnomalySeverity | 'unknown';

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function applySensorMessage(cur: RoomSensorData, msg: SensorMessage): void {
  const value = isFiniteNumber(msg.value) ? msg.value : undefined;
  if (msg.sensorType === 'temperature') { if (value !== undefined) cur.temperature = value; else delete cur.temperature; }
  if (msg.sensorType === 'humidity')    { if (value !== undefined) cur.humidity    = value; else delete cur.humidity; }
  if (msg.sensorType === 'luminosity')  { if (value !== undefined) cur.luminosity  = value; else delete cur.luminosity; }
  if (msg.sensorType === 'occupancy')   { if (value !== undefined) cur.occupancy   = value; else delete cur.occupancy; }
  cur.lastUpdate = msg.timestamp ?? msg.measuredAt;
}

function getSpaceRoomName(m: SpaceFloorMapping): string {
  return m.spaceName || m.spaceLongName || m.spaceGlobalId;
}
function getSpaceRoomCandidates(m: SpaceFloorMapping): string[] {
  return [m.spaceGlobalId, m.spaceName, m.spaceLongName].filter(Boolean);
}
function getFloorLabel(storeyName: string): string {
  if (storeyName === 'B1 BASEMENT') return 'B1 Sous-sol';
  if (storeyName.startsWith('1ST FLOOR')) return '1er Étage';
  if (storeyName.startsWith('2ND FLOOR')) return '2ème Étage';
  if (storeyName.startsWith('3RD FLOOR')) return '3ème Étage';
  if (storeyName.startsWith('4TH FLOOR')) return '4ème Étage';
  return storeyName;
}
function countUniqueRooms(mappings: SpaceFloorMapping[], storeyName: string): number {
  return new Set(mappings.filter((s) => s.storeyName === storeyName).map(getSpaceRoomName).filter(Boolean)).size;
}
function getIfcText(value: IfcEntityValue<string> | string | undefined): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value.value ?? '';
}
function getReadableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message);
  return String(error || 'Erreur inconnue');
}
function normalizeIfcKey(value: string): string {
  return value.trim().toLowerCase();
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function containsIfcToken(alias: string, candidate: string): boolean {
  const normalizedAlias = normalizeIfcKey(alias);
  const normalizedCandidate = normalizeIfcKey(candidate);
  if (normalizedCandidate.length < 3) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedCandidate)}([^a-z0-9]|$)`, 'i')
    .test(normalizedAlias);
}
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function getExpressIdsForCandidates(expressIdMap: Map<string, number[]>, candidates: string[]): number[] {
  const cleanCandidates = candidates.map(c => c.trim()).filter(Boolean);

  for (const candidate of cleanCandidates) {
    const normalizedCandidate = normalizeIfcKey(candidate);
    const selectedIds = new Set<number>();
    expressIdMap.forEach((ids, key) => {
      if (normalizeIfcKey(key) === normalizedCandidate) {
        ids.forEach(id => selectedIds.add(id));
      }
    });
    if (selectedIds.size > 0) return [Array.from(selectedIds)[0]];
  }

  for (const candidate of cleanCandidates) {
    const selectedIds = new Set<number>();
    expressIdMap.forEach((ids, key) => {
      if (containsIfcToken(key, candidate)) {
        ids.forEach(id => selectedIds.add(id));
      }
    });
    if (selectedIds.size > 0) return [Array.from(selectedIds)[0]];
  }

  return [];
}

function parseContainedElementsBySpaceGlobalId(ifcText: string): Map<string, number[]> {
  const spaceStepIdToGlobalId = new Map<number, string>();
  const containedByGlobalId = new Map<string, number[]>();
  const wallStepIds = new Set<number>();
  const spaceRegex = /#(\d+)\s*=\s*IFCSPACE\('([^']+)'/g;
  const wallRegex = /#(\d+)\s*=\s*IFCWALL(?:STANDARDCASE)?\(/g;
  let spaceMatch: RegExpExecArray | null;
  let wallMatch: RegExpExecArray | null;

  while ((spaceMatch = spaceRegex.exec(ifcText)) !== null) {
    spaceStepIdToGlobalId.set(Number(spaceMatch[1]), spaceMatch[2]);
  }

  while ((wallMatch = wallRegex.exec(ifcText)) !== null) {
    wallStepIds.add(Number(wallMatch[1]));
  }

  const addIds = (globalId: string, ids: number[]) => {
    if (ids.length === 0) return;
    const existing = containedByGlobalId.get(globalId) ?? [];
    ids.forEach(id => {
      if (!existing.includes(id)) existing.push(id);
    });
    containedByGlobalId.set(globalId, existing);
  };

  const boundaryRegex = /IFCRELSPACEBOUNDARY\([^;]*?,\s*#(\d+)\s*,\s*#(\d+)\s*,\s*#[^,]+,\s*\.PHYSICAL\./g;
  let boundaryMatch: RegExpExecArray | null;

  while ((boundaryMatch = boundaryRegex.exec(ifcText)) !== null) {
    const globalId = spaceStepIdToGlobalId.get(Number(boundaryMatch[1]));
    const relatedElementId = Number(boundaryMatch[2]);
    if (!globalId || !wallStepIds.has(relatedElementId)) continue;
    addIds(globalId, [relatedElementId]);
  }

  return containedByGlobalId;
}

function createMeshForExpressIds(source: THREE.Mesh, expressIds: number[], material: THREE.Material): THREE.Mesh | null {
  const sourceGeometry = source.geometry as THREE.BufferGeometry;
  const position = sourceGeometry.getAttribute('position');
  const normal = sourceGeometry.getAttribute('normal');
  const expressIdAttr =
    sourceGeometry.getAttribute('expressID') ??
    sourceGeometry.getAttribute('expressId') ??
    sourceGeometry.getAttribute('expressid');
  if (!position || !expressIdAttr || expressIds.length === 0) return null;

  const selected = new Set(expressIds);
  const index = sourceGeometry.getIndex();
  const positions: number[] = [];
  const normals: number[] = [];

  const pushVertex = (vertexIndex: number) => {
    positions.push(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));
    if (normal) normals.push(normal.getX(vertexIndex), normal.getY(vertexIndex), normal.getZ(vertexIndex));
  };

  const shouldKeepTriangle = (a: number, b: number, c: number) => {
    const aId = expressIdAttr.getX(a);
    const bId = expressIdAttr.getX(b);
    const cId = expressIdAttr.getX(c);
    return selected.has(aId) || selected.has(bId) || selected.has(cId);
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      if (!shouldKeepTriangle(a, b, c)) continue;
      pushVertex(a);
      pushVertex(b);
      pushVertex(c);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      if (!shouldKeepTriangle(i, i + 1, i + 2)) continue;
      pushVertex(i);
      pushVertex(i + 1);
      pushVertex(i + 2);
    }
  }

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 999;
  return mesh;
}

function tempToCss(t: number): string {
  if (t < 18) return '#1a6fa8';
  if (t < 20) return '#2196f3';
  if (t < 22) return '#16a679';
  if (t < 24) return '#e07b1a';
  return '#c0392b';
}
function tempToHex(t: number): number {
  if (t < 18) return 0x1a6fa8;
  if (t < 20) return 0x2196f3;
  if (t < 22) return 0x16a679;
  if (t < 24) return 0xe07b1a;
  return 0xc0392b;
}
function tempLabel(t: number): string {
  if (t < 18) return "J'ai froid";
  if (t < 20) return "J'ai légèrement froid";
  if (t < 22) return 'Je me sens bien';
  if (t < 24) return "J'ai légèrement chaud";
  if (t < 26) return "J'ai trop chaud";
  return "J'ai vraiment trop chaud";
}
function tempEmoji(t: number): string {
  if (t < 18) return '🥶';
  if (t < 20) return '😐';
  if (t < 22) return '😊';
  if (t < 24) return '😕';
  if (t < 26) return '😣';
  return '😡';
}

// ── Anomaly helpers ───────────────────────────────────────────
function normalizeSeverity(s: string | null | undefined): UiSeverity {
  const v = String(s ?? '').toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low') return v;
  return 'unknown';
}

function parseActions(action: string | null | undefined): string[] {
  if (!action) return [];
  return action.split('→').map(a => a.trim()).filter(Boolean);
}

const anomalyLabels: Record<string, string> = {
  spike: 'Pic soudain', frozen: 'Capteur figé', out_of_range: 'Hors plage',
  unstable: 'Instabilité capteur', multivariate: 'Anomalie multivariée',
};
const anomalyIcons: Record<string, React.ReactNode> = {
  spike:        <Zap className="h-3.5 w-3.5" />,
  frozen:       <Clock className="h-3.5 w-3.5" />,
  out_of_range: <AlertTriangle className="h-3.5 w-3.5" />,
  unstable:     <Thermometer className="h-3.5 w-3.5" />,
  multivariate: <ShieldAlert className="h-3.5 w-3.5" />,
};
const severityLabels: Record<UiSeverity, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible', unknown: 'Inconnue',
};

function getSeverityColor(s: UiSeverity) {
  switch (s) {
    case 'critical': return { badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500', action: 'bg-red-50 border-red-100 text-red-800' };
    case 'high':     return { badge: 'border-orange-200 bg-orange-50 text-orange-700', dot: 'bg-orange-500', action: 'bg-orange-50 border-orange-100 text-orange-800' };
    case 'medium':   return { badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-400', action: 'bg-amber-50 border-amber-100 text-amber-800' };
    case 'low':      return { badge: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-400', action: 'bg-sky-50 border-sky-100 text-sky-800' };
    default:         return { badge: 'border-zinc-200 bg-zinc-50 text-zinc-600', dot: 'bg-zinc-400', action: 'bg-zinc-50 border-zinc-100 text-zinc-700' };
  }
}

// Couleur IFC selon l'anomalie la plus sévère de la pièce
function anomalyToHex(severity: UiSeverity): number {
  switch (severity) {
    case 'critical': return 0xe53e3e;
    case 'high':     return 0xed8936;
    case 'medium':   return 0xecc94b;
    case 'low':      return 0x4299e1;
    default:         return 0xe53e3e;
  }
}

// Retourne la sévérité la plus élevée d'une liste d'anomalies
function worstSeverity(anomalies: AnomalyDto[]): UiSeverity {
  const order: UiSeverity[] = ['critical', 'high', 'medium', 'low', 'unknown'];
  for (const s of order) {
    if (anomalies.some(a => normalizeSeverity(a.severity) === s)) return s;
  }
  return 'unknown';
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

// ─────────────────────────────────────────────────────────────
// Seed Data
// ─────────────────────────────────────────────────────────────

const SEED_DATA: RoomSensorData[] = [
  { roomName: 'B106', temperature: 22.1 },
  { roomName: 'B108', temperature: 23.4 },
  { roomName: 'B109', temperature: 25.54, humidity: 59.54 },
  { roomName: 'B110', temperature: 21.8 },
  { roomName: 'B111', temperature: 25.01, humidity: 44.82 },
  { roomName: 'B112', temperature: 22.9 },
  { roomName: 'B113', temperature: 24.73 },
  { roomName: 'B116', temperature: 21.0, occupancy: 1 },
  { roomName: 'B117', temperature: 22.3 },
  { roomName: 'B118', temperature: 23.1 },
  { roomName: 'B123', temperature: 25.22, humidity: 45.22 },
  { roomName: 'B135', temperature: 25.75, humidity: 53 },
  { roomName: 'B137', temperature: 32.55, humidity: 29.83 },
  { roomName: 'B139', temperature: 20.73, humidity: 43.44 },
  { roomName: 'B140', temperature: 21.5 },
  { roomName: 'B142', temperature: 22.0, occupancy: 1 },
  { roomName: 'B147', temperature: 23.8 },
  { roomName: 'B148', temperature: 25.77 },
  { roomName: 'B150', temperature: 25.47 },
  { roomName: 'B152', temperature: 24.67 },
];

const FALLBACK_FLOORS = [
  { key: 'B1 BASEMENT', label: 'B1 Sous-sol' },
  { key: '1ST FLOOR - ARCH', label: '1er Étage' },
  { key: '2ND FLOOR', label: '2ème Étage' },
  { key: '3RD FLOOR', label: '3ème Étage' },
  { key: '4TH FLOOR', label: '4ème Étage' },
];

// ─────────────────────────────────────────────────────────────
// AnomalyCard sub-component
// ─────────────────────────────────────────────────────────────

function AnomalyCard({
  anomaly,
  onAcknowledge,
  ackLoading,
}: {
  anomaly: AnomalyDto;
  onAcknowledge: (id: number) => void;
  ackLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const severity = normalizeSeverity(anomaly.severity);
  const colors   = getSeverityColor(severity);
  const actions  = parseActions((anomaly as any).action);

  return (
    <div className={`rounded-2xl border border-l-4 ${severity === 'critical' ? 'border-l-red-400' : severity === 'high' ? 'border-l-orange-400' : severity === 'medium' ? 'border-l-amber-400' : 'border-l-sky-400'} border-zinc-100 bg-white/90 shadow-sm`}>
      <div className="p-4">
        {/* Badges */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${colors.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
            {severityLabels[severity]}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {anomalyIcons[anomaly.anomaly_type] ?? <ShieldAlert className="h-3 w-3" />}
            {anomalyLabels[anomaly.anomaly_type] ?? anomaly.anomaly_type}
          </span>
          <span className="ml-auto text-xs text-zinc-400">{formatDate(anomaly.detected_at)}</span>
        </div>

        {/* Détail */}
        <p className="text-xs leading-relaxed text-zinc-700">{anomaly.detail ?? 'Aucun détail.'}</p>

        {/* Métriques */}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
          {anomaly.sensor_id && <span>Capteur : <span className="font-medium text-zinc-700">{anomaly.sensor_id}</span></span>}
          {anomaly.value !== null && anomaly.value !== undefined && <span>Valeur : <span className="font-medium text-zinc-700">{Number(anomaly.value).toFixed(2)}</span></span>}
          {anomaly.z_score !== null && anomaly.z_score !== undefined && <span>Z-score : <span className="font-medium text-zinc-700">{Number(anomaly.z_score).toFixed(2)}</span></span>}
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {actions.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100"
            >
              <Wrench className="h-3 w-3" />
              Mesures
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
          {!anomaly.acknowledged && (
            <button
              onClick={() => onAcknowledge(anomaly.id)}
              disabled={ackLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3 w-3" />
              {ackLoading ? '…' : 'Acquitter'}
            </button>
          )}
          {anomaly.acknowledged && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Acquittée
            </span>
          )}
        </div>
      </div>

      {/* Bloc mesures expandable */}
      {expanded && actions.length > 0 && (
        <div className={`mx-4 mb-4 rounded-xl border p-3 ${colors.action}`}>
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider opacity-70">
            <Wrench className="h-3 w-3" /> Mesures recommandées
          </p>
          <ol className="space-y-1.5">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/60 text-xs font-bold">{i + 1}</span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BuildingView
// ─────────────────────────────────────────────────────────────

export function BuildingView() {
  const mountRef            = useRef<HTMLDivElement>(null);
  const sceneRef            = useRef<THREE.Scene | null>(null);
  const cameraRef           = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef         = useRef<OrbitControls | null>(null);
   const animFrameRef        = useRef<number>(0);
   const ifcModelRef         = useRef<IfcModel | null>(null);
   const spaceExpressIdMapRef = useRef<Map<string, number[]>>(new Map());
   const spaceGlobalIdToExpressIdRef = useRef<Map<string, number>>(new Map());
   const spaceGlobalIdToContainedExpressIdsRef = useRef<Map<string, number[]>>(new Map());
   const selectedSubsetRef   = useRef<THREE.Mesh | null>(null);
   const modelBoxRef         = useRef<THREE.Box3 | null>(null);
   const cameraTweenRef      = useRef<CameraTween | null>(null);
   const originalMaterialsRef = useRef<any>(null);

   // Matériaux de sélection : normal (orange) et anomalie (rouge)
   const selectionMaterialRef = useRef(
     new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.35, depthTest: true, depthWrite: false, side: THREE.DoubleSide })
   );
   const anomalyMaterialRef = useRef(
     new THREE.MeshBasicMaterial({ color: 0xe53e3e, transparent: true, opacity: 0.35, depthTest: true, depthWrite: false, side: THREE.DoubleSide })
   );
  // Map roomName → matériau de surbrillance anomalie (un subset par pièce anomale)
  const anomalySubsetsRef = useRef<Map<string, THREE.Mesh>>(new Map());

  const [rooms, setRooms] = useState<Map<string, RoomSensorData>>(() => {
    const m = new Map<string, RoomSensorData>();
    SEED_DATA.forEach(r => m.set(r.roomName, r));
    return m;
  });

  const [spaceFloorMap,    setSpaceFloorMap]    = useState<SpaceFloorMapping[]>([]);
  const [selectedFloor,    setSelectedFloor]    = useState<string>('B1 BASEMENT');
  const [selectedRoom,     setSelectedRoom]     = useState<string | null>(null);
  const [selectedSpaceGlobalId, setSelectedSpaceGlobalId] = useState<string | null>(null);
  const [wsConnected,      setWsConnected]      = useState(false);
  const [modelStatus,      setModelStatus]      = useState<'loading' | 'loaded' | 'error'>('loading');
  const [modelError,       setModelError]       = useState('');
  const [showLegend,       setShowLegend]       = useState(true);
  const [selectedRoomHasGeometry, setSelectedRoomHasGeometry] = useState(false);

  // ── Anomalies depuis anomaly-service ─────────────────────────
  const [allAnomalies,   setAllAnomalies]   = useState<AnomalyDto[]>([]);
  const [ackLoadingId,   setAckLoadingId]   = useState<number | null>(null);

  // roomName → liste d'anomalies actives (non acquittées)
  const anomalyByRoom = useMemo(() => {
    const map = new Map<string, AnomalyDto[]>();
    allAnomalies
      .filter(a => !a.acknowledged)
      .forEach(a => {
        const key = a.room_name?.trim();
        if (!key) return;
        const list = map.get(key) ?? [];
        list.push(a);
        map.set(key, list);
      });
    return map;
  }, [allAnomalies]);

  // Fetch anomalies toutes les 30s
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const data = await getAnomalies({ limit: 500 });
        setAllAnomalies(Array.isArray(data) ? data : []);
      } catch { /* service peut être absent */ }
    };
    fetch_();
    const id = window.setInterval(fetch_, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Anomalies pour la pièce sélectionnée
  const roomAnomalies = useMemo(() =>
    selectedRoom ? (anomalyByRoom.get(selectedRoom) ?? []) : [],
  [selectedRoom, anomalyByRoom]);

  const handleAcknowledge = async (id: number) => {
    try {
      setAckLoadingId(id);
      await acknowledgeAnomaly(id);
      setAllAnomalies(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
    } catch { /* ignore */ } finally {
      setAckLoadingId(null);
    }
  };

  // ── API espaces ───────────────────────────────────────────────
  useEffect(() => {
    fetch('http://localhost:8084/api/building/spaces-floors')
      .then(r => r.json())
      .then((data: SpaceFloorMapping[]) => setSpaceFloorMap(data))
      .catch(() => {});
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────
  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8084/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        setWsConnected(true);
        client.subscribe('/topic/sensor-data', (message) => {
          try {
            const msg = JSON.parse(message.body) as SensorMessage;
            setRooms(prev => {
              const next = new Map(prev);
              const cur: RoomSensorData = { ...(next.get(msg.roomName) ?? { roomName: msg.roomName }) };
              applySensorMessage(cur, msg);
              next.set(msg.roomName, cur);
              return next;
            });
          } catch { }
        });
      },
      onDisconnect:     () => setWsConnected(false),
      onWebSocketClose: () => setWsConnected(false),
      onStompError:     () => setWsConnected(false),
      onWebSocketError: () => setWsConnected(false),
    });
    client.activate();
    return () => { client.deactivate(); };
  }, []);

  // ── Polling fallback ──────────────────────────────────────────
  useEffect(() => {
    if (wsConnected) return;
    const poll = () => {
      fetch('http://localhost:8084/api/realtime')
        .then(r => r.json())
        .then((data: SensorMessage[]) => {
          setRooms(prev => {
            const next = new Map(prev);
            data.forEach(msg => {
              const cur: RoomSensorData = { ...(next.get(msg.roomName) ?? { roomName: msg.roomName }) };
              applySensorMessage(cur, msg);
              next.set(msg.roomName, cur);
            });
            return next;
          });
        })
        .catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, [wsConnected]);

  // ── Three.js init ─────────────────────────────────────────────
  const focusCameraOnBox = (box: THREE.Box3, zoom = 1.35) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxSize   = Math.max(size.x, size.y, size.z, 1);
    const distance  = (maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * zoom;
    const currentDirection = camera.position.clone().sub(controls.target);
    const direction = currentDirection.lengthSq() > 0
      ? currentDirection.normalize()
      : new THREE.Vector3(1, 0.8, 1).normalize();
    cameraTweenRef.current = {
      startTime: performance.now(), duration: 850,
      fromPosition: camera.position.clone(),
      toPosition:   center.clone().add(direction.multiplyScalar(distance)),
      fromTarget:   controls.target.clone(),
      toTarget:     center,
    };
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0xffffff, 1);
    renderer.sortObjects = true;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f0e4);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000);
    camera.position.set(40, 30, 60);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(50, 80, 40);
    scene.add(dir);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    const onResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const tween = cameraTweenRef.current;
      if (tween) {
        const progress = Math.min((performance.now() - tween.startTime) / tween.duration, 1);
        const eased    = easeInOutCubic(progress);
        camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
        if (progress >= 1) cameraTweenRef.current = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    let isDisposed = false;
    setModelStatus('loading');
    const loader = new IFCLoader();

    const handleLoadError = (error: unknown) => {
      if (isDisposed) return;
      setModelStatus('error');
      setModelError(`Le fichier existe, mais le viewer IFC n'a pas pu le charger: ${getReadableError(error)}`);
    };

    void (async () => {
      try { await loader.ifcManager.setWasmPath('/wasm/'); } catch (e) { handleLoadError(e); return; }
      try {
        const ifcText = await fetch('/models/otc.enriched.ifc').then(r => r.text());
        spaceGlobalIdToContainedExpressIdsRef.current = parseContainedElementsBySpaceGlobalId(ifcText);
      } catch {
        spaceGlobalIdToContainedExpressIdsRef.current.clear();
      }
       loader.load('/models/otc.enriched.ifc', async (ifc) => {
         if (isDisposed) return;
         try {
           const ifcModel = ifc as IfcModel;
           ifcModelRef.current = ifcModel;
           // Store the original materials for later use when selecting a room
           if (originalMaterialsRef.current === null) {
             originalMaterialsRef.current = ifcModel.material;
           }
           spaceExpressIdMapRef.current.clear();
           spaceGlobalIdToExpressIdRef.current.clear();
           scene.add(ifcModel);

          const spaces = await ifcModel.ifcManager.getAllItemsOfType(ifcModel.modelID, IFCSPACE, true);
          spaces.forEach(space => {
            const expressID = space.expressID;
            const globalId = getIfcText(space.GlobalId);
            if (globalId) spaceGlobalIdToExpressIdRef.current.set(globalId, expressID);
            [getIfcText(space.GlobalId), getIfcText(space.Name), getIfcText(space.LongName)]
              .filter(Boolean)
              .forEach(alias => {
                const list = spaceExpressIdMapRef.current.get(alias) ?? [];
                if (!list.includes(expressID)) list.push(expressID);
                spaceExpressIdMapRef.current.set(alias, list);
              });
          });

          const baseMaterials = Array.isArray(ifcModel.material) ? ifcModel.material : [ifcModel.material];
          baseMaterials.forEach(mat => {
            mat.transparent = true; mat.opacity = 1.0; mat.needsUpdate = true;
          });
          (ifcModel as any).__baseMaterials = baseMaterials;

          const box = new THREE.Box3().setFromObject(ifcModel);
          modelBoxRef.current = box.clone();
          const center = box.getCenter(new THREE.Vector3());
          const size   = box.getSize(new THREE.Vector3());
          const radius = Math.max(size.x, size.y, size.z);
          controls.target.copy(center);
          camera.position.copy(center.clone().add(new THREE.Vector3(radius * 1.6, radius * 1.1, radius * 1.8)));
          camera.near = Math.max(radius / 100, 0.1);
          camera.far  = Math.max(radius * 100, 5000);
          camera.updateProjectionMatrix();
          setModelStatus('loaded');
        } catch (e) { handleLoadError(e); }
      }, undefined, handleLoadError);
    })();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', onResize);
      if (ifcModelRef.current) {
        scene.remove(ifcModelRef.current);
        ifcModelRef.current.ifcManager.dispose?.();
      }
      selectionMaterialRef.current.dispose();
      anomalyMaterialRef.current.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // ── Surbrillance des pièces anomales dans le modèle IFC ───────
  // Dès que les anomalies changent ou que le modèle est chargé,
  // on recolore toutes les pièces anomales en rouge/orange dans le modèle
  useEffect(() => {
    const ifcModel = ifcModelRef.current;
    const scene    = sceneRef.current;
    if (!ifcModel || !scene || modelStatus !== 'loaded') return;

    // Supprimer les anciens subsets anomalie
    anomalySubsetsRef.current.forEach((_, roomName) => {
      ifcModel.ifcManager.removeSubset(ifcModel.modelID, undefined, `anomaly-${roomName}`);
    });
    anomalySubsetsRef.current.clear();

    // Créer un subset rouge pour chaque pièce anomale
    anomalyByRoom.forEach((anomalies, roomName) => {
      if (anomalies.length === 0) return;
      const severity = worstSeverity(anomalies);
      const color    = anomalyToHex(severity);

       const mat = new THREE.MeshBasicMaterial({
         color, transparent: true, opacity: 0.35,
         depthTest: true, depthWrite: false,
       });

      const candidates = [roomName];
      const expressIds = getExpressIdsForCandidates(spaceExpressIdMapRef.current, candidates);
      if (expressIds.length === 0) return;

      try {
        const subset = ifcModel.ifcManager.createSubset({
          modelID: ifcModel.modelID,
          ids: expressIds,
          material: mat,
          scene,
          removePrevious: false,
          customID: `anomaly-${roomName}`,
        });
        subset.visible = !selectedRoom;
        anomalySubsetsRef.current.set(roomName, subset);
      } catch { /* pièce sans géométrie */ }
    });
  }, [anomalyByRoom, modelStatus, selectedRoom]);

  // ── Sélection d'une pièce + mode fantôme ─────────────────────
  const roomToIfcCandidates = useMemo(() => {
    const map = new Map<string, string[]>();
    if (spaceFloorMap.length === 0) {
      rooms.forEach((_, k) => map.set(k, [k]));
      return map;
    }
    spaceFloorMap.filter(s => s.storeyName === selectedFloor).forEach(mapping => {
      const roomName = getSpaceRoomName(mapping);
      if (roomName) map.set(roomName, getSpaceRoomCandidates(mapping));
    });
    return map;
  }, [spaceFloorMap, selectedFloor, rooms]);

  const roomToGlobalIds = useMemo(() => {
    const map = new Map<string, string[]>();
    spaceFloorMap.filter(s => s.storeyName === selectedFloor).forEach(mapping => {
      const roomName = getSpaceRoomName(mapping);
      if (!roomName) return;
      const existing = map.get(roomName) ?? [];
      if (mapping.spaceGlobalId && !existing.includes(mapping.spaceGlobalId)) existing.push(mapping.spaceGlobalId);
      map.set(roomName, existing);
    });
    return map;
  }, [spaceFloorMap, selectedFloor]);

  useEffect(() => {
    const ifcModel = ifcModelRef.current;
    const scene    = sceneRef.current;
    if (!ifcModel || !scene || modelStatus !== 'loaded') return;

    const baseMaterials: THREE.MeshStandardMaterial[] =
      (ifcModel as any).__baseMaterials ??
      (Array.isArray(ifcModel.material) ? ifcModel.material : [ifcModel.material]);

    ifcModel.visible = true;

    if (selectedRoom) {
      baseMaterials.forEach(mat => { mat.transparent = true; mat.opacity = 0.14; mat.depthWrite = false; mat.needsUpdate = true; });
    } else {
      baseMaterials.forEach(mat => { mat.transparent = false; mat.opacity = 1.0; mat.depthWrite = true; mat.needsUpdate = true; });
    }

    anomalySubsetsRef.current.forEach((subset) => {
      subset.visible = !selectedRoom;
    });

    const selectedIfcMapping = selectedSpaceGlobalId
      ? spaceFloorMap.find(s => s.spaceGlobalId === selectedSpaceGlobalId)
      : null;
    const ifcCandidates = selectedRoom
      ? selectedIfcMapping
        ? getSpaceRoomCandidates(selectedIfcMapping)
        : (roomToIfcCandidates.get(selectedRoom) ?? [selectedRoom])
      : [];
    const globalIds     = selectedRoom
      ? selectedSpaceGlobalId
        ? [selectedSpaceGlobalId]
        : (roomToGlobalIds.get(selectedRoom) ?? [])
      : [];

    const selectedExpressId = selectedSpaceGlobalId
      ? spaceGlobalIdToExpressIdRef.current.get(selectedSpaceGlobalId)
      : undefined;
    const selectedContainedExpressIds = selectedSpaceGlobalId
      ? spaceGlobalIdToContainedExpressIdsRef.current.get(selectedSpaceGlobalId) ?? []
      : [];
    const selectedExpressIds = selectedRoom
      ? selectedExpressId !== undefined
        ? [selectedExpressId]
        : getExpressIdsForCandidates(spaceExpressIdMapRef.current, [...globalIds, ...ifcCandidates, selectedRoom])
      : [];

     ifcModel.ifcManager.removeSubset(ifcModel.modelID, undefined, 'selected-space');
     if (selectedSubsetRef.current) {
       selectedSubsetRef.current.parent?.remove(selectedSubsetRef.current);
       selectedSubsetRef.current.geometry?.dispose();
       if (selectedSubsetRef.current.userData?.customMaterial) {
         selectedSubsetRef.current.userData.customMaterial.dispose();
       }
       selectedSubsetRef.current = null;
     }

     if (selectedRoom && selectedExpressIds.length > 0) {
       const hasAnomaly = (anomalyByRoom.get(selectedRoom) ?? []).length > 0;
       const severity   = worstSeverity(anomalyByRoom.get(selectedRoom) ?? []);

       // Couleur de sélection : rouge si anomalie, orange sinon
       selectionMaterialRef.current.color.setHex(hasAnomaly ? anomalyToHex(severity) : 0xf5a623);
       selectionMaterialRef.current.needsUpdate = true;

        try {
          let materialToUse;
          if (originalMaterialsRef.current) {
            const originalMaterial = originalMaterialsRef.current;
            // Clone the material to preserve original appearance
            if (Array.isArray(originalMaterial)) {
              materialToUse = originalMaterial[0].clone();
            } else {
              materialToUse = originalMaterial.clone();
            }
            // Ensure the selected room is fully visible (opaque)
            materialToUse.opacity = 1.0;
            materialToUse.needsUpdate = true;
          } else {
            // Fallback to a visible material if we don't have original materials
            selectionMaterialRef.current.color.setHex(0xffffff); // white
            selectionMaterialRef.current.opacity = 1.0;
            selectionMaterialRef.current.needsUpdate = true;
            materialToUse = selectionMaterialRef.current;
          }

          const subset = createMeshForExpressIds(ifcModel, selectedExpressIds, materialToUse);
          if (!subset) {
            setSelectedRoomHasGeometry(false);
            return;
          }
          // Store the material we created (if it's a clone) so we can dispose it later
          if (materialToUse !== selectionMaterialRef.current && materialToUse.userData?.clone === undefined) {
            subset.userData.customMaterial = materialToUse;
          }
          scene.add(subset);
          selectedSubsetRef.current = subset;
          const box = new THREE.Box3().setFromObject(subset);
          const hasGeometry = !box.isEmpty();
          setSelectedRoomHasGeometry(hasGeometry);
          if (hasGeometry) focusCameraOnBox(box, 1.45);
        } catch { setSelectedRoomHasGeometry(false); }
    } else {
      setSelectedRoomHasGeometry(false);
    }

    if (!selectedRoom && modelBoxRef.current) focusCameraOnBox(modelBoxRef.current, 2.4);
  }, [selectedRoom, selectedSpaceGlobalId, spaceFloorMap, roomToIfcCandidates, roomToGlobalIds, modelStatus, anomalyByRoom]);

  // ── Données dérivées ──────────────────────────────────────────
  const roomsOnFloor = useMemo(() => {
    if (spaceFloorMap.length === 0) {
      return Array.from(rooms.values()).map(r => ({ ...r, ifcCandidates: [r.roomName], spaceGlobalIds: [] as string[] }));
    }
    const seen = new Set<string>();
    return spaceFloorMap
      .filter(s => s.storeyName === selectedFloor)
      .map(mapping => {
        const roomName      = getSpaceRoomName(mapping);
        const ifcCandidates = getSpaceRoomCandidates(mapping);
        const sensorData    = ifcCandidates.map(c => rooms.get(c)).find(Boolean);
        return { ...(sensorData ?? {}), roomName, ifcCandidates, spaceGlobalIds: [mapping.spaceGlobalId].filter(Boolean) };
      })
      .filter(room => {
        if (!room.roomName || seen.has(room.roomName)) return false;
        seen.add(room.roomName);
        return true;
      })
      .sort((a, b) => a.roomName.localeCompare(b.roomName, 'fr', { numeric: true }));
  }, [rooms, spaceFloorMap, selectedFloor]);

  const floorOptions = useMemo(() => {
    if (spaceFloorMap.length === 0) return FALLBACK_FLOORS;
    const byName = new Map<string, { key: string; label: string; elevation: number }>();
    spaceFloorMap.forEach(mapping => {
      if (!mapping.storeyName || byName.has(mapping.storeyName)) return;
      byName.set(mapping.storeyName, { key: mapping.storeyName, label: getFloorLabel(mapping.storeyName), elevation: mapping.storeyElevation ?? Number.MAX_SAFE_INTEGER });
    });
    return Array.from(byName.values()).sort((a, b) =>
      a.elevation !== b.elevation ? a.elevation - b.elevation : a.key.localeCompare(b.key, 'fr', { numeric: true })
    );
  }, [spaceFloorMap]);

  const selectedMapping = selectedRoom
    ? selectedSpaceGlobalId
      ? spaceFloorMap.find(s => s.spaceGlobalId === selectedSpaceGlobalId)
      : spaceFloorMap.find(s => getSpaceRoomCandidates(s).includes(selectedRoom))
    : null;
  const selectedData = selectedRoom
    ? rooms.get(selectedRoom) ?? roomsOnFloor.find(r => r.roomName === selectedRoom) ?? null
    : null;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'radial-gradient(circle at top left, #f7f4ed 0, #ece5d6 38%, #e7ebef 100%)' }}>

      {/* HEADER */}
      <header className="mx-6 mt-6 rounded-[32px] border border-white/80 bg-white/70 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Jumeau numérique</p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-800">Visualisation du bâtiment</h1>
            <p className="mt-1 text-sm text-zinc-500">Données capteurs IoT en temps réel</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Badge anomalies global */}
            {anomalyByRoom.size > 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" />
                <div>
                  <p className="font-medium">{anomalyByRoom.size} salle{anomalyByRoom.size > 1 ? 's' : ''} en anomalie</p>
                  <p className="text-xs opacity-70">{allAnomalies.filter(a => !a.acknowledged).length} alertes actives</p>
                </div>
              </div>
            )}
            <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${wsConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}>
              {wsConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              <div>
                <p className="font-medium">{wsConnected ? 'Temps réel actif' : 'Mode polling REST'}</p>
                <p className="text-xs opacity-70">{wsConnected ? 'WebSocket connecté' : 'Mise à jour 30s'}</p>
              </div>
            </div>
            <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${modelStatus === 'loaded' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : modelStatus === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}>
              <Layers className="h-4 w-4" />
              <div>
                <p className="font-medium">{modelStatus === 'loading' ? 'Chargement…' : modelStatus === 'loaded' ? 'Modèle IFC chargé' : 'Erreur modèle'}</p>
                <p className="text-xs opacity-70">{modelStatus === 'loaded' ? 'Espaces IFC sélectionnables' : modelStatus === 'loading' ? 'IFC + Three.js init' : 'Vérifiez otc.enriched.ifc'}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 gap-6 overflow-hidden p-6">

        {/* ASIDE GAUCHE — étages */}
        <aside className="w-64 overflow-y-auto rounded-[30px] border border-white/80 bg-white/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl" style={{ maxHeight: 'calc(100vh - 100px)' }}>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-zinc-500">Étages</p>
          {floorOptions.map(f => {
            const count      = countUniqueRooms(spaceFloorMap, f.key);
            const isActive   = selectedFloor === f.key;
            // Nombre d'anomalies sur cet étage
            const floorRooms = spaceFloorMap.filter(s => s.storeyName === f.key).map(getSpaceRoomName);
            const floorAnomalyCount = floorRooms.filter(r => anomalyByRoom.has(r)).length;
            return (
              <button
                key={f.key}
                onClick={() => { setSelectedFloor(f.key); setSelectedRoom(null); setSelectedSpaceGlobalId(null); }}
                className={`mb-3 flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all ${isActive ? 'border-zinc-300 bg-[#efe2ba] shadow-sm' : 'border-zinc-100 bg-zinc-50/60 hover:bg-zinc-100/80'}`}
              >
                <div className="flex items-center gap-3">
                  <Layers className="h-4 w-4 text-zinc-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{f.label}</p>
                    <p className="text-xs text-zinc-500">{count} pièces</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {floorAnomalyCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                      {floorAnomalyCount}
                    </span>
                  )}
                  {isActive && <ChevronRight className="h-4 w-4 text-zinc-500" />}
                </div>
              </button>
            );
          })}
        </aside>

        {/* CENTRE — canvas 3D */}
        <div className="flex-1 relative h-[600px] overflow-hidden rounded-[30px] border border-white/80 bg-white/60 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          <div ref={mountRef} className="h-full w-full" />

          {modelStatus === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="mx-4 rounded-3xl border border-red-200 bg-white/90 p-8 shadow-xl backdrop-blur-xl">
                <div className="flex items-center gap-3 text-red-600">
                  <AlertTriangle className="h-6 w-6" />
                  <p className="text-lg font-semibold">Fichier IFC introuvable</p>
                </div>
                <p className="mt-3 text-sm text-zinc-600">{modelError}</p>
              </div>
            </div>
          )}

          {showLegend && (
            <div className="absolute right-5 top-5 w-60 overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-lg backdrop-blur-xl">
              <div className="border-b border-zinc-100 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Confort thermique</p>
              </div>
              {[
                { label: "Vraiment trop chaud", bg: '#c0392b', emoji: '😡', range: '> 26°C' },
                { label: "Trop chaud",           bg: '#c0392b', emoji: '😣', range: '24–26°C' },
                { label: "Légèrement chaud",     bg: '#e07b1a', emoji: '😕', range: '22–24°C' },
                { label: 'Je me sens bien',       bg: '#16a679', emoji: '😊', range: '20–22°C' },
                { label: "Légèrement froid",      bg: '#2196f3', emoji: '😐', range: '18–20°C' },
                { label: "Froid",                 bg: '#1a6fa8', emoji: '🥶', range: '< 18°C' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 last:border-0">
                  <span className="text-base">{item.emoji}</span>
                  <div className="flex-1 rounded-lg px-2 py-1 text-xs font-medium text-white" style={{ backgroundColor: item.bg }}>{item.label}</div>
                  <span className="text-xs text-zinc-400 whitespace-nowrap">{item.range}</span>
                </div>
              ))}
              {/* Légende anomalies */}
              <div className="border-t border-zinc-100 px-4 py-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">Anomalies</p>
                {[
                  { color: '#e53e3e', label: 'Critique' },
                  { color: '#ed8936', label: 'Haute' },
                  { color: '#ecc94b', label: 'Moyenne' },
                  { color: '#4299e1', label: 'Faible' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2 py-1">
                    <span className="h-3 w-3 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-zinc-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setShowLegend(v => !v)}
            className="absolute bottom-5 right-5 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-zinc-700 shadow-sm backdrop-blur-xl transition hover:bg-white"
          >
            {showLegend ? 'Masquer légende' : 'Afficher légende'}
          </button>
        </div>

        {/* ASIDE DROITE */}
        <aside className="w-80 rounded-[30px] border border-white/80 bg-white/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl" style={{ maxHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>

          {selectedData ? (
            /* ── Vue détail pièce ── */
            <div className="flex flex-col h-full overflow-y-auto gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-semibold text-zinc-800">{selectedData.roomName}</h2>
                    {roomAnomalies.length > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                        <AlertTriangle className="h-3 w-3" />
                        {roomAnomalies.length} alerte{roomAnomalies.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">Informations capteurs</p>
                </div>
                <button
                  onClick={() => { setSelectedRoom(null); setSelectedSpaceGlobalId(null); }}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-100"
                >✕</button>
              </div>

              {/* Température */}
              {isFiniteNumber(selectedData.temperature) && (
                <div
                  className="rounded-3xl p-6 text-center text-white shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${tempToCss(selectedData.temperature)}, ${tempToCss(selectedData.temperature)}99)` }}
                >
                  <p className="text-5xl font-bold">{selectedData.temperature.toFixed(1)}°C</p>
                  <p className="mt-2 text-3xl">{tempEmoji(selectedData.temperature)}</p>
                  <p className="mt-2 text-sm font-medium opacity-90">{tempLabel(selectedData.temperature)}</p>
                </div>
              )}

              {/* Capteurs */}
              <div className="space-y-2">
                {isFiniteNumber(selectedData.humidity) && (
                  <SensorRow icon={<Droplets className="h-4 w-4 text-sky-500" />} label="Humidité" value={`${selectedData.humidity.toFixed(1)} %`} />
                )}
                {isFiniteNumber(selectedData.luminosity) && (
                  <SensorRow icon={<Sun className="h-4 w-4 text-amber-500" />} label="Luminosité" value={`${selectedData.luminosity} %`} />
                )}
                {isFiniteNumber(selectedData.occupancy) && (
                  <SensorRow icon={<Users className="h-4 w-4 text-emerald-500" />} label="Occupation" value={selectedData.occupancy > 0 ? 'Occupée 🔴' : 'Libre 🟢'} />
                )}
                {selectedData.lastUpdate && (
                  <SensorRow icon={<span className="text-base">🕐</span>} label="Mise à jour" value={new Date(selectedData.lastUpdate).toLocaleTimeString('fr-FR')} />
                )}
              </div>

              {/* ── Bloc anomalies de la pièce ── */}
              {roomAnomalies.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-red-700">
                      {roomAnomalies.length} anomalie{roomAnomalies.length > 1 ? 's' : ''} détectée{roomAnomalies.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {roomAnomalies.map(anomaly => (
                      <AnomalyCard
                        key={anomaly.id}
                        anomaly={anomaly}
                        onAcknowledge={handleAcknowledge}
                        ackLoading={ackLoadingId === anomaly.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Localisation */}
              {selectedMapping && (
                <div className="rounded-2xl bg-[#f5f0e4] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Localisation</p>
                  <p className="mt-2 font-semibold text-zinc-800">{selectedMapping.storeyName}</p>
                  <p className="mt-1 text-sm text-zinc-500">{selectedMapping.spaceLongName}</p>
                </div>
              )}

              <button
                onClick={() => { setSelectedRoom(null); setSelectedSpaceGlobalId(null); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à la liste
              </button>
            </div>

          ) : (
            /* ── Vue liste des pièces ── */
            <div className="flex flex-col h-full">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Pièces de l'étage</p>
                <p className="text-sm font-medium text-zinc-600">{floorOptions.find(f => f.key === selectedFloor)?.label}</p>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {roomsOnFloor.map(r => {
                  const isSelected   = selectedRoom === r.roomName;
                  const roomAnoms    = anomalyByRoom.get(r.roomName) ?? [];
                  const hasAnomaly   = roomAnoms.length > 0;
                  const worst        = worstSeverity(roomAnoms);

                  return (
                    <div
                      key={r.roomName}
                      onClick={() => {
                        setSelectedRoom(r.roomName);
                        setSelectedSpaceGlobalId(r.spaceGlobalIds[0] ?? null);
                      }}
                      className={`cursor-pointer rounded-2xl border p-3 transition-all ${
                        isSelected
                          ? hasAnomaly
                            ? 'border-red-300 bg-red-50 shadow-md ring-2 ring-red-200/60'
                            : 'border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-300/50'
                          : hasAnomaly
                          ? 'border-red-200 bg-red-50/60 hover:border-red-300 hover:bg-red-50'
                          : 'border-zinc-100 bg-zinc-50/80 hover:border-zinc-200 hover:bg-zinc-100/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isSelected && <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${hasAnomaly ? 'bg-red-500' : 'bg-amber-400'}`} />}
                          {hasAnomaly && !isSelected && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                          <div>
                            <p className={`font-medium text-sm ${isSelected ? (hasAnomaly ? 'text-red-800' : 'text-amber-800') : hasAnomaly ? 'text-red-700' : 'text-zinc-800'}`}>
                              {r.roomName}
                            </p>
                            {hasAnomaly && (
                              <p className="mt-0.5 text-xs text-red-500">
                                {roomAnoms.length} alerte{roomAnoms.length > 1 ? 's' : ''} — {severityLabels[worst]}
                              </p>
                            )}
                            {!hasAnomaly && (r.occupancy ?? 0) > 0 && (
                              <p className="mt-0.5 text-xs text-amber-600">● Occupée</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {isFiniteNumber(r.temperature) ? (
                            <>
                              <p className="text-base font-bold" style={{ color: hasAnomaly ? '#e53e3e' : tempToCss(r.temperature) }}>
                                {r.temperature.toFixed(1)}°C
                              </p>
                              <p className="text-xs">{hasAnomaly ? '⚠️' : tempEmoji(r.temperature)}</p>
                            </>
                          ) : (
                            <p className="text-xs text-zinc-400">{hasAnomaly ? '⚠️' : 'Sans mesure'}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {roomsOnFloor.length === 0 && (
                  <div className="text-center text-zinc-500 py-8">
                    <p>Aucune pièce trouvée</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────

const SensorRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-zinc-50/80 p-3">
    <div className="flex items-center gap-3">
      <span>{icon}</span>
      <span className="text-sm text-zinc-600">{label}</span>
    </div>
    <span className="font-semibold text-zinc-800 text-sm">{value}</span>
  </div>
); 