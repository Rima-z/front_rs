import { TrendingUp, TrendingDown, DollarSign, Leaf, Calendar } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const monthlyData = [
  { month: 'Jan', energy: 8500, cost: 2550, savings: 420 },
  { month: 'Feb', energy: 7800, cost: 2340, savings: 580 },
  { month: 'Mar', energy: 8200, cost: 2460, savings: 510 },
  { month: 'Apr', energy: 7600, cost: 2280, savings: 650 },
  { month: 'May', energy: 8100, cost: 2430, savings: 540 },
  { month: 'Jun', energy: 8900, cost: 2670, savings: 380 },
];

const efficiencyData = [
  { category: 'Lighting', current: 85, target: 90 },
  { category: 'HVAC', current: 72, target: 85 },
  { category: 'Equipment', current: 78, target: 80 },
  { category: 'Water', current: 88, target: 90 },
  { category: 'Solar', current: 92, target: 95 },
];

const weeklyOccupancy = [
  { day: 'Mon', occupancy: 78, avg: 65 },
  { day: 'Tue', occupancy: 82, avg: 68 },
  { day: 'Wed', occupancy: 85, avg: 70 },
  { day: 'Thu', occupancy: 80, avg: 67 },
  { day: 'Fri', occupancy: 72, avg: 62 },
  { day: 'Sat', occupancy: 25, avg: 20 },
  { day: 'Sun', occupancy: 15, avg: 12 },
];

export function AnalyticsView() {
  return (
    <div className="soft-page p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Analytics & Reports</h2>
          <p className="text-zinc-400">Performance insights and trend analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700/50 text-white rounded-lg text-sm transition-all">
            <Calendar className="w-4 h-4" />
            <span>Last 6 Months</span>
          </button>
          <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-all">
            Generate Report
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Energy Cost', value: '€15,730', change: -12.5, icon: DollarSign, color: 'from-green-500 to-emerald-500' },
          { label: 'Energy Saved', value: '3,080 kWh', change: 18.3, icon: Leaf, color: 'from-blue-500 to-cyan-500' },
          { label: 'Efficiency Score', value: '83%', change: 5.2, icon: TrendingUp, color: 'from-purple-500 to-pink-500' },
          { label: 'Carbon Offset', value: '1.2 tons', change: 15.8, icon: Leaf, color: 'from-green-500 to-teal-500' },
        ].map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div key={index} className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-zinc-400 text-sm mb-1">{kpi.label}</p>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-2xl font-bold text-white">{kpi.value}</span>
              </div>
              <div className={`flex items-center gap-1 text-sm ${kpi.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {kpi.change > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{Math.abs(kpi.change)}% vs last period</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Monthly Energy & Cost Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" stroke="#71717a" />
              <YAxis yAxisId="left" stroke="#71717a" />
              <YAxis yAxisId="right" orientation="right" stroke="#71717a" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="energy" stroke="#3b82f6" strokeWidth={2} name="Energy (kWh)" />
              <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} name="Cost (€)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Efficiency by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={efficiencyData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis type="number" stroke="#71717a" domain={[0, 100]} />
              <YAxis type="category" dataKey="category" stroke="#71717a" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="current" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Current %" />
              <Bar dataKey="target" fill="#10b981" radius={[0, 4, 4, 0]} name="Target %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Weekly Occupancy Pattern</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={weeklyOccupancy}>
              <defs>
                <linearGradient id="occupancy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="day" stroke="#71717a" />
              <YAxis stroke="#71717a" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Area type="monotone" dataKey="occupancy" stroke="#8b5cf6" fill="url(#occupancy)" name="Occupancy %" />
              <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" name="Average %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Top Insights</h3>
          <div className="space-y-4">
            {[
              { title: 'Peak Efficiency', value: '92%', description: 'Thursday 2-4 PM', color: 'text-green-400' },
              { title: 'Highest Consumption', value: '12.5 kWh', description: 'Wednesday 11 AM', color: 'text-orange-400' },
              { title: 'Best Day', value: 'Thursday', description: '15% below average', color: 'text-blue-400' },
              { title: 'Avg. Occupancy', value: '63%', description: 'Weekday average', color: 'text-purple-400' },
            ].map((insight, index) => (
              <div key={index} className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-zinc-400 text-sm">{insight.title}</span>
                  <span className={`font-bold ${insight.color}`}>{insight.value}</span>
                </div>
                <p className="text-zinc-500 text-xs">{insight.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
