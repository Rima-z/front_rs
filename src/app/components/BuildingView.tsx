import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import { IFCSPACE } from 'web-ifc';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Droplets,
  Layers,
  Sun,
  Thermometer,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface RoomSensorData {
  roomName: string;
  temperature?: number;
  humidity?: number;
  luminosity?: number;
  occupancy?: number;
  lastUpdate?: string;
}

interface SpaceFloorMapping {
  spaceGlobalId: string;
  spaceName: string;
  spaceLongName: string;
  storeyName: string;
  storeyElevation: number;
}

interface SensorMessage {
  roomName: string;
  sensorType: 'temperature' | 'humidity' | 'luminosity' | 'occupancy' | string;
  value: number | null;
  timestamp?: string;
  measuredAt?: string;
}

type IfcModel = THREE.Mesh & {
  modelID: number;
  ifcManager: {
    createSubset: (config: {
      modelID: number;
      ids: number[];
      material: THREE.Material;
      scene?: THREE.Object3D;
      removePrevious: boolean;
      customID?: string;
    }) => THREE.Mesh;
    removeSubset: (modelID: number, material?: THREE.Material, customID?: string) => void;
    getAllItemsOfType: (modelID: number, type: number, verbose: boolean) => Promise<IfcEntity[]>;
    dispose?: () => Promise<void>;
  };
};

type IfcEntityValue<T> = {
  value?: T;
};

type IfcEntity = {
  expressID: number;
  GlobalId?: IfcEntityValue<string> | string;
  Name?: IfcEntityValue<string> | string;
  LongName?: IfcEntityValue<string> | string;
};

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function applySensorMessage(cur: RoomSensorData, msg: SensorMessage): void {
  const value = isFiniteNumber(msg.value) ? msg.value : undefined;
  if (msg.sensorType === 'temperature') { if (value !== undefined) cur.temperature = value; else delete cur.temperature; }
  if (msg.sensorType === 'humidity') { if (value !== undefined) cur.humidity = value; else delete cur.humidity; }
  if (msg.sensorType === 'luminosity') { if (value !== undefined) cur.luminosity = value; else delete cur.luminosity; }
  if (msg.sensorType === 'occupancy') { if (value !== undefined) cur.occupancy = value; else delete cur.occupancy; }
  cur.lastUpdate = msg.timestamp ?? msg.measuredAt;
}

function getSpaceRoomName(mapping: SpaceFloorMapping): string {
  return mapping.spaceName || mapping.spaceLongName || mapping.spaceGlobalId;
}

function getSpaceRoomCandidates(mapping: SpaceFloorMapping): string[] {
  // Return candidates in order of preference: GlobalId first, then Name, then LongName
  // GlobalId is the most reliable for IFC matching
  return [mapping.spaceGlobalId, mapping.spaceName, mapping.spaceLongName].filter(Boolean);
}

function getFloorLabel(storeyName: string): string {
  if (storeyName === 'B1 BASEMENT') return 'B1 Sous-sol';
  if (storeyName.startsWith('1ST FLOOR')) return '1er Étage';
  if (storeyName.startsWith('2ND FLOOR')) return '2ème Étage';
  if (storeyName.startsWith('3RD FLOOR')) return '3ème Étage';
  if (storeyName.startsWith('4TH FLOOR')) return '4ème Étage';
  return storeyName;
}

function countUniqueRooms(mappings: SpaceFloorMapping[], storeyName: string): number {
  return new Set(
    mappings.filter((s) => s.storeyName === storeyName).map(getSpaceRoomName).filter(Boolean)
  ).size;
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function addMeshAlias(map: Map<string, THREE.Mesh[]>, alias: string | undefined, mesh: THREE.Mesh): void {
  if (!alias) return;
  const key = alias.trim();
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.includes(mesh)) list.push(mesh);
  map.set(key, list);
}

function getMeshesForCandidates(meshMap: Map<string, THREE.Mesh[]>, candidates: string[]): THREE.Mesh[] {
  const normalizedCandidates = candidates.map(normalizeLookupKey).filter(Boolean);
  const selectedMeshes = new Set<THREE.Mesh>();

  meshMap.forEach((meshes, key) => {
    const normalizedKey = normalizeLookupKey(key);
    const isMatch = normalizedCandidates.some(
      (candidate) => normalizedKey === candidate || normalizedKey.includes(candidate)
    );

    if (isMatch) {
      meshes.forEach((mesh) => selectedMeshes.add(mesh));
    }
  });

  return Array.from(selectedMeshes);
}

