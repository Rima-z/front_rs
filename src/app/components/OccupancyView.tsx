import { useEffect, useMemo, useState } from 'react';
import { Users, UserCheck, Clock, MapPin, RefreshCw, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getAllRealtimeData, type SensorMeasurement } from '../../services/api';

type RoomOccupancy = {
  room: string;
  occupiedSensors: number;
  totalSensors: number;
  percentage: number;
  lastUpdate: string | null;
};

const isOccupied = (value: number | null | undefined) => Number(value ?? 0) >= 0.5;

const formatHour = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const bucketHour = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function OccupancyView() {
  const [measurements, setMeasurements] = useState<SensorMeasurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAllRealtimeData();
      setMeasurements(data);
      setLastUpdate(new Date());
    } catch {
      setError('Impossible de charger les donnees occupation (Spring Boot port 8084)');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, 5000);
    return () => window.clearInterval(id);
  }, []);

  const occupancyMeasurements = useMemo(
    () => measurements.filter((m) => m.sensorType === 'occupancy' && m.roomName),
    [measurements]
  );

  const roomOccupancy = useMemo(() => {
    const latestBySensor = new Map<string, SensorMeasurement>();

    occupancyMeasurements.forEach((measurement) => {
      const current = latestBySensor.get(measurement.sensorId);
      if (!current || new Date(measurement.timestamp).getTime() > new Date(current.timestamp).getTime()) {
        latestBySensor.set(measurement.sensorId, measurement);
      }
    });

    const rooms = new Map<string, RoomOccupancy>();
    latestBySensor.forEach((measurement) => {
      const room = rooms.get(measurement.roomName) ?? {
        room: measurement.roomName,
        occupiedSensors: 0,
        totalSensors: 0,
        percentage: 0,
        lastUpdate: null,
      };

      room.totalSensors += 1;
      if (isOccupied(measurement.value)) {
        room.occupiedSensors += 1;
      }
      if (!room.lastUpdate || new Date(measurement.timestamp).getTime() > new Date(room.lastUpdate).getTime()) {
        room.lastUpdate = measurement.timestamp;
      }

      rooms.set(measurement.roomName, room);
    });

    return Array.from(rooms.values())
      .map((room) => ({
        ...room,
        percentage: room.totalSensors > 0 ? Math.round((room.occupiedSensors / room.totalSensors) * 100) : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage || b.occupiedSensors - a.occupiedSensors || a.room.localeCompare(b.room));
  }, [occupancyMeasurements]);

  const trendData = useMemo(() => {
    const buckets = new Map<string, { time: string; occupied: number; total: number }>();

    occupancyMeasurements
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach((measurement) => {
        const time = bucketHour(measurement.timestamp);
        const bucket = buckets.get(time) ?? { time, occupied: 0, total: 0 };
        bucket.total += 1;
        if (isOccupied(measurement.value)) {
          bucket.occupied += 1;
        }
        buckets.set(time, bucket);
      });

    return Array.from(buckets.values()).slice(-24).map((bucket) => ({
      time: bucket.time,
      occupancy: bucket.occupied,
      percentage: bucket.total > 0 ? Math.round((bucket.occupied / bucket.total) * 100) : 0,
    }));
  }, [occupancyMeasurements]);

  const heatmapData = useMemo(() => {
    const rows = new Map<string, Record<string, string | number>>();
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    occupancyMeasurements.forEach((measurement) => {
      const date = new Date(measurement.timestamp);
      const dayIndex = date.getDay() - 1;
      if (dayIndex < 0 || dayIndex > 4) {
        return;
      }

      const time = `${date.getHours().toString().padStart(2, '0')}:00`;
      const row = rows.get(time) ?? { time, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 };
      if (isOccupied(measurement.value)) {
        row[days[dayIndex]] = Number(row[days[dayIndex]]) + 1;
      }
      rows.set(time, row);
    });

    return Array.from(rows.values()).sort((a, b) => String(a.time).localeCompare(String(b.time))).slice(-8);
  }, [occupancyMeasurements]);

  const totalOccupied = roomOccupancy.reduce((sum, room) => sum + room.occupiedSensors, 0);
  const totalSensors = roomOccupancy.reduce((sum, room) => sum + room.totalSensors, 0);
  const avgPercentage = totalSensors > 0 ? Math.round((totalOccupied / totalSensors) * 100) : 0;
  const busiestRoom = roomOccupancy[0] ?? null;
  const peak = trendData.reduce((max, point) => point.occupancy > max.occupancy ? point : max, { time: '-', occupancy: 0, percentage: 0 });

  const getOccupancyColor = (percentage: number) => {
    if (percentage >= 80) return '#ef4444';
    if (percentage >= 50) return '#f59e0b';
    return '#10b981';
  };

  return (
    <div className="soft-page p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">AI Recommendations</h2>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Donnees reelles capteurs occupancy IFC - WaveOn IoT</span>
            {lastUpdate && (
              <span className="text-zinc-500 text-xs">
                Derniere MAJ: {lastUpdate.toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}