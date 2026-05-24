import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import DashboardView from './components/DashboardView';
import { EnergyView } from './components/EnergyView';
import { EnvironmentView } from './components/EnvironmentView';
import { BuildingView } from './components/BuildingView';
import { AlertsView } from './components/AlertsView';
import { AlertsAnomalies } from './components/AlertsAnomalies';
import { AnalyticsView } from './components/AnalyticsView';
import { OccupancyView } from './components/OccupancyView';
import { AuthView } from './components/AuthView';
import { ReservationView } from './components/ReservationView';
import { RoomView } from './components/RoomView';
import { isAuthenticated, isMaintenanceOnly } from '../utils/auth'; // ← AJOUT
import { DigitalTwinServicesView } from '../app/components/DigitalTwinServicesView';
export default function App() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated); // ← lit le localStorage d'emblée
  const [activeView, setActiveView] = useState(
    isMaintenanceOnly() ? 'alerts' : 'dashboard'                      // ← vue initiale selon le rôle
  );

  const maintenanceOnly = isMaintenanceOnly();

  const renderView = () => {
    // Sécurité : si ROLE_MAINTENANCE tente d'accéder à une autre vue, on force alerts
    if (maintenanceOnly && activeView !== 'alerts') {
      return <AlertsView />;
    }

    switch (activeView) {
      case 'dashboard':
        return <DashboardView onOpenRoom={(roomName) => setActiveView(`room-${roomName.toLowerCase()}`)} />;
      case 'room-b109':
        return <RoomView roomName="B109" onBack={() => setActiveView('dashboard')} />;
      case 'energy':
        return <EnergyView />;
      case 'environment':
        return <EnvironmentView />;
      case 'building':
        return <BuildingView />;
      case 'alerts':
        return <AlertsView />;
      case 'alerts-anomalies':
        return <AlertsAnomalies />;
      case 'analytics':
        return <AnalyticsView />;
      case 'occupancy':
        return <OccupancyView />;
      case 'reservation':
        return <ReservationView />;

      case 'digitalTwin':
        return <DigitalTwinServicesView />;
        
      default:
        return <DashboardView onOpenRoom={(roomName) => setActiveView(`room-${roomName.toLowerCase()}`)} />;
    }
  };

  const handleAuthenticate = () => {
    setAuthenticated(true);
    setActiveView(isMaintenanceOnly() ? 'alerts' : 'dashboard'); // ← recalcule après login
  };

  return (
    !authenticated ? (
      <AuthView onAuthenticate={handleAuthenticate} />
    ) : (
      <div className="soft-ui size-full p-4 md:p-6 bg-[radial-gradient(circle_at_0%_0%,#f5f7f8_0,#e9ecef_55%,#e0e7eb_100%)]">
        <div className="size-full flex rounded-[34px] bg-white/45 backdrop-blur-xl border border-white/80 shadow-[0_30px_70px_rgba(0,0,0,0.12)] overflow-hidden">
          <Sidebar activeView={activeView} onViewChange={setActiveView} />
          <main className="flex-1 overflow-y-auto">
            {renderView()}
          </main>
        </div>
      </div>
    )
  );

}
