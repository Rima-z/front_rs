import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Thermometer,
  Wrench,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  acknowledgeAnomaly,
  getAnomalies,
  type AnomalyDto,
  type AnomalySeverity,
} from '../../services/api';

type SeverityFilter = AnomalySeverity | 'all';
type UiSeverity = AnomalySeverity | 'unknown';

const severityLabels: Record<UiSeverity, string> = {
  critical: 'Critique',
  high:     'Haute',
  medium:   'Moyenne',
  low:      'Faible',
  unknown:  'Inconnue',
};

// Labels traduits pour les types d'anomalie du microservice Python
const anomalyLabels: Record<string, string> = {
  // Règles simples
  spike:        'Pic soudain',
  frozen:       'Capteur figé',
  out_of_range: 'Hors plage',
  unstable:     'Instabilité capteur',
  // Isolation Forest
  multivariate: 'Anomalie multivariée',
  // anciens types (compatibilité)
  drop:         'Chute anormale',
  drift:        'Dérive capteur',
  outlier:      'Valeur atypique',
  threshold:    'Seuil dépassé',
};

const anomalyIcons: Record<string, React.ReactNode> = {
  spike:        <Zap className="h-4 w-4" />,
  frozen:       <Clock className="h-4 w-4" />,
  out_of_range: <AlertTriangle className="h-4 w-4" />,
  unstable:     <Thermometer className="h-4 w-4" />,
  multivariate: <ShieldAlert className="h-4 w-4" />,
};

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function formatNumber(value: number | null, digits = 2) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return '-';
  return n.toFixed(digits);
}

function normalizeSeverity(severity: string | null | undefined): UiSeverity {
  const v = String(severity ?? '').toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low') return v;
  return 'unknown';
}

function getSeverityBadgeClass(severity: UiSeverity) {
  switch (severity) {
    case 'critical': return 'border-red-200 bg-red-50 text-red-700';
    case 'high':     return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'medium':   return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'low':      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:         return 'border-zinc-200 bg-zinc-50 text-zinc-600';
  }
}

function getSeverityDotClass(severity: UiSeverity) {
  switch (severity) {
    case 'critical': return 'bg-red-500';
    case 'high':     return 'bg-orange-500';
    case 'medium':   return 'bg-amber-400';
    case 'low':      return 'bg-sky-400';
    default:         return 'bg-zinc-400';
  }
}

function getSeverityBorderClass(severity: UiSeverity) {
  switch (severity) {
    case 'critical': return 'border-l-red-400';
    case 'high':     return 'border-l-orange-400';
    case 'medium':   return 'border-l-amber-400';
    case 'low':      return 'border-l-sky-400';
    default:         return 'border-l-zinc-300';
  }
}

function getActionBgClass(severity: UiSeverity) {
  switch (severity) {
    case 'critical': return 'bg-red-50 border-red-100 text-red-800';
    case 'high':     return 'bg-orange-50 border-orange-100 text-orange-800';
    case 'medium':   return 'bg-amber-50 border-amber-100 text-amber-800';
    case 'low':      return 'bg-sky-50 border-sky-100 text-sky-800';
    default:         return 'bg-zinc-50 border-zinc-100 text-zinc-700';
  }
}

// Découpe les actions séparées par " → "
function parseActions(action: string | null | undefined): string[] {
  if (!action) return [];
  return action.split('→').map(a => a.trim()).filter(Boolean);
}

