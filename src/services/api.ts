// src/services/api.ts
// URL du backend Spring Boot
const SPRING_URL = import.meta.env.VITE_SPRING_URL || 'http://localhost:8084';
const ALERT_URL  = import.meta.env.VITE_ALERT_URL  || 'http://localhost:8085';

// ─── URLs des microservices Digital Twin ──────────────────────────────────────
const IFC_URL     = import.meta.env.VITE_IFC_URL     || 'http://localhost:8001';
const IOT_URL     = import.meta.env.VITE_IOT_URL     || 'http://localhost:8002';
const MAPPING_URL = import.meta.env.VITE_MAPPING_URL || 'http://localhost:8003';

// ─── Alert Types ──────────────────────────────────────────────────────────────

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlertStatus   = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export type AlertDto = {
  id: number;
  equipmentId: string;
  equipmentLabel: string;
  sensorType: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';

export type AnomalyDto = {
  id: number;
  sensor_id: string;
  sensor_type: string;
  room_name: string;
  anomaly_type: string;
  severity: AnomalySeverity;
  value: number | null;
  z_score: number | null;
  detail: string | null;
  action: string | null;
  detected_at: string;
  acknowledged: boolean;
  notified: boolean;
};

export type AnomalyCountsDto = {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unacked: number;
};

export type GetAnomaliesParams = {
  limit?: number;
  severity?: AnomalySeverity | 'all';
  room?: string;
  unacked?: boolean;
};

// ─── Types Spring Boot ────────────────────────────────────────────────────────

export type SensorMeasurement = {
  sensorId: string;
  sensorType: string;
  label: string;
  timestamp: string;
  value: number;
  unit: string;
  status: string;
  ifcGlobalId: string;
  roomName: string;
};

export type TelemetryPoint = {
  timestamp: string;
  value: number | null;
};

export type SensorHistorySeries = {
  sensorId: string;
  sensorType: string;
  label: string;
  unit: string;
  ifcGlobalId: string;
  roomName: string;
  points: TelemetryPoint[];
};

export type WaveonSession = {
  status: string;
  idclient: number;
  iduser: number;
  token: string;
  mode: string;
};

export type ZoneDto = {
  id: number;
  name: string;
  type: string;
};

export type FloorDto = {
  id: number;
  name: string;
  levelIndex: number;
  zones: ZoneDto[];
};

export type BuildingDto = {
  id: number;
  name: string;
  code: string;
  floors: FloorDto[];
};

export type SiteHierarchyDto = {
  id: number;
  name: string;
  location: string;
  buildings: BuildingDto[];
};

export type SensorSummaryDto = {
  id: string;
  type: string;
  label: string;
  networkId: number | null;
  unicastAddress: number | null;
};

export type SpaceSensorDto = {
  zoneId: number | null;
  ifcGlobalId: string;
  ifcName: string;
  ifcLongName: string | null;
  storey: string | null;
  areaM2: number | null;
  mapped: boolean;
  networkId: number | null;
  sensors: SensorSummaryDto[];
};

// ─── Types Digital Twin — IFC Parser (:8001) ──────────────────────────────────

export type IFCStorey = {
  global_id:    string;
  name:         string;
  elevation_m?: number;
};

export type IFCSpace = {
  global_id:  string;
  name:       string;
  long_name?: string;
  storey?:    { name: string; global_id: string };
  area_m2?:   number;
};

export type IFCLevel = IFCStorey & {
  spaces: IFCSpace[];
};

export type IFCHierarchy = {
  project: { project_name: string; global_id: string };
  levels:  IFCLevel[];
  schema?: string;
};

export type IFCParseResult = {
  session_id:        string;
  schema:            string;
  original_filename: string;
  summary:           { storeys: number; spaces: number; equipment: number };
  hierarchy:         IFCHierarchy;
};

// ─── Types Digital Twin — IoT Connector (:8002) ───────────────────────────────

export type IoTSession = {
  session_id: string;
  id_client:  number;
  id_user:    number;
};

export type IoTSensor = {
  id:           string;
  sensor_type:  'ble_node' | 'smart_controller';
  device_name:  string;
  unicast?:     string;
  network_id?:  number;
  sensor_types: string[];
  pid_label?:   string;
  enabled:      boolean;
};

// ─── Types Digital Twin — Mapping (:8003) ─────────────────────────────────────

export type SensorAssignmentCreate = {
  sensor_type:   string;
  device_id?:    string;
  unicast?:      string;
  device_name?:  string;
  network_id?:   number;
  sensor_types?: string[];
};

export type MappingCreate = {
  space_global_id: string;
  space_name:      string;
  storey_name?:    string;
  area_m2?:        number;
  ifc_session_id?: string;
  notes?:          string;
  sensors:         SensorAssignmentCreate[];
};

export type MappingEntry = {
  id:              number;
  space_global_id: string;
  space_name:      string;
  storey_name?:    string;
  area_m2?:        number;
  is_active:       boolean;
  created_at?:     string;
  sensors: Array<{
    id:            number;
    device_name?:  string;
    unicast?:      string;
    sensor_type:   string;
    sensor_types?: string[];
  }>;
};

export type MappingStats = {
  total_spaces:             number;
  spaces_with_sensors:      number;
  spaces_without_sensors:   number;
  total_sensor_assignments: number;
  active_mappings:          number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${SPRING_URL}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

async function apiFetch<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try { detail = (await res.json()).detail ?? detail; } catch {}
    throw new Error(detail);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

// ─── Helpers anomaly-service (port 8085) ──────────────────────────────────────

async function anomalyGet<T>(path: string): Promise<T> {
  const res = await fetch(`${ALERT_URL}${path}`);
  if (!res.ok) throw new Error(`Anomaly API error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

async function anomalyPut<T>(path: string): Promise<T> {
  const res = await fetch(`${ALERT_URL}${path}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Anomaly API error ${res.status} on ${path}`);
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

// ─── Endpoints Spring Boot ────────────────────────────────────────────────────

export const getWaveonSession = (): Promise<WaveonSession> =>
  get('/api/waveon/test-session');

export const getRealtimeData = (sensorId: string): Promise<SensorMeasurement[]> =>
  get(`/api/realtime?sensorId=${encodeURIComponent(sensorId)}`);

export const getAllRealtimeData = (): Promise<SensorMeasurement[]> =>
  get('/api/realtime');

export const getSensorHistory = (
  sensorId: string,
  hours = 24,
  points = 24,
): Promise<SensorHistorySeries[]> =>
  get(`/api/history?sensorId=${encodeURIComponent(sensorId)}&hours=${hours}&points=${points}`);

export const getBuildingHierarchy = (): Promise<SiteHierarchyDto[]> =>
  get('/api/buildings/hierarchy');

export const getAllRecentMeasurements = (): Promise<SensorMeasurement[]> =>
  get('/api/measurements/recent');

export const getSensorsByZone = (zoneId: number): Promise<SensorMeasurement[]> =>
  get(`/api/zones/${zoneId}/sensors`);

export const getSpaces = (): Promise<SpaceSensorDto[]> =>
  get('/api/spaces');

// ─── Alert Endpoints (ancien service :8085 — gardé pour compatibilité) ────────

async function alertGet<T>(path: string): Promise<T> {
  const res = await fetch(`${ALERT_URL}${path}`);
  if (!res.ok) throw new Error(`Alert API error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

async function alertPut<T>(path: string): Promise<T> {
  const res = await fetch(`${ALERT_URL}${path}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Alert API error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export const getActiveAlerts = (): Promise<AlertDto[]> =>
  alertGet('/api/alerts');

export const getAllAlerts = (): Promise<AlertDto[]> =>
  alertGet('/api/alerts/all');

export const getAlertsByEquipment = (equipmentId: string): Promise<AlertDto[]> =>
  alertGet(`/api/alerts/equipment/${encodeURIComponent(equipmentId)}`);

export const acknowledgeAlert = (id: number): Promise<AlertDto> =>
  alertPut(`/api/alerts/${id}/acknowledge`);

export const resolveAlert = (id: number): Promise<AlertDto> =>
  alertPut(`/api/alerts/${id}/resolve`);

// ─── Anomaly-service Endpoints (anomaly-service Python :8085) ─────────────────

/**
 * GET /anomalies
 * Récupère la liste des anomalies filtrées depuis anomaly-service.
 */
export function getAnomalies(params: GetAnomaliesParams = {}): Promise<AnomalyDto[]> {
  const query = new URLSearchParams();
  query.set('limit', String(params.limit ?? 50));
  if (params.severity && params.severity !== 'all') query.set('severity', params.severity);
  if (params.room)    query.set('room',   params.room);
  if (params.unacked) query.set('unacked', 'true');

  return anomalyGet<AnomalyDto[]>(`/anomalies?${query.toString()}`);
}

/**
 * GET /anomalies/counts
 * Retourne les compteurs par sévérité pour le dashboard.
 */
export function getAnomalyCounts(): Promise<AnomalyCountsDto> {
  return anomalyGet<AnomalyCountsDto>('/anomalies/counts');
}

/**
 * PUT /anomalies/{id}/acknowledge
 * Acquitte une anomalie (acknowledged = true en base).
 */
export function acknowledgeAnomaly(id: number): Promise<AnomalyDto> {
  return anomalyPut<AnomalyDto>(`/anomalies/${id}/acknowledge`);
}

// ─── IFC Parser Endpoints (:8001) ─────────────────────────────────────────────

export async function uploadIFC(file: File): Promise<IFCParseResult> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch<IFCParseResult>(`${IFC_URL}/api/ifc/upload`, {
    method: 'POST',
    body: form,
  });
}

export async function getIFCSpaces(sessionId: string): Promise<IFCSpace[]> {
  const data = await apiFetch<{ spaces: IFCSpace[] }>(`${IFC_URL}/api/ifc/spaces/${sessionId}`);
  return data.spaces;
}

export async function getIFCHierarchy(sessionId: string): Promise<IFCHierarchy> {
  const data = await apiFetch<{ hierarchy: IFCHierarchy }>(`${IFC_URL}/api/ifc/hierarchy/${sessionId}`);
  return data.hierarchy;
}

// ─── IoT Connector Endpoints (:8002) ──────────────────────────────────────────

export async function connectIoT(email: string, password: string): Promise<IoTSession> {
  return apiFetch<IoTSession>(`${IOT_URL}/api/iot/connect`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
}

export async function getAllDevices(sessionId: string): Promise<IoTSensor[]> {
  const data = await apiFetch<{
    sensors: Array<{
      id_ble_node?: number;
      name: string;
      unicast_hex?: string;
      network_id?: number;
      sensor_types?: string[];
      pid_label?: string;
      enabled?: boolean;
    }>;
    smart_controllers: Array<{
      id_network?: number;
      id_smart_controller?: number;
      name: string;
      unicast?: number;
      variables?: string[];
      product_name?: string;
      enabled?: boolean;
    }>;
  }>(`${IOT_URL}/api/iot/devices/${sessionId}`);

  const ble: IoTSensor[] = (data.sensors ?? []).map(s => ({
    id:           String(s.id_ble_node ?? crypto.randomUUID()),
    sensor_type:  'ble_node',
    device_name:  s.name,
    unicast:      s.unicast_hex,
    network_id:   s.network_id,
    sensor_types: s.sensor_types ?? [],
    pid_label:    s.pid_label,
    enabled:      s.enabled ?? true,
  }));

  const sc: IoTSensor[] = (data.smart_controllers ?? []).map(c => ({
    id:           String(c.id_smart_controller ?? crypto.randomUUID()),
    sensor_type:  'smart_controller',
    device_name:  c.name,
    unicast:      c.unicast !== undefined ? `0x${c.unicast.toString(16).toUpperCase()}` : undefined,
    network_id:   c.id_network,
    sensor_types: c.variables?.length
      ? c.variables
      : (c.product_name ? [c.product_name] : ['Comptage énergie/eau']),
    enabled:      c.enabled ?? true,
  }));

  return [...ble, ...sc];
}

export async function disconnectIoT(sessionId: string): Promise<void> {
  await apiFetch<void>(`${IOT_URL}/api/iot/sessions/${sessionId}`, { method: 'DELETE' });
}

// ─── Mapping Endpoints (:8003) ────────────────────────────────────────────────

export async function createMapping(data: MappingCreate): Promise<MappingEntry> {
  return apiFetch<MappingEntry>(`${MAPPING_URL}/api/mapping/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
}

export async function getAllMappings(): Promise<MappingEntry[]> {
  const data = await apiFetch<MappingEntry[]>(`${MAPPING_URL}/api/mapping/`);
  return data.map(m => ({
    ...m,
    sensors: m.sensors.map(s => ({
      ...s,
      sensor_types: s.sensor_types?.length
        ? s.sensor_types
        : ((s as any).sensor_types_str as string | undefined)
            ?.split(',').filter(Boolean) ?? [],
    })),
  }));
}

export async function deleteMappingById(id: number): Promise<void> {
  await apiFetch<void>(`${MAPPING_URL}/api/mapping/${id}`, { method: 'DELETE' });
}

export async function exportMappingJSON(): Promise<Blob> {
  const res = await fetch(`${MAPPING_URL}/api/mapping/export/json`);
  if (!res.ok) throw new Error(`Export échoué : ${res.status}`);
  return res.blob();
}

export async function getMappingStats(): Promise<MappingStats> {
  return apiFetch<MappingStats>(`${MAPPING_URL}/api/mapping/stats/summary`);
}

export async function bulkImportMappings(payload: {
  project_name?: string;
  ifc_filename?: string;
  mappings: Array<{
    space_global_id: string;
    space_name:      string;
    sensors:         SensorAssignmentCreate[];
  }>;
}): Promise<{ created: number; updated: number; errors: string[] }> {
  return apiFetch(`${MAPPING_URL}/api/mapping/bulk-import`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
}