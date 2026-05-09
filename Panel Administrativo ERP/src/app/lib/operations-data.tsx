import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { expirationConfig, realtimeAlerts } from "./mock-data";
import { generateSystemRemitoReference, isPrincipalClientCompany } from "./trip-clients";
import { embeddedOperationalZoneFeatures } from "./embedded-operational-zone-geometries";
import {
  getSyncDocuments,
  getSyncSettings,
  getSyncZones,
  getSyncTrips,
  getSyncUsers,
  getSyncVehicles,
  initSyncCollection,
  initSyncStore,
  RESET_REQUEST_KEY,
  resetSyncDemoData,
  resolveSyncAlertsByTrip,
  setSyncDocuments,
  setSyncSettings,
  setSyncZones,
  ZONES_KEY,
  setSyncTrips,
  setSyncUsers,
  setSyncVehicles,
  SyncAlert,
} from "./sync-store";

export type ZoneId = string;
type LatLngExpression = [number, number];
export type TripStage =
  | "Pendiente"
  | "Sin chofer"
  | "Asignado"
  | "Aceptado"
  | "En planta"
  | "En ruta"
  | "Entregado"
  | "Cancelado"
  | "Reprogramado";
export type TripStatus = TripStage;
export type ZoneConfig = {
  id: ZoneId;
  name: string;
  colorClass: string;
  colorHex: string;
  mapCenter: LatLngExpression;
  zoom: number;
  radiusKm: number;
  areaGeoJson?: GeoJSON.Feature | GeoJSON.FeatureCollection | null;
};

export type Driver = { id: string; name: string; zoneId: ZoneId };
export type UserRole = "Administrador" | "Operador" | "Supervisor" | "Chofer" | "Visualizador";
export type UserStatus = "Activo" | "Inactivo";
export type VehicleStatus = "Activo" | "Mantenimiento" | "Inactivo";
/** Propio: flota Transportes Fighera. Fletero: unidad de terceros. */
export type VehicleFleetKind = "Propio" | "Fletero";
export type Vehicle = {
  id: string;
  plate: string;
  type: "Camión" | "Remolque";
  zoneId: ZoneId;
  brand: string;
  model: string;
  status: VehicleStatus;
  fleetKind: VehicleFleetKind;
  /** Detalles opcionales del vehículo (notas operativas). */
  observations: string;
};
export type AppUser = { id: string; name: string; email: string; role: UserRole; status: UserStatus; zoneId: ZoneId };
export type AuditLog = { id: number; dateTime: string; user: string; ip: string; action: string };
export type DocumentEntityType = "user" | "vehicle";
export type DocumentRecord = {
  id: string;
  entityType: DocumentEntityType;
  entityId: string;
  documentType: string;
  expiresAt: string;
  status: "Vigente" | "Próximo a vencer" | "Vencido";
  notes: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
  uploadedAt: string;
};
export type RouteTemplate = {
  id: string;
  zoneId: ZoneId;
  label: string;
  origin: string;
  destination: string;
  path: LatLngExpression[];
};

export type PlannedTrip = {
  id: string;
  zoneId: ZoneId;
  driver: string;
  vehiclePlate: string;
  origin: string;
  destination: string;
  routePath: LatLngExpression[];
  progress: number;
  status: TripStage;
  /** Tipo de carga (denominación operativa). */
  cargo: string;
  /** Condiciones del viaje (plan operativo). */
  plan: string;
  scheduledAt: string;
  /** Empresa o cliente del viaje. */
  clientCompany: string;
  /** Número de remito (clientes principales) o código único generado por el sistema (otros). */
  remitoNumber: string;
  timeline?: Array<{ timestamp: string; descripcion: string }>;
  evidencias?: Array<{ tipo: string; nombre: string; fecha: string }>;
};

export type InvoiceStatus = "Cargada" | "Firmada";
export type DriverInvoice = {
  id: string;
  driverId: string;
  driverName: string;
  period: string;
  amount: number;
  uploadedAt: string;
  status: InvoiceStatus;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
  signedAt?: string;
};
export type ExpirationRule = {
  id: number;
  docType: string;
  frequency: string;
  prealertDays: number;
  enabled: boolean;
};

type TripInput = {
  zoneId: ZoneId;
  driverId: string;
  vehicleId: string;
  routeId?: string;
  manualRoute?: {
    origin: string;
    destination: string;
    path: LatLngExpression[];
  };
  cargo: string;
  plan: string;
  scheduledAt: string;
  clientCompany: string;
  /** Obligatorio si clientCompany es SIDERSA, Acindar o CIPLAR; ignorado en otro caso (se genera SYS-*). */
  remitoNumber?: string;
};
type TripUpdateInput = {
  zoneId: ZoneId;
  driver: string;
  vehiclePlate: string;
  origin: string;
  destination: string;
  cargo: string;
  plan: string;
  scheduledAt: string;
  clientCompany: string;
  remitoNumber?: string;
  status: TripStage;
};

type UserInput = { name: string; email: string; role: UserRole; zoneId: ZoneId };
type VehicleInput = {
  plate: string;
  type: "Camión" | "Remolque";
  zoneId: ZoneId;
  brand: string;
  model: string;
  fleetKind?: VehicleFleetKind;
  observations?: string;
};
type DocumentInput = {
  entityType: DocumentEntityType;
  entityId: string;
  documentType: string;
  expiresAt: string;
  notes: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
};
type InvoiceInput = {
  driverId: string;
  period: string;
  amount: number;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
};
type ZoneInput = {
  name: string;
  colorClass: string;
  mapCenter: LatLngExpression;
  zoom: number;
  radiusKm?: number;
  areaGeoJson?: GeoJSON.Feature | GeoJSON.FeatureCollection | null;
};

const defaultZonesSeed: ZoneConfig[] = [
  {
    id: "zona-bsas",
    name: "Buenos Aires",
    colorClass: "bg-blue-500",
    colorHex: "#3B82F6",
    mapCenter: [-36.379, -60.386] as LatLngExpression,
    zoom: 6,
    radiusKm: 180,
    areaGeoJson: embeddedOperationalZoneFeatures["zona-bsas"] as GeoJSON.Feature,
  },
  {
    id: "zona-santafe",
    name: "Santa Fe",
    colorClass: "bg-teal-500",
    colorHex: "#14B8A6",
    mapCenter: [-30.3157, -61.1645] as LatLngExpression,
    zoom: 8,
    radiusKm: 110,
    areaGeoJson: embeddedOperationalZoneFeatures["zona-santafe"] as GeoJSON.Feature,
  },
  {
    id: "zona-sanjuan",
    name: "San Juan",
    colorClass: "bg-orange-500",
    colorHex: "#F97316",
    mapCenter: [-30.7054, -69.1988] as LatLngExpression,
    zoom: 7,
    radiusKm: 90,
    areaGeoJson: embeddedOperationalZoneFeatures["zona-sanjuan"] as GeoJSON.Feature,
  },
  {
    id: "zona-tucuman",
    name: "Tucumán",
    colorClass: "bg-purple-500",
    colorHex: "#A855F7",
    mapCenter: [-27.0448, -65.3658] as LatLngExpression,
    zoom: 7,
    radiusKm: 85,
    areaGeoJson: embeddedOperationalZoneFeatures["zona-tucuman"] as GeoJSON.Feature,
  },
  {
    id: "zona-cordoba",
    name: "Córdoba",
    colorClass: "bg-indigo-500",
    colorHex: "#6366F1",
    mapCenter: [-32.0222, -63.9699] as LatLngExpression,
    zoom: 6,
    radiusKm: 130,
    areaGeoJson: embeddedOperationalZoneFeatures["zona-cordoba"] as GeoJSON.Feature,
  },
];

