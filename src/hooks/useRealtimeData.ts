// src/hooks/useRealtimeData.ts
import { useEffect, useState, useRef } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

const SPRING_URL = import.meta.env.VITE_SPRING_URL || 'http://localhost:8084';

export interface SensorReading {
  sensorId: string;
  sensorType: string;
  label: string;
  roomName: string;
  value: number;
  unit: string;
  status: string;
  measuredAt: string;
}

export function useRealtimeData(maxHistory = 100) {
  const [latest, setLatest] = useState<SensorReading[]>([]);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(`${SPRING_URL}/ws`),
      onConnect: () => {
        setConnected(true);

        client.subscribe("/topic/sensor-data", (message) => {
          const data: SensorReading = JSON.parse(message.body);

          // Met à jour la lecture la plus récente par sensorId
          setLatest((prev) => {
            const updated = prev.filter((r) => r.sensorId !== data.sensorId);
            return [...updated, data];
          });

          // Ajoute à l'historique (limité à maxHistory)
          setHistory((prev) => {
            const next = [data, ...prev];
            return next.slice(0, maxHistory);
          });
        });
      },
      onDisconnect: () => setConnected(false),
      reconnectDelay: 3000,
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, []);

  return { latest, history, connected };
}