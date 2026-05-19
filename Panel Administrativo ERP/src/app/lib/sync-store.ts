import { useEffect, useState } from "react";
import { LatLngExpression } from "leaflet";
import { normalizeClientCompanyDisplay } from "./trip-clients";

export type SyncZoneId = string;
export type SyncTripStatus =
  | "Sin chofer"
  | "Asignado"
  | "Aceptado"
  | "En planta"
  | "En ruta"
  | "Entregado"
  | "Cancelado"
  | "Reprogramado";

export type SyncTrip = {
  id: string;
  zoneId: SyncZoneId;
  driver: string;
  vehiclePlate: string;
  origin: string;
  destination: string;
  /** Paradas en orden (primera = origen, última = destino). Opcional en datos legacy. */
  routeStops?: string[];
  routePath: LatLngExpression[];
  progress: number;
  status: SyncTripStatus;
  cargo: string;
  plan: string;
  /** Uso interno en panel admin (no visible para choferes). */
  internalNote?: string;
  scheduledAt: string;
  clientCompany?: string;
  /** Plan de carga alfanumérico (clientes con nomenclatura, longitud fija) o ID correlativo AUTO-* (`remitoNumber` en JSON). */
  remitoNumber?: string;
  timeline?: Array<{ timestamp: string; descripcion: string }>;
  evidencias?: Array<{
    id: string;
    tripId?: string;
    name?: string;
    type?: "Remito" | "Ticket" | "Gasto" | "Otro";
    url?: string;
    date?: string;
    uploadedBy?: string;
    tipo?: string;
    nombre?: string;
    fecha?: string;
    source?: "admin" | "chofer";
  }>;
};

/** vehicle_documentation = vencimientos de papeles del camión; solo aplica a flota propia (no fleteros). */
export type SyncAlertKind = "vehicle_documentation" | "operational" | "driver_documentation";

export type SyncAlert = {
  id: string;
  time: string;
  message: string;
  severity: "Alta" | "Media";
  source: "mobile" | "web";
  status: "Activa" | "Resuelta";
  tripId?: string;
  vehiclePlate?: string;
  /** Sin definir: se trata como operativo (retrocompatibilidad). */
  alertKind?: SyncAlertKind;
  resolvedAt?: string;
};

/** Alertas de documentación vehicular: solo si la patente es flota propia. Resto de alertas sin cambios. */
export function filterAlertsByFleetDocumentationPolicy<
  V extends { plate: string; fleetKind: "Propio" | "Fletero" },
>(alerts: SyncAlert[], vehicles: V[]): SyncAlert[] {
  const propioPlates = new Set(
    vehicles.filter((v) => v.fleetKind === "Propio").map((v) => v.plate.trim().toUpperCase()),
  );
  return alerts.filter((alert) => {
    if (alert.alertKind !== "vehicle_documentation") return true;
    const plate = alert.vehiclePlate?.trim().toUpperCase();
    if (!plate) return false;
    return propioPlates.has(plate);
  });
}

const LEGACY_TRIPS_KEY = "tf_sync_trips_v2";
/** v3: nombres de clientes Sidersa / Acindar / Sipar y datos con ortografía actualizada. */
export const TRIPS_KEY = "tf_sync_trips_v3";
export const ALERTS_KEY = "tf_sync_alerts_v3";
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
  const serialized = JSON.stringify(value);
  window.localStorage.setItem(key, serialized);
  window.dispatchEvent(new CustomEvent(INTERNAL_EVENT, { detail: { key } }));
  try {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue: serialized,
        storageArea: window.localStorage,
        url: window.location.href,
      }),
    );
  } catch {
    // Fallback: listeners internos ya cubren sincronía en la misma pestaña.
  }
}

function normalizeTripsForStorage(trips: SyncTrip[]): SyncTrip[] {
  return trips.map((trip) => ({
    ...trip,
    clientCompany: trip.clientCompany ? normalizeClientCompanyDisplay(trip.clientCompany) : trip.clientCompany,
  }));
}

function loadTripsWithMigration(): SyncTrip[] {
  const current = readJson<SyncTrip[]>(TRIPS_KEY, []);
  if (current.length) return normalizeTripsForStorage(current);
  const legacy = readJson<SyncTrip[]>(LEGACY_TRIPS_KEY, []);
  if (legacy.length) {
    const migrated = normalizeTripsForStorage(legacy);
    writeJson(TRIPS_KEY, migrated);
    return migrated;
  }
  return [];
}

export function initSyncStore(seedTrips: SyncTrip[], seedAlerts: SyncAlert[]) {
  const trips = loadTripsWithMigration();
  const alerts = readJson<SyncAlert[]>(ALERTS_KEY, []);
  if (!trips.length) writeJson(TRIPS_KEY, normalizeTripsForStorage(seedTrips));
  if (!alerts.length) writeJson(ALERTS_KEY, seedAlerts);
}

export function initSyncCollection<T>(key: string, seed: T[]) {
  const current = readJson<T[]>(key, []);
  if (!current.length) writeJson(key, seed);
}

export function getSyncTrips() {
  return normalizeTripsForStorage(readJson<SyncTrip[]>(TRIPS_KEY, []));
}

export function setSyncTrips(next: SyncTrip[]) {
  writeJson(TRIPS_KEY, normalizeTripsForStorage(next));
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

/** Si la alerta tiene `tripId`, solo aplica a ese viaje. Sin `tripId`, se cruza por patente (alertas legacy / sin viaje). */
export function alertBelongsToOperationalTrip(
  alert: Pick<SyncAlert, "tripId" | "vehiclePlate">,
  tripId: string,
  tripVehiclePlate: string,
): boolean {
  const tid = alert.tripId?.trim();
  if (tid) return tid === tripId;
  const plate = tripVehiclePlate.trim().toUpperCase();
  if (!plate || plate === "SIN ASIGNAR" || plate === "PATENTE N/D") return false;
  const ap = alert.vehiclePlate?.trim().toUpperCase() ?? "";
  return Boolean(ap && ap === plate);
}

export function resolveSyncAlertsByTrip(tripId: string, vehiclePlate?: string) {
  const current = getSyncAlerts();
  const next = current.map((alert) =>
    alert.status === "Activa" && alertBelongsToOperationalTrip(alert, tripId, vehiclePlate ?? "")
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
