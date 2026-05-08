import { Users, UserCheck, Clock, MapPin } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const zoneOccupancy = [
  { zone: 'Ground Floor', current: 45, capacity: 80, percentage: 56 },
  { zone: 'Floor 1 West', current: 32, capacity: 50, percentage: 64 },
  { zone: 'Floor 1 East', current: 28, capacity: 50, percentage: 56 },
  { zone: 'Floor 2', current: 38, capacity: 60, percentage: 63 },
  { zone: 'Floor 3', current: 25, capacity: 40, percentage: 63 },
  { zone: 'Meeting Rooms', current: 18, capacity: 24, percentage: 75 },
];

const hourlyTrend = Array.from({ length: 12 }, (_, i) => ({
  time: `${8 + i}:00`,
  occupancy: Math.floor(Math.random() * 50) + 150,
}));

const heatmapData = [
  { time: '08:00', Mon: 45, Tue: 52, Wed: 48, Thu: 55, Fri: 50 },
  { time: '10:00', Mon: 78, Tue: 82, Wed: 85, Thu: 80, Fri: 75 },
  { time: '12:00', Mon: 65, Tue: 68, Wed: 70, Thu: 72, Fri: 60 },
  { time: '14:00', Mon: 82, Tue: 85, Wed: 88, Thu: 84, Fri: 78 },
  { time: '16:00', Mon: 70, Tue: 75, Wed: 72, Thu: 68, Fri: 55 },
  { time: '18:00', Mon: 35, Tue: 38, Wed: 40, Thu: 35, Fri: 25 },
];

export function OccupancyView() {
  const totalOccupancy = zoneOccupancy.reduce((sum, zone) => sum + zone.current, 0);
  const totalCapacity = zoneOccupancy.reduce((sum, zone) => sum + zone.capacity, 0);
  const avgPercentage = Math.round((totalOccupancy / totalCapacity) * 100);

  const getOccupancyColor = (percentage: number) => {
    if (percentage >= 80) return '#ef4444';
    if (percentage >= 60) return '#f59e0b';
    return '#10b981';
  };

  return (
    <div className="soft-page p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Occupancy Monitoring</h2>
        <p className="text-zinc-400">Real-time building occupancy and space utilization</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-white" />
          </div>
          <p className="text-zinc-400 text-sm mb-1">Total Occupancy</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{totalOccupancy}</span>
            <span className="text-zinc-500">/ {totalCapacity}</span>
          </div>
          <div className="mt-2 text-sm text-purple-400">{avgPercentage}% capacity</div>
        </div>

        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4">
            <UserCheck className="w-6 h-6 text-white" />
          </div>
          <p className="text-zinc-400 text-sm mb-1">Active Zones</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">6</span>
            <span className="text-zinc-500">/ 6</span>
          </div>
          <div className="mt-2 text-sm text-green-400">All zones operational</div>
        </div>

        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mb-4">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <p className="text-zinc-400 text-sm mb-1">Peak Time</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">14:00</span>
          </div>
          <div className="mt-2 text-sm text-orange-400">285 people</div>
        </div>

        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4">
            <MapPin className="w-6 h-6 text-white" />
          </div>
          <p className="text-zinc-400 text-sm mb-1">Busiest Zone</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">Meeting Rooms</span>
          </div>
          <div className="mt-2 text-sm text-green-400">75% occupied</div>
        </div>
      </div>

      {/* Zone Details */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Occupancy by Zone</h3>
          <div className="space-y-4">
            {zoneOccupancy.map((zone, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">{zone.zone}</span>
                  <span className="text-zinc-400 text-sm">
                    {zone.current} / {zone.capacity} ({zone.percentage}%)
                  </span>
                </div>
                <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="absolute h-full rounded-full transition-all"
                    style={{
                      width: `${zone.percentage}%`,
                      backgroundColor: getOccupancyColor(zone.percentage),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Today's Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={hourlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="time" stroke="#71717a" />
              <YAxis stroke="#71717a" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                }}
              />
              <Line type="monotone" dataKey="occupancy" stroke="#8b5cf6" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly Heatmap */}
      <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Weekly Occupancy Heatmap</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-zinc-400 text-sm font-medium pb-4">Time</th>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => (
                  <th key={day} className="text-center text-zinc-400 text-sm font-medium pb-4 px-4">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapData.map((row, index) => (
                <tr key={index}>
                  <td className="text-zinc-300 text-sm py-2">{row.time}</td>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => {
                    const value = row[day as keyof typeof row] as number;
                    const intensity = value / 100;
                    return (
                      <td key={day} className="px-4 py-2">
                        <div
                          className="h-12 rounded-lg flex items-center justify-center text-white text-sm font-medium transition-all hover:scale-105"
                          style={{
                            backgroundColor: `rgba(139, 92, 246, ${intensity})`,
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                          }}
                        >
                          {value}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