function getExpressIdsForCandidates(expressIdMap: Map<string, number[]>, candidates: string[]): number[] {
  const normalizedCandidates = candidates.map(normalizeLookupKey).filter(Boolean);
  const selectedIds = new Set<number>();

  expressIdMap.forEach((ids, key) => {
    const normalizedKey = normalizeLookupKey(key);
    const isMatch = normalizedCandidates.some(
      (candidate) => normalizedKey === candidate || normalizedKey.includes(candidate)
    );

    if (isMatch) {
      ids.forEach((id) => selectedIds.add(id));
    }
  });

  return Array.from(selectedIds);
}

function getMeshMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
  if (Array.isArray(mesh.material)) return (mesh.material[0] as THREE.MeshStandardMaterial) ?? null;
  return (mesh.material as THREE.MeshStandardMaterial) ?? null;
}

function getIfcText(value: IfcEntityValue<string> | string | undefined): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value.value ?? '';
}

function getReadableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  if (error && typeof error === 'object' && 'type' in error) {
    return String((error as { type?: unknown }).type);
  }
  return String(error || 'Erreur inconnue');
}

type CameraTween = {
  startTime: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
};

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─────────────────────────────────────────────────────────────
// Seed Data
// ─────────────────────────────────────────────────────────────

const SEED_DATA: RoomSensorData[] = [
  { roomName: 'B106', temperature: 22.1 },
  { roomName: 'B108', temperature: 23.4 },
  { roomName: 'B109', temperature: 25.54, humidity: 59.54 },
  { roomName: 'B110', temperature: 21.8 },
  { roomName: 'B111', temperature: 25.01, humidity: 44.82 },
  { roomName: 'B112', temperature: 22.9 },
  { roomName: 'B113', temperature: 24.73 },
  { roomName: 'B116', temperature: 21.0, occupancy: 1 },
  { roomName: 'B117', temperature: 22.3 },
  { roomName: 'B118', temperature: 23.1 },
  { roomName: 'B123', temperature: 25.22, humidity: 45.22 },
  { roomName: 'B135', temperature: 25.75, humidity: 53 },
  { roomName: 'B137', temperature: 32.55, humidity: 29.83 },
  { roomName: 'B139', temperature: 20.73, humidity: 43.44 },
  { roomName: 'B140', temperature: 21.5 },
  { roomName: 'B142', temperature: 22.0, occupancy: 1 },
  { roomName: 'B147', temperature: 23.8 },
  { roomName: 'B148', temperature: 25.77 },
  { roomName: 'B150', temperature: 25.47 },
  { roomName: 'B152', temperature: 24.67 },
];

const FALLBACK_FLOORS = [
  { key: 'B1 BASEMENT', label: 'B1 Sous-sol' },
  { key: '1ST FLOOR - ARCH', label: '1er Étage' },
  { key: '2ND FLOOR', label: '2ème Étage' },
  { key: '3RD FLOOR', label: '3ème Étage' },
  { key: '4TH FLOOR', label: '4ème Étage' },
];

// ─────────────────────────────────────────────────────────────
// Temp Helpers — couleurs adaptées au fond clair
// ─────────────────────────────────────────────────────────────

function tempToHex(t: number): number {
  if (t < 18) return 0x1a6fa8;
  if (t < 20) return 0x2196f3;
  if (t < 22) return 0x16a679;
  if (t < 24) return 0xe07b1a;
  return 0xc0392b;
}

function tempToCss(t: number): string {
  if (t < 18) return '#1a6fa8';
  if (t < 20) return '#2196f3';
  if (t < 22) return '#16a679';
  if (t < 24) return '#e07b1a';
  return '#c0392b';
}

function tempLabel(t: number): string {
  if (t < 18) return "J'ai froid";
  if (t < 20) return "J'ai légèrement froid";
  if (t < 22) return 'Je me sens bien';
  if (t < 24) return "J'ai légèrement chaud";
  if (t < 26) return "J'ai trop chaud";
  return "J'ai vraiment trop chaud";
}

