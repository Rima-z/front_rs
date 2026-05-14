import { useEffect, useState } from "react";
import { useRealtimeData } from "../../hooks/useRealtimeData";

type DashboardViewProps = {
  onOpenRoom?: (roomName: string) => void;
};

export default function DashboardView({ onOpenRoom }: DashboardViewProps) {
  const { latest, history, connected } = useRealtimeData(100);

  return (
    <div className="p-6">
      {/* Indicateur de connexion */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`w-3 h-3 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
        />
        <span className="text-sm text-muted-foreground">
          {connected ? "Connecté temps réel" : "Déconnecté"}
        </span>
      </div>

      {/* Dernières valeurs par capteur */}
      <div className="grid grid-cols-3 gap-4">
        {latest.map((sensor) => (
          <button
            key={sensor.sensorId}
            type="button"
            onClick={() => onOpenRoom?.(sensor.roomName)}
            className="border rounded-lg p-4 text-left"
          >
            <p className="text-sm text-muted-foreground">{sensor.label}</p>
            <p className="text-2xl font-bold">
              {sensor.value} {sensor.unit}
            </p>
            <p className="text-xs text-muted-foreground">{sensor.roomName}</p>
          </button>
        ))}
      </div>

      {/* Tableau historique */}
      <table className="w-full mt-6 text-sm">
        <thead>
          <tr>
            <th className="p-2">Capteur</th>
            <th className="p-2">Valeur</th>
            <th className="p-2">Salle</th>
            <th className="p-2">Heure</th>
          </tr>
        </thead>
        <tbody>
          {history.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.label}</td>
              <td className="p-2">
                {r.value} {r.unit}
              </td>
              <td className="p-2">{r.roomName}</td>
              <td className="p-2">{new Date(r.measuredAt).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
