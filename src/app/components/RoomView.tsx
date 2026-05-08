import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  DoorOpen,
  Droplets,
  Gauge,
  MapPinned,
  RefreshCw,
  Thermometer,
  Users,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getAllRealtimeData,
  getSensorHistory,
  getSpaces,
  type SensorHistorySeries,
  type SensorMeasurement,
  type SpaceSensorDto,
} from '../../services/api';

type RoomViewProps = {
  roomName: string;
  onBack: () => void;
};

type ChartPoint = {
  time: string;
  value: number;
};

export function RoomView({ roomName, onBack }: RoomViewProps) {
  const [room, setRoom] = useState<SpaceSensorDto | null>(null);
  const [measurements, setMeasurements] = useState<SensorMeasurement[]>([]);
  const [historyByType, setHistoryByType] = useState<Record<string, SensorHistorySeries>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoomData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [spaces, recentMeasurements] = await Promise.all([
        getSpaces(),
        getAllRealtimeData(),
      ]);

      const currentRoom = spaces.find((space) => space.ifcName === roomName) ?? null;
      setRoom(currentRoom);

      const roomMeasurements = recentMeasurements.filter((measurement) => measurement.roomName === roomName);
      setMeasurements(roomMeasurements);

      const historyEntries = await Promise.all(
        (currentRoom?.sensors ?? []).map(async (sensor) => {
          const series = await getSensorHistory(sensor.id, 24, 24);
          return series[0] ?? null;
        }),
      );

      const nextHistoryByType = historyEntries.reduce<Record<string, SensorHistorySeries>>((acc, series) => {
        if (series) {
          acc[series.sensorType] = series;
        }
        return acc;
      }, {});

      setHistoryByType(nextHistoryByType);
    } catch {
      setError('Impossible de charger les donnees de la salle depuis Spring Boot (port 8084).');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomData();
    const intervalId = window.setInterval(fetchRoomData, 5000); // Rafraichir toutes les 5 secondes
    return () => window.clearInterval(intervalId);
  }, [roomName]);

  const measurementsByType = useMemo(() => {
    return measurements.reduce<Record<string, SensorMeasurement>>((acc, measurement) => {
      acc[measurement.sensorType] = measurement;
      return acc;
    }, {});
  }, [measurements]);

  const sensorCount = room?.sensors.length ?? measurements.length;
  const temperature = measurementsByType.temperature?.value ?? null;
  const humidity = measurementsByType.humidity?.value ?? null;
  const energy = measurementsByType.energy?.value ?? null;
  const occupancy = measurementsByType.occupancy?.value ?? null;
  const alertCount = measurements.filter((measurement) => measurement.status !== 'OK').length;

  const buildChartData = (series?: SensorHistorySeries): ChartPoint[] => {
    if (!series) return [];
    return series.points
      .filter((point): point is { timestamp: string; value: number } => point.value !== null)
      .map((point) => ({
        time: new Date(point.timestamp).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        value: point.value,
      }));
  };

  const temperatureHistory = buildChartData(historyByType.temperature);
  const humidityHistory = buildChartData(historyByType.humidity);

  return (
    <div className="min-h-full p-6 bg-[radial-gradient(circle_at_top_left,#f7f4ed_0,#ece5d6_38%,#e7ebef_100%)]">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[32px] border border-white/80 bg-white/70 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-zinc-700 transition hover:bg-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour au dashboard
              </button>

              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Salle test</p>
                <h1 className="mt-2 text-4xl font-semibold text-zinc-800">{roomName}</h1>
                <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                  Vue dediee a la salle du centre de conference pour verifier les capteurs lies a {roomName}.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl bg-[#efe2ba] px-4 py-3 text-sm text-zinc-700">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Nom long</p>
                <p className="mt-1 font-medium">{room?.ifcLongName || 'Conference Room 3'}</p>
              </div>
              <button
                onClick={fetchRoomData}
                className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white transition hover:bg-zinc-800"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Rafraichir
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-3xl bg-white/80 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-zinc-600">
              <Thermometer className="h-5 w-5 text-orange-500" />
              <span className="text-sm">Temperature</span>
            </div>
            <p className="mt-6 text-4xl font-semibold text-zinc-800">
              {temperature !== null ? `${temperature.toFixed(1)} C` : '--'}
            </p>
            <p className="mt-2 text-xs text-zinc-500">Mesure la plus recente</p>
          </article>

          <article className="rounded-3xl bg-white/80 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-zinc-600">
              <Droplets className="h-5 w-5 text-sky-500" />
              <span className="text-sm">Humidite</span>
            </div>
            <p className="mt-6 text-4xl font-semibold text-zinc-800">
              {humidity !== null ? `${humidity.toFixed(0)} %` : '--'}
            </p>
            <p className="mt-2 text-xs text-zinc-500">Mesure la plus recente</p>
          </article>

          <article className="rounded-3xl bg-white/80 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-zinc-600">
              <Zap className="h-5 w-5 text-amber-500" />
              <span className="text-sm">Energie</span>
            </div>
            <p className="mt-6 text-4xl font-semibold text-zinc-800">
              {energy !== null ? `${(energy / 1000).toFixed(1)} kWh` : '--'}
            </p>
            <p className="mt-2 text-xs text-zinc-500">Valeur convertie pour le test</p>
          </article>

          <article className="rounded-3xl bg-white/80 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-zinc-600">
              <Users className="h-5 w-5 text-emerald-500" />
              <span className="text-sm">Occupation</span>
            </div>
            <p className="mt-6 text-4xl font-semibold text-zinc-800">
              {occupancy !== null ? occupancy.toFixed(0) : '--'}
            </p>
            <p className="mt-2 text-xs text-zinc-500">Derniere lecture du capteur</p>
          </article>

          <article className="rounded-3xl bg-white/80 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-zinc-600">
              <Gauge className="h-5 w-5 text-rose-500" />
              <span className="text-sm">Alertes</span>
            </div>
            <p className="mt-6 text-4xl font-semibold text-zinc-800">{alertCount}</p>
            <p className="mt-2 text-xs text-zinc-500">Capteurs avec un statut non OK</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <article className="rounded-[30px] bg-white/80 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <DoorOpen className="h-5 w-5 text-zinc-700" />
              <div>
                <h2 className="text-xl font-semibold text-zinc-800">Resume de la salle</h2>
                <p className="text-sm text-zinc-500">Informations IFC et mapping des capteurs</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-[#f5f0e4] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Localisation</p>
                <div className="mt-3 flex items-start gap-3">
                  <MapPinned className="mt-0.5 h-5 w-5 text-zinc-600" />
                  <div className="text-sm text-zinc-700">
                    <p>{room?.ifcLongName || 'Conference Room 3'}</p>
                    <p className="mt-1 text-zinc-500">{room?.storey || 'Conference Center'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#edf3f8] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Capteurs relies</p>
                <p className="mt-3 text-3xl font-semibold text-zinc-800">{sensorCount}</p>
                <p className="mt-1 text-sm text-zinc-500">Capteurs identifies pour {roomName}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white/70 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                {(room?.sensors ?? []).map((sensor) => {
                  const measurement = measurements.find((item) => item.sensorId === sensor.id);
                  return (
                    <div key={sensor.id} className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-800">{sensor.label}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">{sensor.type}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs text-zinc-600">
                          {measurement?.status || 'N/A'}
                        </span>
                      </div>
                      <div className="mt-4 flex items-end justify-between">
                        <p className="text-2xl font-semibold text-zinc-800">
                          {measurement ? `${measurement.value} ${measurement.unit}` : '--'}
                        </p>
                        <p className="text-xs text-zinc-500">{sensor.id}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isLoading && (room?.sensors ?? []).length === 0 && (
                <p className="text-sm text-zinc-500">Aucun capteur mappe pour cette salle.</p>
              )}
            </div>
          </article>

          <article className="rounded-[30px] bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-800">Etat rapide</h2>
            <div className="mt-5 space-y-3">
              {[
                {
                  label: 'Temperature',
                  value: temperature !== null ? `${temperature.toFixed(1)} C` : '--',
                  status: temperature !== null && temperature <= 26 ? 'Confortable' : 'A surveiller',
                },
                {
                  label: 'Humidite',
                  value: humidity !== null ? `${humidity.toFixed(0)} %` : '--',
                  status: humidity !== null && humidity <= 65 ? 'Correcte' : 'Elevee',
                },
                {
                  label: 'Occupation',
                  value: occupancy !== null ? occupancy.toFixed(0) : '--',
                  status: occupancy !== null && occupancy > 0 ? 'Salle utilisee' : 'Salle libre',
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-zinc-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">{item.label}</span>
                    <span className="text-xs text-zinc-500">{item.status}</span>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-zinc-800">{item.value}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-[30px] bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-800">Historique temperature</h2>
            <p className="mt-1 text-sm text-zinc-500">24 derniers points du capteur temperature de {roomName}</p>
            <div className="mt-6 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={temperatureHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="time" stroke="#71717a" minTickGap={24} />
                  <YAxis stroke="#71717a" domain={['auto', 'auto']} />
                  <Tooltip formatter={(value: number) => [`${value.toFixed(1)} C`, 'Temperature']} />
                  <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-[30px] bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-800">Historique humidite</h2>
            <p className="mt-1 text-sm text-zinc-500">24 derniers points du capteur humidite de {roomName}</p>
            <div className="mt-6 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={humidityHistory}>
                  <defs>
                    <linearGradient id="roomHumidity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="time" stroke="#71717a" minTickGap={24} />
                  <YAxis stroke="#71717a" domain={['auto', 'auto']} />
                  <Tooltip formatter={(value: number) => [`${value.toFixed(0)} %`, 'Humidite']} />
                  <Area type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2} fill="url(#roomHumidity)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
