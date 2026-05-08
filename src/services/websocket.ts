import { useEffect, useRef, useState, useCallback } from 'react';

type SensorReading = {
  sensorId: string;
  sensorType: string;
  label: string;
  ifcGlobalId: string;
  roomName: string;
  unit: string;
  value: number;
  status: string;
  measuredAt: string;
};

type UseSensorWebSocketOptions = {
  onMessage?: (data: SensorReading) => void;
  roomName?: string;
};

type UseSensorWebSocketReturn = {
  isConnected: boolean;
  lastReading: SensorReading | null;
  allReadings: SensorReading[];
  clearReadings: () => void;
};

const SPRING_URL =
  import.meta.env.VITE_SPRING_URL || 'http://localhost:8084';

export function useSensorWebSocket({
  onMessage,
  roomName,
}: UseSensorWebSocketOptions = {}): UseSensorWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastReading, setLastReading] =
    useState<SensorReading | null>(null);
  const [allReadings, setAllReadings] = useState<SensorReading[]>([]);

  const clientRef = useRef<any>(null);
  const subscriptionsRef = useRef<any[]>([]);

  const clearReadings = useCallback(() => {
    setAllReadings([]);
    setLastReading(null);
  }, []);

   useEffect(() => {
     let isDisposed = false;

     const connect = async () => {
       try {
         console.log(
           'Attempting WebSocket connection to:',
           `${SPRING_URL}/ws`
         );

         const SockJS = (await import('sockjs-client')).default;
         const Stomp = await import('@stomp/stompjs');

         const stompClient = new Stomp.Client({
           webSocketFactory: () => {
             console.log('Creating SockJS connection...');
             return new SockJS(`${SPRING_URL}/ws`);
           },

           reconnectDelay: 5000,
           heartbeatIncoming: 0,
           heartbeatOutgoing: 0,

           onConnect: () => {
             setIsConnected(true);
             console.log('✅ WebSocket connected successfully');

             const subscription = stompClient.subscribe(
               '/topic/sensor-data',
               (message: any) => {
                 try {
                   const data: SensorReading = JSON.parse(
                     message.body
                   );

                   // Filter by room
                   if (roomName && data.roomName !== roomName) {
                     return;
                   }

                   setLastReading(data);

                   setAllReadings((prev) => {
                     const newReadings = [...prev, data];
                     return newReadings.slice(-100);
                   });

                   onMessage?.(data);
                 } catch (e) {
                   console.error('❌ Parse error:', e);
                 }
               }
             );

             subscriptionsRef.current.push(subscription);
           },

           onDisconnect: () => {
             setIsConnected(false);
             console.log('⚠️ WebSocket disconnected');
           },

           onStompError: (frame: any) => {
             console.error('❌ STOMP error:', frame.headers.message);
           },

           onWebSocketError: (error: any) => {
             console.error('❌ WebSocket error:', error);
           },
         });

         clientRef.current = stompClient;
         stompClient.activate();
       } catch (error) {
         console.error('❌ Failed to connect:', error);
       }
     };

     connect();

     return () => {
       isDisposed = true;
       subscriptionsRef.current.forEach((sub) => {
         if (sub) sub.unsubscribe();
       });

       const client = clientRef.current;
       if (client) {
         client.deactivate();
       }
     };
   }, [roomName, onMessage]);

  return {
    isConnected,
    lastReading,
    allReadings,
    clearReadings,
  };
}

export type { SensorReading };