function tempEmoji(t: number): string {
  if (t < 18) return '🥶';
  if (t < 20) return '😐';
  if (t < 22) return '😊';
  if (t < 24) return '😕';
  if (t < 26) return '😣';
  return '😡';
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function BuildingView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const roomMeshMapRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
  const allRoomMeshesRef = useRef<Set<THREE.Mesh>>(new Set());
  const ifcModelRef = useRef<IfcModel | null>(null);
  const spaceExpressIdMapRef = useRef<Map<string, number[]>>(new Map());
  const selectionMaterialRef = useRef(
    new THREE.MeshBasicMaterial({
      color: 0xf5a623,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
    })
  );
  const modelBoxRef = useRef<THREE.Box3 | null>(null);
  const cameraTweenRef = useRef<CameraTween | null>(null);

  const [rooms, setRooms] = useState<Map<string, RoomSensorData>>(() => {
    const m = new Map<string, RoomSensorData>();
    SEED_DATA.forEach((r) => m.set(r.roomName, r));
    return m;
  });

  const [spaceFloorMap, setSpaceFloorMap] = useState<SpaceFloorMapping[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>('B1 BASEMENT');
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [modelError, setModelError] = useState('');
  const [showLegend, setShowLegend] = useState(true);
  const [selectedRoomHasGeometry, setSelectedRoomHasGeometry] = useState(false);
  const [modelRoomMatchCount, setModelRoomMatchCount] = useState(0);
  // Stores the spaceGlobalIds for the currently selected room (for IFC subset matching)
  const [selectedRoomGlobalIds, setSelectedRoomGlobalIds] = useState<string[]>([]);

  const focusCameraOnBox = (box: THREE.Box3, zoom = 1.35) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const distance = (maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * zoom;
    const currentDirection = camera.position.clone().sub(controls.target);
    const direction = currentDirection.lengthSq() > 0
      ? currentDirection.normalize()
      : new THREE.Vector3(1, 0.8, 1).normalize();

    cameraTweenRef.current = {
      startTime: performance.now(),
      duration: 850,
      fromPosition: camera.position.clone(),
      toPosition: center.clone().add(direction.multiplyScalar(distance)),
      fromTarget: controls.target.clone(),
      toTarget: center,
    };
  };

  // API
  useEffect(() => {
    fetch('http://localhost:8084/api/building/spaces-floors')
      .then((r) => r.json())
      .then((data: SpaceFloorMapping[]) => setSpaceFloorMap(data))
      .catch(() => console.warn('[API] spaces-floors unavailable'));
  }, []);

  // WebSocket
  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8084/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        setWsConnected(true);
        client.subscribe('/topic/sensor-data', (message) => {
          try {
            const msg = JSON.parse(message.body) as SensorMessage;
            setRooms((prev) => {
              const next = new Map(prev);
              const cur: RoomSensorData = { ...(next.get(msg.roomName) ?? { roomName: msg.roomName }) };
              applySensorMessage(cur, msg);
              next.set(msg.roomName, cur);
              return next;
            });
          } catch { /* ignore */ }
        });
      },
      onDisconnect: () => setWsConnected(false),
      onWebSocketClose: () => setWsConnected(false),
      onStompError: () => setWsConnected(false),
      onWebSocketError: () => setWsConnected(false),
    });
    client.activate();
    return () => { client.deactivate(); };
  }, []);

  // Polling fallback
  useEffect(() => {
    if (wsConnected) return;
    const poll = () => {
      fetch('http://localhost:8084/api/realtime')
        .then((r) => r.json())
        .then((data: SensorMessage[]) => {
          setRooms((prev) => {
            const next = new Map(prev);
            data.forEach((msg) => {
              const cur: RoomSensorData = { ...(next.get(msg.roomName) ?? { roomName: msg.roomName }) };
              applySensorMessage(cur, msg);
              next.set(msg.roomName, cur);
            });
            return next;
          });
        })
        .catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, [wsConnected]);

  // Three.js
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0xffffff, 1);
    renderer.sortObjects = true;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f0e4);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000);
    camera.position.set(40, 30, 60);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(50, 80, 40);
    scene.add(dir);
    // Suppression de la lumière fill bleue (0xe8f4f8) qui causait la teinte bleue

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    const onResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const tween = cameraTweenRef.current;
      if (tween) {
        const progress = Math.min((performance.now() - tween.startTime) / tween.duration, 1);
        const eased = easeInOutCubic(progress);
        camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
        if (progress >= 1) cameraTweenRef.current = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    let isDisposed = false;
    setModelStatus('loading');
    const loader = new IFCLoader();
    loader.ifcManager.setOnProgress((event) => {
      console.info(`[IFC] ${event.loaded}/${event.total}`);
    });

    const handleLoadError = (error: unknown) => {
      if (isDisposed) return;
      console.error('[IFC] Chargement impossible', error);
      setModelStatus('error');
      setModelError(`Le fichier existe, mais le viewer IFC n'a pas pu le charger: ${getReadableError(error)}`);
    };

    void (async () => {
      try {
        await loader.ifcManager.setWasmPath('/wasm/');
      } catch (error) {
        handleLoadError(error);
        return;
      }

      loader.load(
        '/models/otc.enriched.ifc',
        async (ifc) => {
          if (isDisposed) return;
          try {
            const ifcModel = ifc as IfcModel;
            ifcModelRef.current = ifcModel;
            roomMeshMapRef.current.clear();
            allRoomMeshesRef.current.clear();
            spaceExpressIdMapRef.current.clear();

scene.add(ifcModel);

            const spaces = await ifcModel.ifcManager.getAllItemsOfType(ifcModel.modelID, IFCSPACE, true);
            spaces.forEach((space) => {
              const expressID = space.expressID;
              const aliases = [getIfcText(space.GlobalId), getIfcText(space.Name), getIfcText(space.LongName)].filter(Boolean);
              aliases.forEach((alias) => {
                const list = spaceExpressIdMapRef.current.get(alias) ?? [];
                if (!list.includes(expressID)) list.push(expressID);
                spaceExpressIdMapRef.current.set(alias, list);
              });
            });
            console.log('[IFC] spaceExpressIdMap aliases:', Array.from(spaceExpressIdMapRef.current.keys()).slice(0, 30));
            console.log('[IFC] Total spaces loaded:', spaces.length, '| GlobalIds (first 10):', 
              spaces.slice(0, 10).map(s => getIfcText(s.GlobalId)).filter(Boolean));

            const baseMaterials = Array.isArray(ifcModel.material) ? ifcModel.material : [ifcModel.material];
            baseMaterials.forEach((material) => {
              material.transparent = true;
              material.opacity = 1.0;   // opacité pleine par défaut (plus de teinte bleue)
              material.needsUpdate = true;
            });
            // Stocker les matériaux de base pour le mode fantôme
            (ifcModel as any).__baseMaterials = baseMaterials;
            // Initialiser le renderer pour la transparence
            renderer.sortObjects = true;

            const box = new THREE.Box3().setFromObject(ifcModel);
            modelBoxRef.current = box.clone();
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const radius = Math.max(size.x, size.y, size.z);
            controls.target.copy(center);
            camera.position.copy(center.clone().add(new THREE.Vector3(radius * 1.6, radius * 1.1, radius * 1.8)));
            camera.near = Math.max(radius / 100, 0.1);
            camera.far = Math.max(radius * 100, 5000);
            camera.updateProjectionMatrix();

            setModelStatus('loaded');
          } catch (error) {
            handleLoadError(error);
          }
        },
        undefined,
        handleLoadError
      );
    })();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', onResize);
      if (ifcModelRef.current) {
        scene.remove(ifcModelRef.current);
        ifcModelRef.current.ifcManager.dispose?.();
      }
      selectionMaterialRef.current.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
}, []);

    // Rooms on floor - include IFC candidates for selection
    const roomsOnFloor = useMemo(() => {
      if (spaceFloorMap.length === 0) return Array.from(rooms.values()).map(r => ({ ...r, ifcCandidates: [r.roomName], spaceGlobalIds: [] as string[] }));
      const seen = new Set<string>();
      return spaceFloorMap
        .filter((s) => s.storeyName === selectedFloor)
        .map((mapping) => {
          const roomName = getSpaceRoomName(mapping);
          const ifcCandidates = getSpaceRoomCandidates(mapping);
          const sensorData = ifcCandidates.map((c) => rooms.get(c)).find(Boolean);
          return { ...(sensorData ?? {}), roomName, ifcCandidates, spaceGlobalIds: [mapping.spaceGlobalId].filter(Boolean) };
        })
        .filter((room) => {
          if (!room.roomName || seen.has(room.roomName)) return false;
          seen.add(room.roomName);
          return true;
        })
        .sort((a, b) => a.roomName.localeCompare(b.roomName, 'fr', { numeric: true }));
    }, [rooms, spaceFloorMap, selectedFloor]);

    const RoomWithCandidates = (r: typeof roomsOnFloor[0]) => ({ ...r, ifcCandidates: r.ifcCandidates ?? [r.roomName] });

    // Store a map from room name to IFC candidates for selection
    const roomToIfcCandidates = useMemo(() => {
      const map = new Map<string, string[]>();
      roomsOnFloor.forEach((r) => {
        map.set(r.roomName, r.ifcCandidates ?? [r.roomName]);
      });
      return map;
    }, [roomsOnFloor]);

    // Store a map from room name to all spaceGlobalIds (for all duplicates in CSV)
    const roomToGlobalIds = useMemo(() => {
      const map = new Map<string, string[]>();
      spaceFloorMap
        .filter((s) => s.storeyName === selectedFloor)
        .forEach((mapping) => {
          const roomName = getSpaceRoomName(mapping);
          if (!roomName) return;
          const existing = map.get(roomName) ?? [];
          if (mapping.spaceGlobalId && !existing.includes(mapping.spaceGlobalId)) {
            existing.push(mapping.spaceGlobalId);
          }
          map.set(roomName, existing);
        });
      return map;
    }, [spaceFloorMap, selectedFloor]);

    // Floors
    const floorOptions = useMemo(() => {
      if (spaceFloorMap.length === 0) return FALLBACK_FLOORS;
      const byName = new Map<string, { key: string; label: string; elevation: number }>();
      spaceFloorMap.forEach((mapping) => {
        if (!mapping.storeyName || byName.has(mapping.storeyName)) return;
        byName.set(mapping.storeyName, {
          key: mapping.storeyName,
          label: getFloorLabel(mapping.storeyName),
          elevation: mapping.storeyElevation ?? Number.MAX_SAFE_INTEGER,
        });
      });
      return Array.from(byName.values()).sort((a, b) =>
        a.elevation !== b.elevation ? a.elevation - b.elevation : a.key.localeCompare(b.key, 'fr', { numeric: true })
      );
    }, [spaceFloorMap]);

