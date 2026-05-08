import {
  LayoutDashboard,
  Zap,
  Thermometer,
  Bell,
  BarChart3,
  Building2,
  Users,
  Settings,
  ChevronDown,
  CalendarClock,
  DoorOpen,
  Network,
} from 'lucide-react';
import { getRoles, logout, isMaintenanceOnly } from '../../utils/auth';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

interface MenuItem {
  id: string;
  icon: React.ElementType;
  label: string;
  /** If non-empty, item is only visible to users who have at least one of these roles.
   *  If empty, item is visible to everyone. */
  allowedRoles: string[];
}

const ALL_MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard',   icon: LayoutDashboard, label: 'Dashboard',   allowedRoles: [] },
  { id: 'room-b109',   icon: DoorOpen,        label: 'Salle B109',  allowedRoles: [] },
  { id: 'energy',      icon: Zap,             label: 'Energy',      allowedRoles: [] },
  { id: 'environment', icon: Thermometer,     label: 'Environment', allowedRoles: [] },
  { id: 'occupancy',   icon: Users,           label: 'Occupancy',   allowedRoles: [] },
  { id: 'reservation', icon: CalendarClock,   label: 'Reservation', allowedRoles: [] },
  { id: 'building',    icon: Building2,       label: 'Building',    allowedRoles: [] },

  { id: 'digitalTwin', icon: Network, label: 'Digital Twin', allowedRoles: [] },

  { id: 'alerts',      icon: Bell,            label: 'Alerts',      allowedRoles: [] }, // visible to all
  { id: 'analytics',   icon: BarChart3,       label: 'Analytics',   allowedRoles: [] },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const roles = getRoles();
  const maintenanceOnly = isMaintenanceOnly();

  /**
   * Role-based filtering:
   * - ROLE_MAINTENANCE (without admin): sees ONLY the Alerts page.
   * - Everyone else: sees the full menu (further filtered by allowedRoles if set).
   */
  const menuItems = maintenanceOnly
    ? ALL_MENU_ITEMS.filter(item => item.id === 'alerts')
    : ALL_MENU_ITEMS.filter(item =>
        item.allowedRoles.length === 0 ||
        item.allowedRoles.some(r => roles.includes(r))
      );

  return (
    <aside className="h-full w-24 px-5 py-8">
      <div className="h-full rounded-[28px] bg-white/65 backdrop-blur-xl border border-white/70 shadow-[0_20px_50px_rgba(0,0,0,0.08)] flex flex-col items-center py-4">

        {/* Logo */}
        <button className="mb-5 rounded-full bg-white shadow-md p-2.5">
          <Building2 className="w-5 h-5 text-zinc-700" />
        </button>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col items-center gap-3 overflow-y-auto">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                title={item.label}
                className={`
                  size-11 rounded-2xl transition-all duration-200 grid place-items-center
                  ${isActive
                    ? 'bg-white text-[#f4b400] shadow-md'
                    : 'text-zinc-500 hover:bg-white/70 hover:text-zinc-700'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="pt-3 border-t border-zinc-300/60 flex flex-col items-center gap-3">

          {/* Logout */}
          <button
            onClick={logout}
            className="size-11 rounded-2xl text-red-500 hover:bg-red-100 grid place-items-center transition-colors"
            title="Déconnexion"
          >
            ⏻
          </button>

          {/* Settings — hidden for maintenance-only users */}
          {!maintenanceOnly && (
            <button
              className="size-11 rounded-2xl text-zinc-500 hover:bg-white/70 hover:text-zinc-700 grid place-items-center transition-colors"
              title="Paramètres"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

          <button className="size-10 rounded-2xl text-zinc-400 hover:bg-white/70 hover:text-zinc-700 grid place-items-center transition-colors">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}