// ── Carte d'une anomalie ──────────────────────────────────────────────────────

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
  const actions  = parseActions((anomaly as any).action);

  return (
    <article
      className={`rounded-xl border border-zinc-200 border-l-4 ${getSeverityBorderClass(severity)} bg-white shadow-sm transition-all duration-200 ${anomaly.acknowledged ? 'opacity-60' : ''}`}
    >
      {/* ── En-tête toujours visible ── */}
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">

          {/* Badges */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getSeverityBadgeClass(severity)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${getSeverityDotClass(severity)}`} />
              {severityLabels[severity]}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
              {anomalyIcons[anomaly.anomaly_type] ?? <ShieldAlert className="h-3.5 w-3.5" />}
              {anomalyLabels[anomaly.anomaly_type] ?? anomaly.anomaly_type}
            </span>

            {anomaly.acknowledged && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Acquittée
              </span>
            )}
          </div>

          {/* Détail */}
          <p className="text-sm leading-relaxed text-zinc-700">
            {anomaly.detail ?? 'Aucun détail fourni.'}
          </p>

          {/* Métriques */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-zinc-400" />
              {anomaly.room_name ?? '-'}
            </span>
            <span>Capteur : <span className="font-medium text-zinc-700">{anomaly.sensor_id ?? '-'}</span></span>
            <span>Type : <span className="font-medium text-zinc-700">{anomaly.sensor_type ?? '-'}</span></span>
            {anomaly.value !== null && (
              <span>Valeur : <span className="font-medium text-zinc-700">{formatNumber(anomaly.value)}</span></span>
            )}
            {anomaly.z_score !== null && (
              <span>Z-score : <span className="font-medium text-zinc-700">{formatNumber(anomaly.z_score)}</span></span>
            )}
          </div>
        </div>

        {/* Droite : heure + boutons */}
        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <span className="text-xs text-zinc-400">{formatDate(anomaly.detected_at)}</span>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bouton afficher/masquer les mesures */}
            {actions.length > 0 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100"
              >
                <Wrench className="h-3.5 w-3.5" />
                Mesures à prendre
                {expanded
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
                }
              </button>
            )}

            {!anomaly.acknowledged && (
              <button
                onClick={() => onAcknowledge(anomaly.id)}
                disabled={ackLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {ackLoading ? 'En cours...' : 'Acquitter'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Bloc mesures à prendre (expandable) ── */}
      {expanded && actions.length > 0 && (
        <div className={`mx-5 mb-5 rounded-lg border p-4 ${getActionBgClass(severity)}`}>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70">
            <Wrench className="h-3.5 w-3.5" />
            Mesures recommandées
          </div>
          <ol className="space-y-2">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/60 text-xs font-bold">
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export function AlertsAnomalies() {
  const [anomalies, setAnomalies]     = useState<AnomalyDto[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [severity, setSeverity]       = useState<SeverityFilter>('all');
  const [room, setRoom]               = useState('');
  const [unackedOnly, setUnackedOnly] = useState(false);
  const [ackLoadingId, setAckLoadingId] = useState<number | null>(null);

  const fetchAnomalies = useCallback(async () => {
    try {
      setError(null);
      const data = await getAnomalies({
        limit:   100,
        severity,
        room:    room.trim() || undefined,
        unacked: unackedOnly,
      });
      setAnomalies(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [room, severity, unackedOnly]);

  useEffect(() => {
    fetchAnomalies();
    const id = window.setInterval(fetchAnomalies, 30_000);
    return () => window.clearInterval(id);
  }, [fetchAnomalies]);

  const counts = useMemo(() => ({
    all:      anomalies.length,
    critical: anomalies.filter(a => normalizeSeverity(a.severity) === 'critical').length,
    high:     anomalies.filter(a => normalizeSeverity(a.severity) === 'high').length,
    medium:   anomalies.filter(a => normalizeSeverity(a.severity) === 'medium').length,
    low:      anomalies.filter(a => normalizeSeverity(a.severity) === 'low').length,
    unacked:  anomalies.filter(a => !a.acknowledged).length,
  }), [anomalies]);

  const handleAcknowledge = async (id: number) => {
    try {
      setError(null);
      setAckLoadingId(id);
      await acknowledgeAnomaly(id);
      setAnomalies(prev =>
        prev.map(a => a.id === id ? { ...a, acknowledged: true } : a)
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAckLoadingId(null);
    }
  };

  const statCards = [
    { label: 'Toutes',          value: counts.all,      icon: ShieldAlert,    color: 'text-zinc-500' },
    { label: 'Critiques',       value: counts.critical,  icon: AlertTriangle,  color: 'text-red-500'  },
    { label: 'Hautes',          value: counts.high,      icon: AlertTriangle,  color: 'text-orange-500' },
    { label: 'Moyennes',        value: counts.medium,    icon: Thermometer,    color: 'text-amber-500' },
    { label: 'Faibles',         value: counts.low,       icon: Thermometer,    color: 'text-sky-500'  },
    { label: 'Non acquittées',  value: counts.unacked,   icon: CheckCircle2,   color: 'text-violet-500' },
  ];

  return (
    <div className="h-full p-8 space-y-6">

      {/* En-tête */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-800">Alertes anomalies</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Détection temps réel via Isolation Forest + règles métier — données depuis PostgreSQL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => { setLoading(true); fetchAnomalies(); }}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-400">
            <Clock className="h-4 w-4" />
            Auto-refresh 30s
          </div>
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          Impossible de contacter le service anomalies : {error}
        </div>
      )}

      {/* Compteurs */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">{label}</span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-3xl font-semibold text-zinc-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-600">
          <Filter className="h-4 w-4" />
          Filtres
        </div>

        <select
          value={severity}
          onChange={e => setSeverity(e.target.value as SeverityFilter)}
          className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-400"
        >
          <option value="all">Toutes les sévérités</option>
          <option value="critical">Critique</option>
          <option value="high">Haute</option>
          <option value="medium">Moyenne</option>
          <option value="low">Faible</option>
        </select>

        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={room}
            onChange={e => setRoom(e.target.value)}
            placeholder="Filtrer par salle, ex: B109"
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-700 outline-none focus:border-zinc-400"
          />
        </label>

        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={unackedOnly}
            onChange={e => setUnackedOnly(e.target.checked)}
            className="h-4 w-4 accent-zinc-800"
          />
          Non acquittées seulement
        </label>
      </div>

      {/* Skeleton */}
      {loading && anomalies.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-zinc-200 bg-white/70" />
          ))}
        </div>
      )}

      {/* Vide */}
      {!loading && anomalies.length === 0 && !error && (
        <div className="rounded-xl border border-zinc-200 bg-white/80 py-14 text-center text-zinc-500 shadow-sm">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="font-medium">Aucune anomalie trouvée</p>
          <p className="mt-1 text-xs">Le système fonctionne normalement.</p>
        </div>
      )}

      {/* Liste */}
      <div className="space-y-3">
        {anomalies.map((anomaly, index) => (
          <AnomalyCard
            key={anomaly.id ?? index}
            anomaly={anomaly}
            onAcknowledge={handleAcknowledge}
            ackLoading={ackLoadingId === anomaly.id}
          />
        ))}
      </div>
    </div>
  );
}