// IFC selection and camera focus + mode fantôme
   useEffect(() => {
     const ifcModel = ifcModelRef.current;
     const scene = sceneRef.current;
     if (!ifcModel || !scene || modelStatus !== 'loaded') return;

     const baseMaterials: THREE.MeshStandardMaterial[] = (ifcModel as any).__baseMaterials ??
       (Array.isArray(ifcModel.material) ? ifcModel.material : [ifcModel.material]);

     // ── Mode fantôme : tout le bâtiment devient très transparent lors d'une sélection ──
     if (selectedRoom) {
       baseMaterials.forEach((mat) => {
         mat.transparent = true;
         mat.opacity = 0.10;
         mat.depthWrite = false;
         mat.needsUpdate = true;
       });
     } else {
       baseMaterials.forEach((mat) => {
         mat.transparent = false;
         mat.opacity = 1.0;
         mat.depthWrite = true;
         mat.needsUpdate = true;
       });
     }

     // Get IFC candidates for the selected room
     const ifcCandidates = selectedRoom ? roomToIfcCandidates.get(selectedRoom) ?? [selectedRoom] : [];
     const globalIds = selectedRoom ? (roomToGlobalIds.get(selectedRoom) ?? []) : [];

     const matchingExpressIds = new Set<number>();

     if (selectedRoom) {
       // 1. Matching par spaceGlobalId (le plus fiable)
       if (globalIds.length > 0) {
         spaceExpressIdMapRef.current.forEach((ids, alias) => {
           if (globalIds.some(gid => alias === gid || alias.trim() === gid.trim())) {
             ids.forEach(id => matchingExpressIds.add(id));
           }
         });
       }
       // 2. Fallback fuzzy sur le nom
       if (matchingExpressIds.size === 0) {
         spaceExpressIdMapRef.current.forEach((ids, alias) => {
           const aliasLower = alias.toLowerCase();
           const selectedLower = selectedRoom.toLowerCase();
           if (aliasLower === selectedLower || aliasLower.includes(selectedLower) || selectedLower.includes(aliasLower)) {
             ids.forEach(id => matchingExpressIds.add(id));
           } else {
             ifcCandidates.forEach(c => {
               const cLower = c.toLowerCase();
               if (aliasLower === cLower || aliasLower.includes(cLower) || cLower.includes(aliasLower)) {
                 ids.forEach(id => matchingExpressIds.add(id));
               }
             });
           }
         });
       }
     }

     const selectedExpressIds = matchingExpressIds.size > 0
       ? Array.from(matchingExpressIds)
       : getExpressIdsForCandidates(spaceExpressIdMapRef.current, ifcCandidates);

     ifcModel.ifcManager.removeSubset(ifcModel.modelID, selectionMaterialRef.current, 'selected-space');

     if (selectedRoom && selectedExpressIds.length > 0) {
       try {
         // Matériau de sélection : couleur pleine, visible par-dessus le fantôme
         selectionMaterialRef.current.depthTest = false;
         selectionMaterialRef.current.depthWrite = true;
         selectionMaterialRef.current.opacity = 0.95;
         selectionMaterialRef.current.needsUpdate = true;

         const subset = ifcModel.ifcManager.createSubset({
           modelID: ifcModel.modelID,
           ids: selectedExpressIds,
           material: selectionMaterialRef.current,
           scene,
           removePrevious: true,
           customID: 'selected-space',
         });

         const box = new THREE.Box3().setFromObject(subset);
         const hasGeometry = !box.isEmpty();
         setSelectedRoomHasGeometry(hasGeometry);
         if (hasGeometry) {
           focusCameraOnBox(box, 1.45);
         }
       } catch (error) {
         console.warn('[IFC] Impossible de créer le subset de la pièce sélectionnée', error);
         setSelectedRoomHasGeometry(false);
       }
     } else {
       setSelectedRoomHasGeometry(false);
     }

     if (!selectedRoom && modelBoxRef.current) {
       focusCameraOnBox(modelBoxRef.current, 2.4);
     }
   }, [selectedRoom, roomToIfcCandidates, roomToGlobalIds, modelStatus]);

    useEffect(() => {
      if (modelStatus !== 'loaded' || spaceFloorMap.length === 0) {
        setModelRoomMatchCount(0);
        return;
      }

      const matchedRooms = new Set<string>();
      spaceFloorMap.forEach((mapping) => {
        const roomName = getSpaceRoomName(mapping);
        if (getExpressIdsForCandidates(spaceExpressIdMapRef.current, getSpaceRoomCandidates(mapping)).length > 0) {
          matchedRooms.add(roomName);
        }
      });
      setModelRoomMatchCount(matchedRooms.size);
    }, [modelStatus, spaceFloorMap]);

    // Stats
  const temps = roomsOnFloor.map((r) => r.temperature).filter(isFiniteNumber);
  const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  const maxTemp = temps.length ? Math.max(...temps) : null;
  const minTemp = temps.length ? Math.min(...temps) : null;
  const occupied = roomsOnFloor.filter((r) => (r.occupancy ?? 0) > 0).length;

  const selectedMapping = selectedRoom
    ? spaceFloorMap.find((s) => getSpaceRoomCandidates(s).includes(selectedRoom))
    : null;
  const selectedData = selectedRoom
    ? rooms.get(selectedRoom) ?? roomsOnFloor.find((r) => r.roomName === selectedRoom) ?? null
    : null;

  // ─── Render ───────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'radial-gradient(circle at top left, #f7f4ed 0, #ece5d6 38%, #e7ebef 100%)' }}
    >
      {/* HEADER */}
      <header className="mx-6 mt-6 rounded-[32px] border border-white/80 bg-white/70 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Jumeau numérique</p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-800">Visualisation du bâtiment</h1>
            <p className="mt-1 text-sm text-zinc-500">Données capteurs IoT en temps réel</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${
                wsConnected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-600'
              }`}
            >
              {wsConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              <div>
                <p className="font-medium">{wsConnected ? 'Temps réel actif' : 'Mode polling REST'}</p>
                <p className="text-xs opacity-70">{wsConnected ? 'WebSocket connecté' : 'Mise à jour 30s'}</p>
              </div>
            </div>

            <div
              className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${
                modelStatus === 'loaded'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : modelStatus === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-600'
              }`}
            >
              <Layers className="h-4 w-4" />
              <div>
                <p className="font-medium">
                  {modelStatus === 'loading' ? 'Chargement…' : modelStatus === 'loaded' ? 'Modèle IFC chargé' : 'Erreur modèle'}
                </p>
                <p className="text-xs opacity-70">
                  {modelStatus === 'loaded' ? 'Espaces IFC sélectionnables' : modelStatus === 'loading' ? 'IFC + Three.js init' : 'Vérifiez otc.enriched.ifc'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 gap-6 overflow-hidden p-6">

        {/* ASIDE GAUCHE — étages - hauteur réduite */}
        <aside className="w-64 overflow-y-auto rounded-[30px] border border-white/80 bg-white/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl" style={{ maxHeight: 'calc(100vh - 100px)' }}>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-zinc-500">Étages</p>

          {floorOptions.map((f) => {
            const count = countUniqueRooms(spaceFloorMap, f.key);
            const isActive = selectedFloor === f.key;
            return (
              <button
                key={f.key}
                onClick={() => { setSelectedFloor(f.key); setSelectedRoom(null); }}
                className={`mb-3 flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                  isActive
                    ? 'border-zinc-300 bg-[#efe2ba] shadow-sm'
                    : 'border-zinc-100 bg-zinc-50/60 hover:bg-zinc-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Layers className="h-4 w-4 text-zinc-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{f.label}</p>
                    <p className="text-xs text-zinc-500">{count} pièces</p>
                  </div>
                </div>
                {isActive && <ChevronRight className="h-4 w-4 text-zinc-500" />}
              </button>
            );
          })}

          {/* Stats */}
          <p className="mb-4 mt-8 text-xs uppercase tracking-[0.2em] text-zinc-500">Statistiques</p>
          <div className="space-y-3">
            <StatCard label="Temp. moyenne" value={avgTemp !== null ? `${avgTemp.toFixed(1)}°C` : '—'} color="orange" />
            <StatCard label="Temp. max" value={maxTemp !== null ? `${maxTemp.toFixed(1)}°C` : '—'} color="red" />
            <StatCard label="Temp. min" value={minTemp !== null ? `${minTemp.toFixed(1)}°C` : '—'} color="blue" />
            <StatCard label="Pièces occupées" value={`${occupied}`} color="green" />
          </div>
        </aside>

        {/* CENTRE — canvas 3D */}
        <div className="flex-1 relative h-[600px] overflow-hidden rounded-[30px] border border-white/80 bg-white/60 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          <div ref={mountRef} className="h-full w-full" />

          {modelStatus === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="mx-4 rounded-3xl border border-red-200 bg-white/90 p-8 shadow-xl backdrop-blur-xl">
                <div className="flex items-center gap-3 text-red-600">
                  <AlertTriangle className="h-6 w-6" />
                  <p className="text-lg font-semibold">Fichier IFC introuvable</p>
                </div>
                <p className="mt-3 text-sm text-zinc-600">{modelError}</p>
                <code className="mt-4 block rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
                  public/models/otc.enriched.ifc<br />
                  public/wasm/web-ifc.wasm
                </code>
              </div>
            </div>
          )}

          {modelStatus === 'loaded' && selectedRoom && !selectedRoomHasGeometry && (
            <div className="absolute left-5 top-5 max-w-sm rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-800 shadow-lg backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Pièce non reliée au modèle 3D</p>
                  <p className="mt-1">
                    Aucun IfcSpace correspondant n'a été trouvé pour cette salle. {modelRoomMatchCount} pièce
                    {modelRoomMatchCount > 1 ? 's' : ''} reconnue{modelRoomMatchCount > 1 ? 's' : ''} dans ce modèle.
                  </p>
                </div>
              </div>
            </div>
          )}

          {showLegend && (
            <div className="absolute right-5 top-5 w-60 overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-lg backdrop-blur-xl">
              <div className="border-b border-zinc-100 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Confort thermique</p>
              </div>
              {[
                { label: "J'ai vraiment trop chaud", bg: '#c0392b', emoji: '😡', range: '> 26°C' },
                { label: "J'ai trop chaud",          bg: '#c0392b', emoji: '😣', range: '24–26°C' },
                { label: "J'ai légèrement chaud",    bg: '#e07b1a', emoji: '😕', range: '22–24°C' },
                { label: 'Je me sens bien',           bg: '#16a679', emoji: '😊', range: '20–22°C' },
                { label: "J'ai légèrement froid",     bg: '#2196f3', emoji: '😐', range: '18–20°C' },
                { label: "J'ai froid",                bg: '#1a6fa8', emoji: '🥶', range: '< 18°C' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 last:border-0">
                  <span className="text-base">{item.emoji}</span>
                  <div className="flex-1 rounded-lg px-2 py-1 text-xs font-medium text-white" style={{ backgroundColor: item.bg }}>
                    {item.label}
                  </div>
                  <span className="text-xs text-zinc-400 whitespace-nowrap">{item.range}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowLegend((v) => !v)}
            className="absolute bottom-5 right-5 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-zinc-700 shadow-sm backdrop-blur-xl transition hover:bg-white"
          >
            {showLegend ? 'Masquer légende' : 'Afficher légende'}
          </button>
        </div>

        {/* ASIDE DROITE — liste des pièces en dropdown */}
        <aside className="w-80 rounded-[30px] border border-white/80 bg-white/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl" style={{ maxHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
          {selectedData ? (
            // Vue détail de la pièce sélectionnée
            <div className="flex flex-col h-full overflow-y-auto">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-zinc-800">{selectedData.roomName}</h2>
                  <p className="mt-1 text-sm text-zinc-500">Informations capteurs</p>
                </div>
                <button
                  onClick={() => setSelectedRoom(null)}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-100"
                >
                  ✕
                </button>
              </div>

              {isFiniteNumber(selectedData.temperature) && (
                <div
                  className="mb-5 rounded-3xl p-6 text-center text-white shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${tempToCss(selectedData.temperature)}, ${tempToCss(selectedData.temperature)}99)` }}
                >
                  <p className="text-5xl font-bold">{selectedData.temperature.toFixed(1)}°C</p>
                  <p className="mt-2 text-3xl">{tempEmoji(selectedData.temperature)}</p>
                  <p className="mt-2 text-sm font-medium opacity-90">{tempLabel(selectedData.temperature)}</p>
                </div>
              )}

              <div className="space-y-3">
                {isFiniteNumber(selectedData.humidity) && (
                  <SensorRow icon={<Droplets className="h-4 w-4 text-sky-500" />} label="Humidité" value={`${selectedData.humidity.toFixed(1)} %`} />
                )}
                {isFiniteNumber(selectedData.luminosity) && (
                  <SensorRow icon={<Sun className="h-4 w-4 text-amber-500" />} label="Luminosité" value={`${selectedData.luminosity} %`} />
                )}
                {isFiniteNumber(selectedData.occupancy) && (
                  <SensorRow
                    icon={<Users className="h-4 w-4 text-emerald-500" />}
                    label="Occupation"
                    value={selectedData.occupancy > 0 ? 'Occupée 🔴' : 'Libre 🟢'}
                  />
                )}
                {selectedData.lastUpdate && (
                  <SensorRow
                    icon={<span className="text-base">🕐</span>}
                    label="Dernière mise à jour"
                    value={new Date(selectedData.lastUpdate).toLocaleTimeString('fr-FR')}
                  />
                )}
              </div>

              {selectedMapping && (
                <div className="mt-5 rounded-2xl bg-[#f5f0e4] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Localisation</p>
                  <p className="mt-2 font-semibold text-zinc-800">{selectedMapping.storeyName}</p>
                  <p className="mt-1 text-sm text-zinc-500">{selectedMapping.spaceLongName}</p>
                </div>
              )}

              <button
                onClick={() => setSelectedRoom(null)}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à la liste des pièces
              </button>
            </div>
          ) : (
            // Vue liste des pièces en dropdown
            <div className="flex flex-col h-full">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Pièces de l'étage</p>
                <p className="text-sm font-medium text-zinc-600">{floorOptions.find(f => f.key === selectedFloor)?.label}</p>
              </div>
              
              {/* Liste compacte des pièces avec scroll */}
              <div className="flex-1 overflow-y-auto space-y-2">
                <p className="text-xs text-zinc-400 mb-2">Liste des pièces :</p>
                {roomsOnFloor.map((r) => {
                  const isSelected = selectedRoom === r.roomName;
                  return (
                  <div
                    key={r.roomName}
                    onClick={() => setSelectedRoom(r.roomName)}
                    className={`cursor-pointer rounded-2xl border p-3 transition-all ${
                      isSelected
                        ? 'border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-300/50'
                        : 'border-zinc-100 bg-zinc-50/80 hover:border-zinc-200 hover:bg-zinc-100/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                        )}
                        <div>
                          <p className={`font-medium text-sm ${isSelected ? 'text-amber-800' : 'text-zinc-800'}`}>{r.roomName}</p>
                          {(r.occupancy ?? 0) > 0 && (
                            <p className="mt-0.5 text-xs text-amber-600">● Occupée</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {isFiniteNumber(r.temperature) ? (
                          <>
                            <p className="text-base font-bold" style={{ color: tempToCss(r.temperature) }}>
                              {r.temperature.toFixed(1)}°C
                            </p>
                            <p className="text-xs">{tempEmoji(r.temperature)}</p>
                          </>
                        ) : (
                          <p className="text-xs text-zinc-400">Sans mesure</p>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
                {roomsOnFloor.length === 0 && (
                  <div className="text-center text-zinc-500 py-8">
                    <p>Aucune pièce trouvée</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color: 'orange' | 'red' | 'blue' | 'green' }) {
  const accent = {
    orange: 'text-orange-500',
    red: 'text-red-500',
    blue: 'text-sky-500',
    green: 'text-emerald-500',
  }[color];

  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

const SensorRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
    <div className="flex items-center gap-3">
      <span>{icon}</span>
      <span className="text-sm text-zinc-600">{label}</span>
    </div>
    <span className="font-semibold text-zinc-800">{value}</span>
  </div>
);