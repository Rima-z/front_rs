import { useEffect, useState } from 'react';
import { Zap, TrendingDown, TrendingUp, Battery, Sun, Sparkles, Lightbulb, RefreshCw, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getAllRecentMeasurements, type SensorMeasurement } from '../../services/api';

const sourceData = [
  { name: 'Grid', value: 70, color: '#3b82f6' },
  { name: 'Solar', value: 20, color: '#f59e0b' },
  { name: 'Battery', value: 10, color: '#10b981' },
];

export function EnergyView() {
  const [measurements, setMeasurements] = useState<SensorMeasurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAllRecentMeasurements();
      setMeasurements(data.filter(m => m.sensorType === 'energy'));
    } catch {
      setError('Impossible de charger les données énergie (Spring Boot port 8084)');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  // Calculs agrégés
  const totalKwh = measurements.reduce((s, m) => s + m.value, 0);
  const totalMwh = (totalKwh / 1000).toFixed(0);
  const uniqueRooms = [...new Set(measurements.map(m => m.roomName))];

  // Données graphique par salle (top 24)
  const chartData = measurements
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-24)
    .map(m => ({
      hour: new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      consumption: Math.round(m.value / 1000),
      room: m.roomName,
    }));

  // Top 5 consommateurs
  const top5 = [...measurements]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="soft-page min-h-full p-8 space-y-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-yellow-500/5 rounded-full blur-3xl animate-pulse" />

      <div className="relative">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl mb-3 bg-gradient-to-r from-white via-amber-100 to-orange-200 bg-clip-text text-transparent">
              Energy Management
            </h1>
            <p className="text-zinc-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Données réelles capteurs IFC — WaveOn IoT
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700/50 text-white rounded-lg text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {[
            {
              label: 'Consommation totale',
              value: isLoading ? '...' : `${totalMwh}`,
              unit: 'MWh',
              icon: Zap,
              change: -5.2,
              gradient: 'from-blue-400 via-cyan-500 to-teal-600',
              bgGradient: 'from-blue-500/20 via-cyan-500/20 to-teal-600/20',
              shadowColor: 'shadow-blue-500/20'
            },
            {
              label: 'Nb. compteurs actifs',
              value: isLoading ? '...' : `${measurements.length}`,
              unit: 'pts',
              icon: Sun,
              change: 0,
              gradient: 'from-amber-400 via-orange-500 to-yellow-600',
              bgGradient: 'from-amber-500/20 via-orange-500/20 to-yellow-600/20',
              shadowColor: 'shadow-amber-500/20'
            },
            {
              label: 'Salles surveillées',
              value: isLoading ? '...' : `${uniqueRooms.length}`,
              unit: 'zones',
              icon: TrendingDown,
              change: -8.1,
              gradient: 'from-purple-400 via-pink-500 to-fuchsia-600',
              bgGradient: 'from-purple-500/20 via-pink-500/20 to-fuchsia-600/20',
              shadowColor: 'shadow-purple-500/20'
            },
            {
              label: 'Pic max',
              value: isLoading ? '...' : measurements.length > 0 ? `${(Math.max(...measurements.map(m => m.value)) / 1000).toFixed(0)}` : '0',
              unit: 'kWh',
              icon: Battery,
              change: 3.2,
              gradient: 'from-green-400 via-emerald-500 to-teal-600',
              bgGradient: 'from-green-500/20 via-emerald-500/20 to-teal-600/20',
              shadowColor: 'shadow-green-500/20'
            },
          ].map((metric, index) => {
            const Icon = metric.icon;
            return (
              <div
                key={index}
                className={`group relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br ${metric.bgGradient} border border-white/10 backdrop-blur-2xl hover:scale-105 hover:shadow-2xl ${metric.shadowColor} transition-all duration-500`}
              >
                <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${metric.gradient} opacity-20 rounded-full blur-3xl`} />
                <div className="relative">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${metric.gradient} flex items-center justify-center mb-5 shadow-xl`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <p className="text-zinc-400 text-sm mb-2">{metric.label}</p>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-3xl text-white">{metric.value}</span>
                    <span className="text-zinc-400">{metric.unit}</span>
                  </div>
                  {metric.change !== 0 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/20 border border-green-500/30">
                      {metric.change < 0
                        ? <TrendingDown className="w-3 h-3 text-green-400" />
                        : <TrendingUp className="w-3 h-3 text-orange-400" />}
                      <span className={`text-xs ${metric.change < 0 ? 'text-green-400' : 'text-orange-400'}`}>
                        {metric.change > 0 ? '+' : ''}{metric.change}% vs semaine dernière
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Courbe consommation */}
          <div className="col-span-2 rounded-3xl p-7 bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 border border-white/10 backdrop-blur-2xl shadow-2xl">
            <h3 className="text-xl text-white mb-1.5">Profil de consommation</h3>
            <p className="text-sm text-zinc-400 mb-6">Données réelles capteurs (kWh)</p>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="consumptionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="hour" stroke="#71717a" interval={4} style={{ fontSize: '11px' }} />
                <YAxis stroke="#71717a" style={{ fontSize: '11px' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(24,24,27,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                  formatter={(v: number) => [`${v} kWh`, 'Consommation']}
                />
                <Area type="monotone" dataKey="consumption" stroke="#3b82f6" strokeWidth={3} fill="url(#consumptionGrad)" name="kWh" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Sources énergie */}
          <div className="rounded-3xl p-7 bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 border border-white/10 backdrop-blur-2xl shadow-2xl">
            <h3 className="text-xl text-white mb-6">Sources d'énergie</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                  {sourceData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'rgba(24,24,27,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 mt-4">
              {sourceData.map((source, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/30">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-lg" style={{ backgroundColor: source.color }} />
                    <span className="text-sm text-zinc-300">{source.name}</span>
                  </div>
                  <span className="text-white">{source.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top consommateurs */}
        <div className="rounded-3xl p-7 bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 border border-white/10 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500">
              <Lightbulb className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl text-white">Top consommateurs</h3>
              <p className="text-sm text-zinc-400">Salles avec la plus haute consommation énergétique</p>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4">
            {top5.map((m, i) => (
              <div key={i} className="p-4 rounded-2xl bg-zinc-800/30 border border-zinc-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-zinc-500 text-xs">#{i + 1}</span>
                  <span className="text-white text-sm font-medium truncate">{m.roomName}</span>
                </div>
                <p className="text-2xl text-white font-bold">{(m.value / 1000).toFixed(0)}</p>
                <p className="text-zinc-400 text-xs">kWh</p>
                <div className={`mt-2 text-xs px-2 py-1 rounded-lg w-fit ${m.status === 'OK' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {m.status}
                </div>
              </div>
            ))}
            {top5.length === 0 && !isLoading && (
              <div className="col-span-5 text-center text-zinc-400 py-8">
                Aucune donnée énergie disponible
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}