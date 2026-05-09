import { useEffect, useState } from "react";
import { LatLngExpression } from "leaflet";

export type SyncZoneId = string;
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
export const USERS_KEY = "tf_sync_users_v1";
export const VEHICLES_KEY = "tf_sync_vehicles_v1";
export const DOCUMENTS_KEY = "tf_sync_documents_v1";
export const SETTINGS_KEY = "tf_sync_settings_v1";
export const ZONES_KEY = "tf_sync_zones_v3";
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

export function initSyncStore(seedTrips: SyncTrip[], seedAlerts: SyncAlert[]) {
  const trips = readJson<SyncTrip[]>(TRIPS_KEY, []);
  const alerts = readJson<SyncAlert[]>(ALERTS_KEY, []);
  if (!trips.length) writeJson(TRIPS_KEY, seedTrips);
  if (!alerts.length) writeJson(ALERTS_KEY, seedAlerts);
}

export function initSyncCollection<T>(key: string, seed: T[]) {
  const current = readJson<T[]>(key, []);
  if (!current.length) writeJson(key, seed);
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

export function resolveSyncAlert(alertId: string) {
  const current = getSyncAlerts();
  const next = current.map((alert) =>
    alert.id === alertId
      ? {
          ...alert,
          status: "Resuelta" as const,
          resolvedAt: new Date().toLocaleString("es-AR"),
        }
      : alert,
  );
  setSyncAlerts(next);
}

export function resolveSyncAlertsByTrip(tripId: string, vehiclePlate?: string) {
  const current = getSyncAlerts();
  const next = current.map((alert) =>
    alert.status === "Activa" && (alert.tripId === tripId || (!!vehiclePlate && alert.vehiclePlate === vehiclePlate))
      ? {
          ...alert,
          status: "Resuelta" as const,
          resolvedAt: new Date().toLocaleString("es-AR"),
        }
      : alert,
  );
  setSyncAlerts(next);
}

export function getSyncUsers<T>() {
  return readJson<T[]>(USERS_KEY, []);
}
export function setSyncUsers<T>(next: T[]) {
  writeJson(USERS_KEY, next);
}
export function getSyncVehicles<T>() {
  return readJson<T[]>(VEHICLES_KEY, []);
}
export function setSyncVehicles<T>(next: T[]) {
  writeJson(VEHICLES_KEY, next);
}
export function getSyncDocuments<T>() {
  return readJson<T[]>(DOCUMENTS_KEY, []);
}
export function setSyncDocuments<T>(next: T[]) {
  writeJson(DOCUMENTS_KEY, next);
}
export function getSyncSettings<T>() {
  return readJson<T[]>(SETTINGS_KEY, []);
}
export function setSyncSettings<T>(next: T[]) {
  writeJson(SETTINGS_KEY, next);
}
export function getSyncZones<T>() {
  return readJson<T[]>(ZONES_KEY, []);
}
export function setSyncZones<T>(next: T[]) {
  writeJson(ZONES_KEY, next);
}

export function resetSyncDemoData(seedTrips: SyncTrip[], seedAlerts: SyncAlert[]) {
  writeJson(TRIPS_KEY, seedTrips);
  writeJson(ALERTS_KEY, seedAlerts);
}

export function requestGlobalDemoReset() {
  writeJson(RESET_REQUEST_KEY, { requestedAt: Date.now() });
}

export function useSyncAlerts(seedAlerts: SyncAlert[]) {
  const [alerts, setAlerts] = useState<SyncAlert[]>(() => {
    const current = getSyncAlerts();
    return current.length ? current : seedAlerts;
  });

  useEffect(() => {
    const refresh = () => setAlerts(getSyncAlerts());
    const onStorage = (event: StorageEvent) => {
      if (event.key === ALERTS_KEY) refresh();
    };
    const onInternal = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === ALERTS_KEY) refresh();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(INTERNAL_EVENT, onInternal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(INTERNAL_EVENT, onInternal);
    };
  }, []);

  return alerts;
}
