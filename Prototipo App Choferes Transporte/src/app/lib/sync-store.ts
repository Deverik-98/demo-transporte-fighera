import { LatLngExpression } from "leaflet";

export type SyncZoneId = "zona-argentina" | "zona-uruguay";
export type SyncTripStatus =
  | "Pendiente de aceptación"
  | "Asignado"
  | "En Planta"
  | "Cargando"
  | "En Ruta"
  | "Entregado"
  | "Cancelado";

export type SyncTrip = {
  id: string;
  zoneId: SyncZoneId;
  driver: string;
  vehiclePlate: string;
  origin: string;
  destination: string;
  routePath: LatLngExpression[];
  progress: number;
  status: SyncTripStatus;
  cargo: string;
  plan: string;
  scheduledAt: string;
  timeline?: Array<{ timestamp: string; descripcion: string }>;
  evidencias?: Array<{ tipo: string; nombre: string; fecha: string }>;
};

export type SyncAlert = {
  id: string;
  time: string;
  message: string;
  severity: "Alta" | "Media";
  source: "mobile" | "web";
  status: "Activa" | "Resuelta";
  tripId?: string;
  vehiclePlate?: string;
  resolvedAt?: string;
};

export const TRIPS_KEY = "tf_sync_trips_v1";
export const ALERTS_KEY = "tf_sync_alerts_v1";
export const VEHICLES_KEY = "tf_sync_vehicles_v1";
export const DOCUMENTS_KEY = "tf_sync_documents_v1";
export const RESET_REQUEST_KEY = "tf_sync_reset_request_v1";
const INTERNAL_EVENT = "tf-sync-store-updated";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(INTERNAL_EVENT, { detail: { key } }));
}

export function getSyncTrips() {
  return readJson<SyncTrip[]>(TRIPS_KEY, []);
}

export function setSyncTrips(next: SyncTrip[]) {
  writeJson(TRIPS_KEY, next);
}

export function getSyncAlerts() {
  return readJson<SyncAlert[]>(ALERTS_KEY, []);
}

export function setSyncAlerts(next: SyncAlert[]) {
  writeJson(ALERTS_KEY, next);
}

export function getSyncVehicles<T>() {
  return readJson<T[]>(VEHICLES_KEY, []);
}

export function getSyncDocuments<T>() {
  return readJson<T[]>(DOCUMENTS_KEY, []);
}

export function appendCriticalAlert(input: Omit<SyncAlert, "id" | "severity" | "source" | "time"> & { message: string }) {
  const next: SyncAlert = {
    id: `AL-${Date.now()}`,
    time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    message: input.message,
    severity: "Alta",
    source: "mobile",
    status: "Activa",
    tripId: input.tripId,
    vehiclePlate: input.vehiclePlate,
  };
  const current = getSyncAlerts();
  setSyncAlerts([next, ...current]);
}

export function resetSyncDemoData(seedTrips: SyncTrip[], seedAlerts: SyncAlert[]) {
  setSyncTrips(seedTrips);
  setSyncAlerts(seedAlerts);
}

export function requestGlobalDemoReset() {
  writeJson(RESET_REQUEST_KEY, { requestedAt: Date.now() });
}
