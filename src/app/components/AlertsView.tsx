import { AlertTriangle, Info, CheckCircle, XCircle, Clock, Filter, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  getAllAlerts,
  acknowledgeAlert,
  resolveAlert,
  type AlertDto,
  type AlertSeverity,
  type AlertStatus,
} from '../../services/api';

// Map backend severity → UI alert type
type UiType = 'critical' | 'warning' | 'info' | 'resolved';

function toUiType(severity: AlertSeverity, status: AlertStatus): UiType {
  if (status === 'RESOLVED') return 'resolved';
  switch (severity) {
    case 'CRITICAL': return 'critical';
    case 'WARNING':  return 'warning';
    default:         return 'info';
  }
}

function formatTimestamp(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'à l’instant';
  if (mins < 60) return `il y a ${mins} minute${mins > 1 ? 's' : ''}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `il y a ${hrs} heure${hrs > 1 ? 's' : ''}`;
  return `il y a ${Math.floor(hrs / 24)} jour${Math.floor(hrs / 24) > 1 ? 's' : ''}`;
}

export function AlertsView() {
  const [alerts, setAlerts]     = useState<AlertDto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<UiType | 'all'>('all');

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);
      const data = await getAllAlerts();
      setAlerts(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 30_000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  const handleAcknowledge = async (id: number) => {
    try {
      const updated = await acknowledgeAlert(id);
      setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
    } catch (e) {
      console.error('Acknowledge failed', e);
    }
  };

  const handleResolve = async (id: number) => {
    try {
      const updated = await resolveAlert(id);
      setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
    } catch (e) {
      console.error('Resolve failed', e);
    }
  };

  const handleAcknowledgeAll = async () => {
    const active = alerts.filter(a => a.status === 'ACTIVE');
    await Promise.allSettled(active.map(a => handleAcknowledge(a.id)));
  };

  // ─── Derived display data ───────────────────────────────────────────────────

  const withUiType = alerts.map(a => ({
    ...a,
    uiType: toUiType(a.severity, a.status),
  }));

  const filteredAlerts = filter === 'all'
    ? withUiType
    : withUiType.filter(a => a.uiType === filter);

  const counts = {
    all:      alerts.length,
    critical: withUiType.filter(a => a.uiType === 'critical').length,
    warning:  withUiType.filter(a => a.uiType === 'warning').length,
    info:     withUiType.filter(a => a.uiType === 'info').length,
    resolved: withUiType.filter(a => a.uiType === 'resolved').length,
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getIcon = (type: UiType) => {
    switch (type) {
      case 'critical': return <XCircle className="w-5 h-5" />;
      case 'warning':  return <AlertTriangle className="w-5 h-5" />;
      case 'info':     return <Info className="w-5 h-5" />;
      case 'resolved': return <CheckCircle className="w-5 h-5" />;
    }
  };

  const getCardColor = (type: UiType) => {
    switch (type) {
      case 'critical': return 'border-red-500/50 bg-red-500/10 text-red-400';
      case 'warning':  return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400';
      case 'info':     return 'border-blue-500/50 bg-blue-500/10 text-blue-400';
      case 'resolved': return 'border-green-500/50 bg-green-500/10 text-green-400';
    }
  };

  const getStatusBadge = (status: AlertStatus) => {
    switch (status) {
      case 'ACTIVE':       return 'bg-red-500/20 text-red-400';
      case 'ACKNOWLEDGED': return 'bg-yellow-500/20 text-yellow-400';
      case 'RESOLVED':     return 'bg-green-500/20 text-green-400';
    }
  };  

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="soft-page p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Alerts & Incidents</h2>
          <p className="text-zinc-400">Supervision et gestion des alertes du bâtiment</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setLoading(true); fetchAlerts(); }}
            className="flex items-center gap-2 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 rounded-lg px-4 py-2 hover:border-zinc-700/50 transition-all"
          >
            <RefreshCw className={`w-4 h-4 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            <span className="text-sm text-zinc-400">Actualiser</span>
          </button>
          <div className="flex items-center gap-2 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 rounded-lg px-4 py-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-400">Actualisation automatique : 30s</span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-400 text-sm">
          ⚠️ Impossible de contacter le service d'alertes : {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        {([
          { label: 'Toutes', count: counts.all,      color: 'from-zinc-600 to-zinc-700',     type: 'all'      },
          { label: 'Critique élevé',   count: counts.critical,  color: 'from-red-500 to-red-600',       type: 'critical' },
          { label: 'Avertissements',   count: counts.warning,   color: 'from-yellow-500 to-yellow-600', type: 'warning'  },
          { label: 'Info',       count: counts.info,      color: 'from-blue-500 to-blue-600',     type: 'info'     },
          { label: 'Résolues',   count: counts.resolved,  color: 'from-green-500 to-green-600',   type: 'resolved' },
        ] as const).map(stat => (
          <button
            key={stat.type}
            onClick={() => setFilter(stat.type)}
            className={`bg-zinc-900/30 backdrop-blur-xl border rounded-xl p-4 text-left transition-all ${
              filter === stat.type ? 'border-zinc-600' : 'border-zinc-800/50 hover:border-zinc-700/50'
            }`}
          >
            <p className="text-zinc-400 text-sm mb-1">{stat.label}</p>
            <p className="text-3xl font-bold text-white">{stat.count}</p>
            <div className={`mt-2 h-1 rounded-full bg-gradient-to-r ${stat.color}`} />
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-zinc-400" />
          <span className="text-sm text-zinc-400">
            Affichage de {filteredAlerts.length} {filter === 'all' ? 'alerts' : filter + ' alerts'}
          </span>
        </div>
        <button
          onClick={handleAcknowledgeAll}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-all"
        >
          Acquitter toutes les alertes
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && alerts.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-5 animate-pulse h-28" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredAlerts.length === 0 && !error && (
        <div className="text-center py-16 text-zinc-500">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg">No {filter === 'all' ? '' : filter + ' '}alerts found</p>
        </div>
      )}

      {/* Alerts list */}
      <div className="space-y-3">
        {filteredAlerts.map(alert => (
          <div
            key={alert.id}
            className={`bg-zinc-900/30 backdrop-blur-xl border rounded-xl p-5 ${getCardColor(alert.uiType)}`}
          >
            <div className="flex items-start gap-4">
              <div className="mt-1">{getIcon(alert.uiType)}</div>
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-white font-semibold mb-1">
                      {alert.sensorType} — {alert.equipmentLabel}
                    </h3>
                    <p className="text-zinc-300 text-sm">{alert.message}</p>
                  </div>
                  <span className={`ml-4 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusBadge(alert.status)}`}>
                    {alert.status === 'ACTIVE'
                      ? 'Active'
                      : alert.status === 'ACKNOWLEDGED'
                      ? 'Acquittée'
                      : 'Résolue'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-zinc-400 mb-3">
                  <span>🔧 {alert.equipmentId}</span>
                  <span>• {formatTimestamp(alert.triggeredAt)}</span>
                  {alert.severity && (
                    <span className="uppercase text-xs font-semibold tracking-wider opacity-60">
                      {alert.severity}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {alert.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-700/50 text-white rounded-lg text-sm transition-all"
                    >
                      Prendre en compte
                    </button>
                  )}
                  {alert.status !== 'RESOLVED' && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition-all"
                    >
                      Marquer comme résolue
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}