import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import DashboardView from './components/DashboardView';
import  DashboardViewOccupant  from './components/DashboardViewOccupant';
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
import { QRCodeAdmin } from './components/QRCodeAdmin';
import { decodeJwtPayload, isAuthenticated, isMaintenanceOnly } from '../utils/auth'; // ← AJOUT
import { DigitalTwinServicesView } from '../app/components/DigitalTwinServicesView';

const QR_OCCUPANT_EMAIL = 'bb@example.com';
const QR_OCCUPANT_PASSWORD = 'bb123';

export default function App() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated); // ← lit le localStorage d'emblée
  const [activeView, setActiveView] = useState(
    isMaintenanceOnly() ? 'alerts' : 'dashboard'                      // ← vue initiale selon le rôle
  );

  const maintenanceOnly = isMaintenanceOnly();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomName = params.get('room');
    const autoLogin = params.get('autoLogin') === '1';

    if (!roomName || !autoLogin) return;

    localStorage.setItem('occupant_room', roomName);

    const loginFromQrCode = async () => {
      try {
        const res = await fetch('http://localhost:8080/auth/LoginClientService', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: QR_OCCUPANT_EMAIL,
            password: QR_OCCUPANT_PASSWORD,
            devicename: 'qr-code',
          }),
        });

        if (!res.ok) {
          throw new Error(`QR login failed with status ${res.status}`);
        }

        const data = await res.json();
        localStorage.setItem('access_token', data.token);
        localStorage.setItem('username', data.username ?? data.clientname ?? '');
        localStorage.setItem('email', data.email ?? QR_OCCUPANT_EMAIL);

        const payload = decodeJwtPayload(data.token);
        const roles: string[] =
          (payload.roles as string[]) ??
          (payload.authorities as string[]) ??
          [];
        localStorage.setItem('roles', JSON.stringify(roles));

        setAuthenticated(true);
        setActiveView('dashboard-occupant');
      } catch (error) {
        console.error(error);
      }
    };

    void loginFromQrCode();
  }, []);

  const renderView = () => {
    // Sécurité : si ROLE_MAINTENANCE tente d'accéder à une autre vue, on force alerts
    if (maintenanceOnly && activeView !== 'alerts') {
      return <AlertsView />;
    }

    switch (activeView) {
      case 'dashboard':
        return <DashboardView onOpenRoom={(roomName) => setActiveView(`room-${roomName.toLowerCase()}`)} />;
        case 'dashboard-occupant':
        return <DashboardViewOccupant/>;
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
      case 'qr-code-admin':
        return <QRCodeAdmin />;

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