type OperationsDataContextValue = {
  zones: ZoneConfig[];
  drivers: Driver[];
  users: AppUser[];
  vehicles: Vehicle[];
  documents: DocumentRecord[];
  auditLogs: AuditLog[];
  userDocumentTypesByRole: Record<UserRole, string[]>;
  vehicleDocumentTypes: string[];
  routeTemplates: RouteTemplate[];
  addRouteTemplate: (input: { zoneId: ZoneId; origin: string; destination: string; path: LatLngExpression[] }) => RouteTemplate | null;
  trips: PlannedTrip[];
  invoices: DriverInvoice[];
  expirationRules: ExpirationRule[];
  addTrip: (input: TripInput) => PlannedTrip | null;
  updateTrip: (tripId: string, input: TripUpdateInput) => PlannedTrip | null;
  updateTripStatus: (tripId: string, status: TripStatus) => void;
  cancelTrip: (tripId: string) => void;
  removeTrip: (tripId: string) => void;
  addUser: (input: UserInput) => AppUser;
  updateUserStatus: (userId: string, status: UserStatus) => void;
  removeUser: (userId: string) => void;
  addVehicle: (input: VehicleInput) => Vehicle | null;
  updateVehicleStatus: (vehicleId: string, status: VehicleStatus) => void;
  updateVehicleFleetKind: (vehicleId: string, fleetKind: VehicleFleetKind) => void;
  updateVehicleObservations: (vehicleId: string, observations: string) => void;
  removeVehicle: (vehicleId: string) => void;
  addDocument: (input: DocumentInput) => DocumentRecord | null;
  removeDocument: (documentId: string) => void;
  addInvoice: (input: InvoiceInput) => DriverInvoice | null;
  markInvoiceSigned: (invoiceId: string) => void;
  setExpirationRules: (rules: ExpirationRule[]) => void;
  addZone: (input: ZoneInput) => ZoneConfig | null;
  updateZone: (zoneId: ZoneId, input: ZoneInput) => void;
  removeZone: (zoneId: ZoneId) => void;
  resetDemoData: () => void;
};

const initialZones: ZoneConfig[] = defaultZonesSeed;

function getZoneDefaultsById(zoneId: ZoneId) {
  return initialZones.find((zone) => zone.id === zoneId) ?? null;
}

