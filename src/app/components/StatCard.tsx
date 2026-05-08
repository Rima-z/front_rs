import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  trend?: number;
  color: string;
}

export function StatCard({ title, value, unit, icon: Icon, trend, color }: StatCardProps) {
  const trendColor = trend && trend > 0 ? 'text-red-400' : 'text-green-400';

  return (
    <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6 hover:border-zinc-700/50 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`text-sm font-medium ${trendColor}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>
      <div>
        <p className="text-zinc-400 text-sm mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-white">{value}</span>
          {unit && <span className="text-zinc-500">{unit}</span>}
        </div>
      </div>
    </div>
  );
}
