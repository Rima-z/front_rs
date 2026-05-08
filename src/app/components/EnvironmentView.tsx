import { useEffect, useState } from 'react';
import { Thermometer, Droplets, Wind, Gauge, RefreshCw, AlertTriangle } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getAllRealtimeData } from '../../services/api';

type ZoneSummary = {
  name: string;
  temp: number | null;
  humidity: number | null;
  sensors: number;
};

export function EnvironmentView() {
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Utiliser les données temps réel pour avoir les dernières valeurs
      const realtimeData = await getAllRealtimeData();
      setMeasurements(realtimeData);
    } catch {
      setError('Impossible de charger les données environnementales (Spring Boot port 8084)');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Rafraîchir toutes les 5 secondes pour avoir un quasi temps réel
    const id = window.setInterval(fetchData, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Grouper par roomName
  const zoneMap = new Map<string, ZoneSummary>();
  measurements.forEach(m => {
    if (!zoneMap.has(m.roomName)) {
      zoneMap.set(m.roomName, { name: m.roomName, temp: null, humidity: null, sensors: 0 });
    }
    const z = zoneMap.get(m.roomName)!;
    z.sensors++;
    if (m.sensorType === 'temperature') z.temp = m.value;
    if (m.sensorType === 'humidity') z.humidity = m.value;
  });
  const zones = Array.from(zoneMap.values()).slice(0, 6);

  // Courbe température (dernières mesures triées par timestamp)
  const tempHistory = measurements
    .filter(m => m.sensorType === 'temperature')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-24)
    .map(m => ({
      hour: new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      temp: m.value,
      room: m.roomName,
    }));

  const humHistory = measurements
    .filter(m => m.sensorType === 'humidity')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-24)
    .map(m => ({
      hour: new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      humidity: m.value,
    }));

  return (
    <div className="soft-page p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Environmental Monitoring</h2>
          <p className="text-zinc-400">Données réelles capteurs IFC — WaveOn IoT</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700/50 text-white rounded-lg text-sm transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Rafraîchir
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Zone Cards */}
      <div className="grid grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-zinc-700 rounded w-3/4 mb-4" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-8 bg-zinc-700 rounded" />
                ))}
              </div>
            </div>
          ))
        ) : zones.length > 0 ? zones.map((zone, idx) => (
          <div key={idx} className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-5 hover:border-zinc-700/50 transition-all">
            <h3 className="text-white font-medium mb-4 truncate">{zone.name}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Thermometer className="w-4 h-4 text-orange-400" />
                  <span className="text-xs text-zinc-400">Température</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {zone.temp !== null ? `${zone.temp.toFixed(1)}°C` : 'N/A'}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Droplets className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-zinc-400">Humidité</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {zone.humidity !== null ? `${zone.humidity.toFixed(0)}%` : 'N/A'}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Wind className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-zinc-400">Capteurs</span>
                </div>
                <p className="text-xl font-bold text-white">{zone.sensors}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-zinc-400">Statut</span>
                </div>
                <p className={`text-sm font-bold ${zone.temp !== null && zone.temp < 26 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {zone.temp !== null && zone.temp < 26 ? 'Optimal' : 'À surveiller'}
                </p>
              </div>
            </div>
          </div>
        )) : (
          <div className="col-span-3 text-center text-zinc-400 py-12">
            Aucune donnée de zone disponible
          </div>
        )}
      </div>

      {/* Historical Charts */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            Température — dernières mesures
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={tempHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="hour" stroke="#71717a" interval={4} />
              <YAxis stroke="#71717a" domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                formatter={(value: number) => [`${value.toFixed(1)}°C`, 'Température']}
              />
              <Line type="monotone" dataKey="temp" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            Humidité — dernières mesures
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={humHistory}>
              <defs>
                <linearGradient id="humidity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="hour" stroke="#71717a" interval={4} />
              <YAxis stroke="#71717a" domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                formatter={(value: number) => [`${value.toFixed(0)}%`, 'Humidité']}
              />
              <Area type="monotone" dataKey="humidity" stroke="#06b6d4" fill="url(#humidity)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* HVAC Control - statique */}
      <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">HVAC System Status</h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { zone: 'Zone 1-2', status: 'Active', mode: 'Cooling', power: '75%' },
            { zone: 'Zone 3-4', status: 'Active', mode: 'Heating', power: '60%' },
            { zone: 'Zone 5-6', status: 'Standby', mode: 'Auto', power: '15%' },
            { zone: 'Basement', status: 'Active', mode: 'Ventilation', power: '40%' },
          ].map((hvac, index) => (
            <div key={index} className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-800/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-medium">{hvac.zone}</span>
                <div className={`w-2 h-2 rounded-full ${hvac.status === 'Active' ? 'bg-green-500' : 'bg-yellow-500'}`} />
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-zinc-400">Status</span><span className="text-white">{hvac.status}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Mode</span><span className="text-white">{hvac.mode}</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Power</span><span className="text-white">{hvac.power}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