function ensureValidMapCenter(
  mapCenter: unknown,
  fallback: LatLngExpression,
): LatLngExpression {
  if (!Array.isArray(mapCenter) || mapCenter.length < 2) return fallback;
  const lat = Number(mapCenter[0]);
  const lng = Number(mapCenter[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;
  return [lat, lng];
}

function ensureValidZoom(zoom: unknown, fallback: number) {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(3, Math.min(15, Math.round(value)));
}

function ensureValidRadiusKm(radiusKm: unknown, fallback: number) {
  const value = Number(radiusKm);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(10, Math.min(500, Math.round(value)));
}

function hasSurfaceGeometry(areaGeoJson: ZoneConfig["areaGeoJson"]) {
  if (!areaGeoJson) return false;
  const geometry =
    areaGeoJson.type === "FeatureCollection"
      ? areaGeoJson.features?.[0]?.geometry
      : areaGeoJson.geometry;
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

const legacyZoneAliasMap: Record<string, ZoneId> = {
  "zona-argentina": "zona-bsas",
  "zona-uruguay": "zona-santafe",
  "zona-costa": "zona-santafe",
  "zona-cuyo": "zona-sanjuan",
  "zona-norte": "zona-tucuman",
  "zona-villaconst": "zona-santafe",
  "zona-rosario": "zona-cordoba",
};

function normalizeZoneId(zoneId: string): ZoneId {
  return legacyZoneAliasMap[zoneId] ?? zoneId;
}

const colorHexByClass: Record<string, string> = {
  "bg-blue-500": "#3B82F6",
  "bg-teal-500": "#14B8A6",
  "bg-orange-500": "#F97316",
  "bg-purple-500": "#A855F7",
  "bg-indigo-500": "#6366F1",
};

function normalizeZonesData(zones: ZoneConfig[]) {
  const byId = new Map(
    zones.map((zone) => [normalizeZoneId(zone.id), zone] as const),
  );
  return defaultZonesSeed.map((seed) => {
    const incoming = byId.get(seed.id);
    const incomingArea = incoming ? (hasSurfaceGeometry(incoming.areaGeoJson) ? incoming.areaGeoJson : null) : null;
    return {
      ...seed,
      colorClass: incoming?.colorClass || seed.colorClass,
      colorHex: incoming?.colorHex || colorHexByClass[incoming?.colorClass ?? ""] || seed.colorHex,
      mapCenter: ensureValidMapCenter(incoming?.mapCenter, seed.mapCenter),
      zoom: ensureValidZoom(incoming?.zoom, seed.zoom),
      radiusKm: ensureValidRadiusKm(incoming?.radiusKm, seed.radiusKm),
      areaGeoJson: incomingArea ?? seed.areaGeoJson ?? null,
    };
  });
}

async function fetchZoneBoundary(query: string, countryCode = "ar") {
  /** Nominatim suele bloquear navegadores sin User-Agent válido; las zonas por defecto ya tienen geometría embebida (IGN). */
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&polygon_threshold=0.02&limit=1&countrycodes=${countryCode}&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json", "Accept-Language": "es" } },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as Array<{ display_name?: string; geojson?: GeoJSON.Geometry }>;
  const geometry = payload[0]?.geojson;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  return {
    type: "Feature",
    properties: { display_name: payload[0]?.display_name ?? query },
    geometry,
  } as GeoJSON.Feature;
}

function normalizeUsersData(items: AppUser[]) {
  return items.map((item) => ({ ...item, zoneId: normalizeZoneId(item.zoneId) }));
}

function normalizeTripsData(items: PlannedTrip[]) {
  const UNASSIGNED_DRIVER_LABEL = "Sin asignar";
  const UNASSIGNED_VEHICLE_LABEL = "Sin asignar";
  const normalizeTripStage = (raw: string | undefined): TripStage => {
    const status = (raw ?? "").trim().toLowerCase();
    if (status === "pendiente de aceptación" || status === "pendiente") return "Pendiente";
    if (status === "sin chofer") return "Sin chofer";
    if (status === "asignado") return "Asignado";
    if (status === "aceptado") return "Aceptado";
    if (status === "en planta" || status === "cargando") return "En planta";
    if (status === "en ruta") return "En ruta";
    if (status === "entregado") return "Entregado";
    if (status === "cancelado") return "Cancelado";
    if (status === "reprogramado") return "Reprogramado";
    return "Pendiente";
  };
  const alignTripWithStage = (trip: PlannedTrip, stage: TripStage): PlannedTrip => {
    const driver = trip.driver?.trim() ?? "";
    const vehiclePlate = trip.vehiclePlate?.trim() ?? "";
    if (stage === "Sin chofer") {
      return {
        ...trip,
        driver: UNASSIGNED_DRIVER_LABEL,
        vehiclePlate: UNASSIGNED_VEHICLE_LABEL,
      };
    }
    return {
      ...trip,
      driver: driver || "Chofer N/D",
      vehiclePlate: vehiclePlate || "Patente N/D",
    };
  };
  return items.map((item) => {
    const normalizedStatus = normalizeTripStage(item.status);
    return {
      ...alignTripWithStage(item, normalizedStatus),
      zoneId: normalizeZoneId(item.zoneId),
      status: normalizedStatus,
      clientCompany: item.clientCompany?.trim() || "Cliente general",
      remitoNumber: item.remitoNumber?.trim() || `REM-${item.id}`,
    };
  });
}

const userDocumentTypesByRole: Record<UserRole, string[]> = {
  Administrador: ["DNI", "Contrato Laboral"],
  Operador: ["DNI", "Contrato Laboral"],
  Supervisor: ["DNI", "Contrato Laboral"],
  Chofer: ["Licencia de Conducir", "Psicofísico", "Seguro Personal", "Carnet de Cargas Peligrosas"],
  Visualizador: ["DNI"],
};

const vehicleDocumentTypes = ["VTV", "Seguro del Vehículo", "Habilitación", "Póliza de Carga"];

const initialUsers: AppUser[] = [
  { id: "USR-01", name: "Admin Principal", email: "admin@transportefighera.com", role: "Administrador", status: "Activo", zoneId: "zona-bsas" },
  { id: "USR-02", name: "Operador Logística", email: "operador@transportefighera.com", role: "Operador", status: "Activo", zoneId: "zona-cordoba" },
  { id: "USR-03", name: "Supervisor Rutas", email: "supervisor@transportefighera.com", role: "Supervisor", status: "Activo", zoneId: "zona-santafe" },
  { id: "USR-04", name: "Juan Pérez", email: "juan.perez@transportefighera.com", role: "Chofer", status: "Activo", zoneId: "zona-bsas" },
  { id: "USR-05", name: "María González", email: "maria.gonzalez@transportefighera.com", role: "Chofer", status: "Activo", zoneId: "zona-cordoba" },
  { id: "USR-06", name: "Carlos Rodríguez", email: "carlos.rodriguez@transportefighera.com", role: "Chofer", status: "Activo", zoneId: "zona-sanjuan" },
  { id: "USR-07", name: "Diego Fernández", email: "diego.fernandez@transportefighera.com", role: "Chofer", status: "Activo", zoneId: "zona-tucuman" },
];

const initialVehicles: Vehicle[] = [
  {
    id: "VH-01",
    plate: "AB123CD",
    type: "Camión",
    zoneId: "zona-bsas",
    brand: "Iveco",
    model: "Stralis",
    status: "Activo",
    fleetKind: "Propio",
    observations: "Equipo hidráulico lateral; preferir rampas con altura mín. 1,1 m.",
  },
  { id: "VH-02", plate: "XY456EF", type: "Camión", zoneId: "zona-cordoba", brand: "Scania", model: "R450", status: "Activo", fleetKind: "Fletero", observations: "" },
  { id: "VH-03", plate: "MN789GH", type: "Camión", zoneId: "zona-santafe", brand: "Mercedes-Benz", model: "Actros", status: "Activo", fleetKind: "Fletero", observations: "" },
  { id: "VH-04", plate: "UV890MN", type: "Camión", zoneId: "zona-sanjuan", brand: "Volvo", model: "FH", status: "Mantenimiento", fleetKind: "Fletero", observations: "En taller: revisión de frenos delanteros." },
  { id: "VH-05", plate: "RS320AA", type: "Camión", zoneId: "zona-cordoba", brand: "Mercedes-Benz", model: "Atego", status: "Activo", fleetKind: "Fletero", observations: "" },
  { id: "VH-06", plate: "VC227BB", type: "Camión", zoneId: "zona-tucuman", brand: "Volkswagen", model: "Constellation", status: "Activo", fleetKind: "Propio", observations: "" },
];

function normalizeVehiclesData(items: Vehicle[]) {
  const seedFleetById = new Map(initialVehicles.map((v) => [v.id, v.fleetKind]));
  return items.map((item) => ({
    ...item,
    zoneId: normalizeZoneId(item.zoneId),
    observations: typeof item.observations === "string" ? item.observations : "",
    fleetKind:
      item.fleetKind === "Fletero" || item.fleetKind === "Propio"
        ? item.fleetKind
        : seedFleetById.get(item.id) ?? "Propio",
  }));
}

const initialDocuments: DocumentRecord[] = [
  {
    id: "DOC-01",
    entityType: "user",
    entityId: "USR-04",
    documentType: "Licencia de Conducir",
    expiresAt: "2026-08-15",
    status: "Vigente",
    notes: "Categoría E1 vigente.",
    fileName: "licencia_juan_perez_frente.jpg",
    fileType: "image/jpeg",
    fileSizeKb: 812,
    uploadedAt: "2026-04-15T10:22",
  },
  {
    id: "DOC-02",
    entityType: "user",
    entityId: "USR-04",
    documentType: "Psicofísico",
    expiresAt: "2026-06-02",
    status: "Próximo a vencer",
    notes: "Control médico anual.",
    fileName: "psicofisico_juan_2026.pdf",
    fileType: "application/pdf",
    fileSizeKb: 434,
    uploadedAt: "2026-03-02T08:15",
  },
  {
    id: "DOC-03",
    entityType: "vehicle",
    entityId: "VH-01",
    documentType: "VTV",
    expiresAt: "2026-09-20",
    status: "Vigente",
    notes: "Unidad operativa.",
    fileName: "vtv_ab123cd.pdf",
    fileType: "application/pdf",
    fileSizeKb: 558,
    uploadedAt: "2026-02-20T12:40",
  },
  {
    id: "DOC-04",
    entityType: "vehicle",
    entityId: "VH-04",
    documentType: "Seguro del Vehículo",
    expiresAt: "2026-05-05",
    status: "Próximo a vencer",
    notes: "Renovación en trámite.",
    fileName: "seguro_uv890mn.jpg",
    fileType: "image/jpeg",
    fileSizeKb: 921,
    uploadedAt: "2026-01-11T16:05",
  },
];

const initialAuditLogs: AuditLog[] = [
  { id: 1, dateTime: "2026-04-28 14:32:15", user: "admin@transportefighera.com", ip: "190.123.45.67", action: "Aprobó viaje #VJ-1008" },
  { id: 2, dateTime: "2026-04-28 13:18:42", user: "operador@transportefighera.com", ip: "190.123.45.68", action: "Editó perfil de chofer Juan Pérez" },
  { id: 3, dateTime: "2026-04-28 11:05:33", user: "supervisor@transportefighera.com", ip: "190.123.45.69", action: "Resolvió alerta de desvío #2341" },
];

const initialInvoices: DriverInvoice[] = [
  {
    id: "FAC-01",
    driverId: "USR-04",
    driverName: "Juan Pérez",
    period: "Abril 2026",
    amount: 1250000,
    uploadedAt: "2026-04-28T09:10",
    status: "Firmada",
    fileName: "recibo_sueldo_juan_abril_2026.pdf",
    fileType: "application/pdf",
    fileSizeKb: 286,
    signedAt: "2026-04-28T14:26",
  },
  {
    id: "FAC-02",
    driverId: "USR-05",
    driverName: "María González",
    period: "Abril 2026",
    amount: 1195000,
    uploadedAt: "2026-04-29T08:40",
    status: "Cargada",
    fileName: "recibo_sueldo_maria_abril_2026.pdf",
    fileType: "application/pdf",
    fileSizeKb: 301,
  },
];

function buildId(prefix: string, count: number) {
  return `${prefix}-${String(count).padStart(2, "0")}`;
}

const initialRouteTemplates: RouteTemplate[] = [
  {
    id: "RT-BSAS-001",
    zoneId: "zona-bsas",
    label: "Puerto Madero -> La Plata",
    origin: "Buenos Aires",
    destination: "La Plata",
    path: [
      [-34.6037, -58.3816],
      [-34.72, -58.03],
      [-34.9215, -57.9545],
    ],
  },
  {
    id: "RT-SF-001",
    zoneId: "zona-santafe",
    label: "Santa Fe -> Rafaela",
    origin: "Santa Fe",
    destination: "Rafaela",
    path: [
      [-31.6333, -60.7],
      [-31.25, -61.0],
      [-31.2503, -61.4867],
    ],
  },
  {
    id: "RT-SJ-001",
    zoneId: "zona-sanjuan",
    label: "Mendoza -> San Juan",
    origin: "Mendoza",
    destination: "San Juan",
    path: [
      [-32.8908, -68.8272],
      [-32.35, -68.65],
      [-31.5375, -68.5364],
    ],
  },
  {
    id: "RT-TUC-001",
    zoneId: "zona-tucuman",
    label: "Salta -> Tucumán",
    origin: "Salta",
    destination: "San Miguel de Tucumán",
    path: [
      [-24.7821, -65.4232],
      [-25.35, -65.2],
      [-26.8083, -65.2176],
    ],
  },
  {
    id: "RT-CBA-001",
    zoneId: "zona-cordoba",
    label: "Córdoba Capital -> Villa María",
    origin: "Ciudad de Córdoba",
    destination: "Villa María",
    path: [
      [-31.4167, -64.1833],
      [-31.8675, -63.7167],
      [-32.4085, -63.2466],
    ],
  },
  {
    id: "RT-BSAS-002",
    zoneId: "zona-bsas",
    label: "Buenos Aires -> Zárate",
    origin: "Buenos Aires",
    destination: "Zárate",
    path: [
      [-34.6037, -58.3816],
      [-34.4, -58.9],
      [-34.0981, -59.0286],
    ],
  },
];

const initialTrips: PlannedTrip[] = [
  {
    id: "VJ-1001",
    zoneId: "zona-bsas",
    driver: "Juan Pérez",
    vehiclePlate: "AB123CD",
    origin: "Buenos Aires",
    destination: "La Plata",
    routePath: initialRouteTemplates[0].path,
    progress: 62,
    status: "En ruta",
    cargo: "Insumos alimenticios - 19 toneladas",
    plan: "Salida 06:00, control en peaje Campana, entrega 17:30.",
    scheduledAt: "2026-04-30T15:00",
    clientCompany: "SIDERSA",
    remitoNumber: "R-458821",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1002",
    zoneId: "zona-santafe",
    driver: "María González",
    vehiclePlate: "XY456EF",
    origin: "Santa Fe",
    destination: "Rafaela",
    routePath: initialRouteTemplates[1].path,
    progress: 28,
    status: "En planta",
    cargo: "Acero laminado - 23 toneladas",
    plan: "Carga en planta 09:00, salida estimada 11:15.",
    scheduledAt: "2026-04-30T18:00",
    clientCompany: "Acindar",
    remitoNumber: "R-772910",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1003",
    zoneId: "zona-sanjuan",
    driver: "Carlos Rodríguez",
    vehiclePlate: "MN789GH",
    origin: "Mendoza",
    destination: "San Juan",
    routePath: initialRouteTemplates[2].path,
    progress: 75,
    status: "Entregado",
    cargo: "Paquetería seca - 8 toneladas",
    plan: "Ruta costera con parada de control a mitad de tramo.",
    scheduledAt: "2026-05-01T09:30",
    clientCompany: "CIPLAR",
    remitoNumber: "R-339210",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1004",
    zoneId: "zona-tucuman",
    driver: "Diego Fernández",
    vehiclePlate: "UV890MN",
    origin: "Salta",
    destination: "San Miguel de Tucumán",
    routePath: initialRouteTemplates[3].path,
    progress: 10,
    status: "Aceptado",
    cargo: "Enlatados y bebidas - 14 toneladas",
    plan: "Salida 15:00, ventana de descarga 20:00.",
    scheduledAt: "2026-05-01T15:00",
    clientCompany: "Distribuidora Norte S.A.",
    remitoNumber: "SYS-01004-K9M2PLQX",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1005",
    zoneId: "zona-cordoba",
    driver: "María González",
    vehiclePlate: "RS320AA",
    origin: "Ciudad de Córdoba",
    destination: "Villa María",
    routePath: initialRouteTemplates[4].path,
    progress: 0,
    status: "Pendiente",
    cargo: "Insumos farmacéuticos - 6 toneladas",
    plan: "Salida 07:30 por corredor sur cordobés.",
    scheduledAt: "2026-05-01T07:30",
    clientCompany: "SIDERSA",
    remitoNumber: "R-882301",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1006",
    zoneId: "zona-bsas",
    driver: "Juan Pérez",
    vehiclePlate: "VC227BB",
    origin: "Buenos Aires",
    destination: "Zárate",
    routePath: initialRouteTemplates[5].path,
    progress: 18,
    status: "En planta",
    cargo: "Rollos de acero - 20 toneladas",
    plan: "Ingreso a planta siderúrgica y despacho en ventana AM.",
    scheduledAt: "2026-05-01T11:00",
    clientCompany: "Acindar",
    remitoNumber: "R-991402",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1007",
    zoneId: "zona-bsas",
    driver: "Sin asignar",
    vehiclePlate: "Sin asignar",
    origin: "Buenos Aires",
    destination: "La Plata",
    routePath: initialRouteTemplates[0].path,
    progress: 5,
    status: "Sin chofer",
    cargo: "Material eléctrico - 7 toneladas",
    plan: "Salida nocturna con descarga temprana.",
    scheduledAt: "2026-05-01T22:15",
    clientCompany: "Metalúrgica Sur",
    remitoNumber: "SYS-01007-NP4QS8W2",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1008",
    zoneId: "zona-santafe",
    driver: "Diego Fernández",
    vehiclePlate: "XY456EF",
    origin: "Santa Fe",
    destination: "Rafaela",
    routePath: initialRouteTemplates[1].path,
    progress: 42,
    status: "En ruta",
    cargo: "Bebidas - 12 toneladas",
    plan: "Entrega en centros de distribución costeros.",
    scheduledAt: "2026-05-02T09:00",
    clientCompany: "CIPLAR",
    remitoNumber: "R-110034",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1009",
    zoneId: "zona-sanjuan",
    driver: "Juan Pérez",
    vehiclePlate: "MN789GH",
    origin: "Mendoza",
    destination: "San Juan",
    routePath: initialRouteTemplates[2].path,
    progress: 0,
    status: "Reprogramado",
    cargo: "Insumos vitivinícolas - 11 toneladas",
    plan: "Ruta en corredor andino con control documental.",
    scheduledAt: "2026-05-02T07:45",
    clientCompany: "Logística Integral S.A.",
    remitoNumber: "SYS-01009-ZY7XW3V1",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1010",
    zoneId: "zona-tucuman",
    driver: "María González",
    vehiclePlate: "UV890MN",
    origin: "Salta",
    destination: "San Miguel de Tucumán",
    routePath: initialRouteTemplates[3].path,
    progress: 33,
    status: "En planta",
    cargo: "Cargas generales - 9 toneladas",
    plan: "Consolidación en base Salta y despacho mediodía.",
    scheduledAt: "2026-05-02T13:10",
    clientCompany: "SIDERSA",
    remitoNumber: "R-220011",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1011",
    zoneId: "zona-cordoba",
    driver: "Carlos Rodríguez",
    vehiclePlate: "RS320AA",
    origin: "Ciudad de Córdoba",
    destination: "Villa María",
    routePath: initialRouteTemplates[4].path,
    progress: 61,
    status: "Cancelado",
    cargo: "Agroinsumos - 16 toneladas",
    plan: "Entrega interior sur de la provincia de Córdoba.",
    scheduledAt: "2026-05-02T05:50",
    clientCompany: "Acindar",
    remitoNumber: "R-330922",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1012",
    zoneId: "zona-bsas",
    driver: "Diego Fernández",
    vehiclePlate: "VC227BB",
    origin: "Buenos Aires",
    destination: "Zárate",
    routePath: initialRouteTemplates[5].path,
    progress: 0,
    status: "Pendiente",
    cargo: "Perfiles metálicos - 13 toneladas",
    plan: "Despacho escalonado para ventana de recepción PM.",
    scheduledAt: "2026-05-02T15:30",
    clientCompany: "Cliente varios",
    remitoNumber: "SYS-01012-HJ6KL4MN",
    timeline: [],
    evidencias: [],
  },
];

const initialSyncAlerts: SyncAlert[] = realtimeAlerts.map((alert) => ({
  id: String(alert.id),
  time: alert.time,
  message: alert.message,
  severity: alert.severity === "Alta" ? "Alta" : "Media",
  source: "web",
  status: "Activa",
  alertKind: alert.alertKind,
  vehiclePlate: alert.vehiclePlate,
  tripId: alert.tripId,
}));

const OperationsDataContext = createContext<OperationsDataContextValue | null>(null);

export function OperationsDataProvider({ children }: { children: ReactNode }) {
  const hydratingBoundaries = useRef(false);
  useEffect(() => {
    initSyncStore(initialTrips, initialSyncAlerts);
    initSyncCollection(ZONES_KEY, initialZones);
    initSyncCollection("tf_sync_users_v1", initialUsers);
    initSyncCollection("tf_sync_vehicles_v1", initialVehicles);
    initSyncCollection("tf_sync_documents_v1", initialDocuments);
    initSyncCollection("tf_sync_settings_v1", expirationConfig);
  }, []);

  useEffect(() => {
    const syncCollections = () => {
      const syncedUsers = getSyncUsers<AppUser>();
      const syncedVehicles = getSyncVehicles<Vehicle>();
      const syncedDocuments = getSyncDocuments<DocumentRecord>();
      const syncedSettings = getSyncSettings<ExpirationRule>();
      const syncedZones = getSyncZones<ZoneConfig>();
      if (syncedZones.length) {
        const normalizedZones = normalizeZonesData(syncedZones);
        setZonesState(normalizedZones);
        if (JSON.stringify(normalizedZones) !== JSON.stringify(syncedZones)) {
          setSyncZones(normalizedZones);
        }
      }
      if (syncedUsers.length) {
        const normalizedUsers = normalizeUsersData(syncedUsers);
        setUsers(normalizedUsers);
        if (JSON.stringify(normalizedUsers) !== JSON.stringify(syncedUsers)) setSyncUsers(normalizedUsers);
      }
      if (syncedVehicles.length) {
        const normalizedVehicles = normalizeVehiclesData(syncedVehicles);
        setVehicles(normalizedVehicles);
        if (JSON.stringify(normalizedVehicles) !== JSON.stringify(syncedVehicles)) setSyncVehicles(normalizedVehicles);
      }
      if (syncedDocuments.length) setDocuments(syncedDocuments);
      if (syncedSettings.length) setExpirationRulesState(syncedSettings);
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === "tf_sync_users_v1" ||
        event.key === "tf_sync_vehicles_v1" ||
        event.key === "tf_sync_documents_v1" ||
        event.key === "tf_sync_settings_v1" ||
        event.key === ZONES_KEY
      ) {
        syncCollections();
      }
    };
    const onInternal = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (
        detail?.key === "tf_sync_users_v1" ||
        detail?.key === "tf_sync_vehicles_v1" ||
        detail?.key === "tf_sync_documents_v1" ||
        detail?.key === "tf_sync_settings_v1" ||
        detail?.key === ZONES_KEY
      ) {
        syncCollections();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("tf-sync-store-updated", onInternal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tf-sync-store-updated", onInternal);
    };
  }, []);

  const [trips, setTrips] = useState<PlannedTrip[]>(() => {
    const synced = getSyncTrips() as PlannedTrip[];
    return synced.length ? normalizeTripsData(synced) : initialTrips;
  });
  const [routeTemplatesState, setRouteTemplatesState] = useState<RouteTemplate[]>(initialRouteTemplates);
  const [zonesState, setZonesState] = useState<ZoneConfig[]>(() => {
    const synced = getSyncZones<ZoneConfig>();
    return synced.length ? normalizeZonesData(synced) : initialZones;
  });
  const [users, setUsers] = useState<AppUser[]>(() => {
    const synced = getSyncUsers<AppUser>();
    return synced.length ? normalizeUsersData(synced) : initialUsers;
  });
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    const synced = getSyncVehicles<Vehicle>();
    return synced.length ? normalizeVehiclesData(synced) : initialVehicles;
  });
  const [documents, setDocuments] = useState<DocumentRecord[]>(() => {
    const synced = getSyncDocuments<DocumentRecord>();
    return synced.length ? synced : initialDocuments;
  });
  const [expirationRules, setExpirationRulesState] = useState<ExpirationRule[]>(() => {
    const synced = getSyncSettings<ExpirationRule>();
    return synced.length ? synced : expirationConfig;
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);
  const [invoices, setInvoices] = useState<DriverInvoice[]>(initialInvoices);

  useEffect(() => {
    const syncFromStorage = () => {
      const synced = getSyncTrips() as PlannedTrip[];
      const normalizedTrips = synced.length ? normalizeTripsData(synced) : initialTrips;
      setTrips(normalizedTrips);
      if (synced.length && JSON.stringify(normalizedTrips) !== JSON.stringify(synced)) {
        setSyncTrips(normalizedTrips);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "tf_sync_trips_v1") syncFromStorage();
    };
    const onInternal = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === "tf_sync_trips_v1") syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("tf-sync-store-updated", onInternal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tf-sync-store-updated", onInternal);
    };
  }, []);

  const updateTrips = (updater: (current: PlannedTrip[]) => PlannedTrip[]) => {
    setTrips((prev) => {
      const next = updater(prev);
      setSyncTrips(next);
      return next;
    });
  };
  const updateZones = (updater: (current: ZoneConfig[]) => ZoneConfig[]) => {
    setZonesState((prev) => {
      const next = updater(prev);
      setSyncZones(next);
      return next;
    });
  };

  useEffect(() => {
    const zoneQueries: Array<{ id: ZoneId; query: string }> = [
      { id: "zona-bsas", query: "Provincia de Buenos Aires, Argentina" },
      { id: "zona-tucuman", query: "Provincia de Tucumán, Argentina" },
      { id: "zona-cordoba", query: "Provincia de Córdoba, Argentina" },
      { id: "zona-santafe", query: "Santa Fe, Argentina" },
      { id: "zona-sanjuan", query: "San Juan, Argentina" },
    ];

    const missing = zoneQueries.filter(({ id }) =>
      zonesState.some((zone) => zone.id === id && !hasSurfaceGeometry(zone.areaGeoJson)),
    );
    if (!missing.length || hydratingBoundaries.current) return;
    hydratingBoundaries.current = true;
    let isActive = true;
    Promise.all(
      missing.map(async ({ id, query }) => ({ id, areaGeoJson: await fetchZoneBoundary(query) })),
    ).then((results) => {
      if (!isActive) return;
      const found = results.filter((item) => !!item.areaGeoJson);
      if (!found.length) return;
      updateZones((current) =>
        current.map((zone) => {
          const match = found.find((item) => item.id === zone.id);
          return match ? { ...zone, areaGeoJson: match.areaGeoJson } : zone;
        }),
      );
    }).finally(() => {
      hydratingBoundaries.current = false;
    });

    return () => {
      isActive = false;
    };
  }, [zonesState]);

  const updateUsers = (updater: (current: AppUser[]) => AppUser[]) => {
    setUsers((prev) => {
      const next = updater(prev);
      setSyncUsers(next);
      return next;
    });
  };
  const updateVehicles = (updater: (current: Vehicle[]) => Vehicle[]) => {
    setVehicles((prev) => {
      const next = updater(prev);
      setSyncVehicles(next);
      return next;
    });
  };
  const updateDocuments = (updater: (current: DocumentRecord[]) => DocumentRecord[]) => {
    setDocuments((prev) => {
      const next = updater(prev);
      setSyncDocuments(next);
      return next;
    });
  };
  const updateExpirationRules = (updater: (current: ExpirationRule[]) => ExpirationRule[]) => {
    setExpirationRulesState((prev) => {
      const next = updater(prev);
      setSyncSettings(next);
      return next;
    });
  };

  const performFullDemoReset = () => {
    updateZones(() => initialZones);
    updateUsers(() => initialUsers);
    updateVehicles(() => initialVehicles);
    updateDocuments(() => initialDocuments);
    updateExpirationRules(() => expirationConfig);
    setAuditLogs(initialAuditLogs);
    setInvoices(initialInvoices);
    updateTrips(() => initialTrips);
    resetSyncDemoData(initialTrips, initialSyncAlerts);
    setSyncUsers(initialUsers);
    setSyncVehicles(initialVehicles);
    setSyncDocuments(initialDocuments);
    setSyncSettings(expirationConfig);
    setSyncZones(initialZones);
    toast.success("Demo reiniciada y sincronizada");
  };

  useEffect(() => {
    const onResetRequested = (event: StorageEvent) => {
      if (event.key === RESET_REQUEST_KEY) {
        performFullDemoReset();
      }
    };
    window.addEventListener("storage", onResetRequested);
    return () => window.removeEventListener("storage", onResetRequested);
  }, []);

  const value = useMemo<OperationsDataContextValue>(
    () => ({
      zones: zonesState,
      users,
      drivers: users
        .filter((user) => user.role === "Chofer")
        .map((user) => ({ id: user.id, name: user.name, zoneId: user.zoneId })),
      vehicles,
      documents,
      auditLogs,
      userDocumentTypesByRole,
      vehicleDocumentTypes,
      routeTemplates: routeTemplatesState,
      addRouteTemplate: (input) => {
        const origin = input.origin.trim();
        const destination = input.destination.trim();
        const path = input.path.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
        if (!origin || !destination || path.length < 2) return null;
        const zoneExists = zonesState.some((zone) => zone.id === input.zoneId);
        if (!zoneExists) return null;
        const sequence = routeTemplatesState.length + 1;
        const route: RouteTemplate = {
          id: `RT-CUSTOM-${String(sequence).padStart(3, "0")}`,
          zoneId: input.zoneId,
          label: `${origin} -> ${destination}`,
          origin,
          destination,
          path,
        };
        setRouteTemplatesState((prev) => [route, ...prev]);
        return route;
      },
      trips,
      invoices,
      expirationRules,
      addTrip: (input) => {
        const driver = users.find((item) => item.id === input.driverId && item.role === "Chofer");
        const vehicle = vehicles.find((item) => item.id === input.vehicleId);
        let route = input.routeId ? routeTemplatesState.find((item) => item.id === input.routeId) : undefined;
        if (!route && input.manualRoute) {
          const origin = input.manualRoute.origin.trim();
          const destination = input.manualRoute.destination.trim();
          const path = input.manualRoute.path.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
          if (origin && destination && path.length >= 2) {
            const sequence = routeTemplatesState.length + 1;
            route = {
              id: `RT-CUSTOM-${String(sequence).padStart(3, "0")}`,
              zoneId: input.zoneId,
              label: `${origin} -> ${destination}`,
              origin,
              destination,
              path,
            };
            setRouteTemplatesState((prev) => [route as RouteTemplate, ...prev]);
          }
        }
        if (!driver || !vehicle || !route) return null;
        if (!input.cargo.trim() || !input.plan.trim()) return null;

        const clientCompany = input.clientCompany.trim();
        if (!clientCompany) return null;

        const zoneExists = zonesState.some((zone) => zone.id === input.zoneId);
        if (!zoneExists) return null;
        const sequence = 1000 + trips.length + 1;
        const manualRemito = input.remitoNumber?.trim() ?? "";
        let remitoNumber: string;
        if (isPrincipalClientCompany(clientCompany)) {
          if (!manualRemito) return null;
          remitoNumber = manualRemito;
        } else {
          remitoNumber = generateSystemRemitoReference(sequence);
        }
        const newTrip: PlannedTrip = {
          id: `VJ-${sequence}`,
          zoneId: input.zoneId,
          driver: driver.name,
          vehiclePlate: vehicle.plate,
          origin: route.origin,
          destination: route.destination,
          routePath: route.path,
          progress: 0,
          status: "Pendiente",
          cargo: input.cargo.trim(),
          plan: input.plan.trim(),
          scheduledAt: input.scheduledAt || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
          clientCompany,
          remitoNumber,
          timeline: [],
          evidencias: [],
        };
        updateTrips((prev) => [newTrip, ...prev]);
        toast.message(`Viaje ${newTrip.id} creado`, {
          description: "Esperando aceptación del chofer...",
        });
        window.setTimeout(() => {
          updateTrips((prev) =>
            prev.map((trip) =>
              trip.id === newTrip.id
                ? {
                    ...trip,
                    status: "Aceptado",
                    progress: 10,
                  }
                : trip,
            ),
          );
          toast.success(`Chofer aceptó ${newTrip.id}`, {
            description: `${newTrip.driver} confirmó el viaje. Ya se muestra en el mapa.`,
          });
        }, 6000);
        return newTrip;
      },
      updateTrip: (tripId, input) => {
        const target = trips.find((trip) => trip.id === tripId);
        if (!target) return null;

        const clientCompany = input.clientCompany.trim();
        if (!clientCompany) return null;

        const trimmedDriver = input.driver.trim();
        const trimmedPlate = input.vehiclePlate.trim().toUpperCase();
        const origin = input.origin.trim();
        const destination = input.destination.trim();
        const cargo = input.cargo.trim();
        const plan = input.plan.trim();
        if (!origin || !destination || !cargo || !plan) return null;

        const zoneExists = zonesState.some((zone) => zone.id === input.zoneId);
        if (!zoneExists) return null;

        let remitoNumber = input.remitoNumber?.trim() ?? "";
        if (isPrincipalClientCompany(clientCompany)) {
          if (!remitoNumber) return null;
        } else if (!remitoNumber) {
          const sequence = Number(target.id.replace(/\D/g, "")) || 1000 + trips.length + 1;
          remitoNumber = generateSystemRemitoReference(sequence);
        }

        const normalizedDriver =
          input.status === "Sin chofer" ? "Sin asignar" : trimmedDriver || "Chofer N/D";
        const normalizedVehicle =
          input.status === "Sin chofer" ? "Sin asignar" : trimmedPlate || "Patente N/D";

        const updatedTrip: PlannedTrip = {
          ...target,
          zoneId: input.zoneId,
          driver: normalizedDriver,
          vehiclePlate: normalizedVehicle,
          origin,
          destination,
          cargo,
          plan,
          scheduledAt: input.scheduledAt || target.scheduledAt,
          clientCompany,
          remitoNumber,
          status: input.status,
          progress:
            input.status === "Entregado"
              ? 100
              : input.status === "Cancelado"
                ? 0
                : target.progress,
        };

        updateTrips((prev) => prev.map((trip) => (trip.id === tripId ? updatedTrip : trip)));
        toast.success(`Viaje ${tripId} actualizado`);
        return updatedTrip;
      },
      updateTripStatus: (tripId, status) => {
        updateTrips((prev) =>
          prev.map((trip) =>
            trip.id === tripId
              ? {
                  ...trip,
                  status,
                  progress: status === "Entregado" ? 100 : trip.progress,
                }
              : trip,
          ),
        );
        if (status === "Entregado") {
          const trip = trips.find((item) => item.id === tripId);
          resolveSyncAlertsByTrip(tripId, trip?.vehiclePlate);
          toast.success(`Viaje ${tripId} finalizado. Alertas asociadas resueltas.`);
        }
      },
      cancelTrip: (tripId) => {
        updateTrips((prev) =>
          prev.map((trip) =>
            trip.id === tripId
              ? {
                  ...trip,
                  status: "Cancelado",
                  progress: 0,
                }
              : trip,
          ),
        );
        toast.warning(`Viaje ${tripId} cancelado`);
      },
      removeTrip: (tripId) => {
        updateTrips((prev) => prev.filter((trip) => trip.id !== tripId));
        toast.message(`Viaje ${tripId} eliminado`);
      },
      addUser: (input) => {
        const user: AppUser = {
          id: buildId("USR", users.length + 1),
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          role: input.role,
          status: "Activo",
          zoneId: input.zoneId,
        };
        updateUsers((prev) => [user, ...prev]);
        setAuditLogs((prev) => [{ id: prev.length + 1, dateTime: new Date().toLocaleString("sv-SE"), user: "admin@transportefighera.com", ip: "190.123.45.67", action: `Creó usuario ${user.email}` }, ...prev]);
        toast.success(`Usuario ${user.name} creado`);
        return user;
      },
      updateUserStatus: (userId, status) => {
        updateUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, status } : user)));
      },
      removeUser: (userId) => {
        updateUsers((prev) => prev.filter((user) => user.id !== userId));
        updateDocuments((prev) => prev.filter((doc) => !(doc.entityType === "user" && doc.entityId === userId)));
        setInvoices((prev) => prev.filter((invoice) => invoice.driverId !== userId));
      },
      addVehicle: (input) => {
        if (!input.plate.trim()) return null;
        const vehicle: Vehicle = {
          id: buildId("VH", vehicles.length + 1),
          plate: input.plate.trim().toUpperCase(),
          type: input.type,
          zoneId: input.zoneId,
          brand: input.brand.trim(),
          model: input.model.trim(),
          status: "Activo",
          fleetKind: input.fleetKind === "Fletero" ? "Fletero" : "Propio",
          observations: input.observations?.trim() ?? "",
        };
        updateVehicles((prev) => [vehicle, ...prev]);
        toast.success(`Vehículo ${vehicle.plate} creado`);
        return vehicle;
      },
      updateVehicleStatus: (vehicleId, status) => {
        updateVehicles((prev) => prev.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, status } : vehicle)));
        toast.message(`Estado de vehículo actualizado a ${status}`);
      },
      updateVehicleFleetKind: (vehicleId, fleetKind) => {
        updateVehicles((prev) =>
          prev.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, fleetKind } : vehicle)),
        );
        toast.message(`Vehículo marcado como ${fleetKind === "Propio" ? "propio" : "fletero"}`);
      },
      updateVehicleObservations: (vehicleId, observations) => {
        updateVehicles((prev) =>
          prev.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, observations: observations.trim() } : vehicle)),
        );
        toast.message("Observaciones del vehículo actualizadas");
      },
      removeVehicle: (vehicleId) => {
        updateVehicles((prev) => prev.filter((vehicle) => vehicle.id !== vehicleId));
        updateDocuments((prev) => prev.filter((doc) => !(doc.entityType === "vehicle" && doc.entityId === vehicleId)));
      },
      addDocument: (input) => {
        const targetVehicle = input.entityType === "vehicle" ? vehicles.find((item) => item.id === input.entityId) : undefined;
        const fleteroVehiculo = targetVehicle?.fleetKind === "Fletero";
        if (!input.entityId || !input.documentType || !input.fileName) return null;
        const expiresRaw = input.expiresAt?.trim() ?? "";
        if (!fleteroVehiculo && !expiresRaw) return null;
        const expiresAt = fleteroVehiculo && !expiresRaw ? "2099-12-31" : expiresRaw;
        const today = new Date();
        const exp = new Date(expiresAt);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status: DocumentRecord["status"] = days < 0 ? "Vencido" : days <= 30 ? "Próximo a vencer" : "Vigente";
        const doc: DocumentRecord = {
          id: buildId("DOC", documents.length + 1),
          entityType: input.entityType,
          entityId: input.entityId,
          documentType: input.documentType,
          expiresAt,
          status,
          notes: input.notes.trim(),
          fileName: input.fileName,
          fileType: input.fileType,
          fileSizeKb: input.fileSizeKb,
          uploadedAt: new Date().toISOString().slice(0, 16),
        };
        updateDocuments((prev) => [doc, ...prev]);
        toast.success(`Documento ${doc.documentType} cargado`);
        return doc;
      },
      removeDocument: (documentId) => {
        updateDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      },
      addInvoice: (input) => {
        const driver = users.find((user) => user.id === input.driverId && user.role === "Chofer");
        if (!driver || !input.fileName || !input.period.trim()) return null;
        const invoice: DriverInvoice = {
          id: buildId("FAC", invoices.length + 1),
          driverId: driver.id,
          driverName: driver.name,
          period: input.period.trim(),
          amount: input.amount,
          uploadedAt: new Date().toISOString().slice(0, 16),
          status: "Cargada",
          fileName: input.fileName,
          fileType: input.fileType,
          fileSizeKb: input.fileSizeKb,
        };
        setInvoices((prev) => [invoice, ...prev]);
        toast.success(`Factura ${invoice.id} cargada para ${invoice.driverName}`);
        window.setTimeout(() => {
          setInvoices((prev) =>
            prev.map((item) =>
              item.id === invoice.id
                ? { ...item, status: "Firmada", signedAt: new Date().toISOString().slice(0, 16) }
                : item,
            ),
          );
          toast.message(`Chofer firmó ${invoice.id}`, {
            description: `${invoice.driverName} firmó la factura desde la app móvil.`,
          });
        }, 6000);
        return invoice;
      },
      markInvoiceSigned: (invoiceId) => {
        setInvoices((prev) =>
          prev.map((item) =>
            item.id === invoiceId
              ? { ...item, status: "Firmada", signedAt: new Date().toISOString().slice(0, 16) }
              : item,
          ),
        );
      },
      setExpirationRules: (rules) => {
        updateExpirationRules(() => rules);
      },
      addZone: (input) => {
        const normalizedName = input.name.trim();
        if (!normalizedName) return null;
        const slug = normalizedName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const zoneId = `zona-${slug || Date.now()}`;
        if (zonesState.some((zone) => zone.id === zoneId || zone.name.toLowerCase() === normalizedName.toLowerCase())) {
          toast.error("Ya existe una zona con ese nombre.");
          return null;
        }
        const zone: ZoneConfig = {
          id: zoneId,
          name: normalizedName,
          colorClass: input.colorClass,
          colorHex: colorHexByClass[input.colorClass] ?? "#3B82F6",
          mapCenter: input.mapCenter,
          zoom: input.zoom,
          radiusKm: ensureValidRadiusKm(input.radiusKm, 60),
          areaGeoJson: input.areaGeoJson ?? null,
        };
        updateZones((prev) => [zone, ...prev]);
        toast.success(`Zona ${zone.name} creada`);
        return zone;
      },
      updateZone: (zoneId, input) => {
        updateZones((prev) =>
          prev.map((zone) =>
            zone.id === zoneId
              ? {
                  ...zone,
                  name: input.name.trim() || zone.name,
                  colorClass: input.colorClass,
                  colorHex: colorHexByClass[input.colorClass] ?? zone.colorHex,
                  mapCenter: input.mapCenter,
                  zoom: input.zoom,
                  radiusKm: ensureValidRadiusKm(input.radiusKm, zone.radiusKm),
                  areaGeoJson: input.areaGeoJson ?? zone.areaGeoJson ?? null,
                }
              : zone,
          ),
        );
        toast.success("Zona actualizada");
      },
      removeZone: (zoneId) => {
        const zone = zonesState.find((item) => item.id === zoneId);
        if (!zone) return;
        const linkedTrips = trips.some((trip) => trip.zoneId === zoneId);
        const linkedUsers = users.some((user) => user.zoneId === zoneId);
        const linkedVehicles = vehicles.some((vehicle) => vehicle.zoneId === zoneId);
        const linkedRoutes = routeTemplatesState.some((route) => route.zoneId === zoneId);
        if (linkedTrips || linkedUsers || linkedVehicles || linkedRoutes) {
          toast.error("No se puede eliminar la zona porque tiene viajes, usuarios, vehículos o rutas asociadas.");
          return;
        }
        if (zonesState.length <= 1) {
          toast.error("Debe existir al menos una zona.");
          return;
        }
        updateZones((prev) => prev.filter((item) => item.id !== zoneId));
        toast.success(`Zona ${zone.name} eliminada`);
      },
      resetDemoData: () => {
        performFullDemoReset();
      },
    }),
    [trips, zonesState, users, vehicles, documents, auditLogs, invoices, expirationRules, routeTemplatesState],
  );

  return <OperationsDataContext.Provider value={value}>{children}</OperationsDataContext.Provider>;
}

export function useOperationsData() {
  const context = useContext(OperationsDataContext);
  if (!context) {
    throw new Error("useOperationsData must be used within OperationsDataProvider");
  }
  return context;
}

