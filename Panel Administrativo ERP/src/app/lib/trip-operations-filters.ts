import type { PlannedTrip, TripStage, Vehicle, VehicleFleetKind, ZoneId } from "./operations-data";
import { formatTripRouteStops } from "./trip-route";

/** Orden Kanban / opciones de filtro por estado (sin Pendiente). */
export const TRIP_KANBAN_AND_FILTER_STAGES: TripStage[] = [
  "Sin chofer",
  "Asignado",
  "Aceptado",
  "En planta",
  "En ruta",
  "Entregado",
  "Cancelado",
  "Reprogramado",
];

export type TripDatePreset = "all" | "today" | "tomorrow" | "upcoming" | "specific";

export type TripOperationsFilters = {
  search: string;
  zoneId: ZoneId | "all";
  status: TripStage | "all";
  datePreset: TripDatePreset;
  /** `YYYY-MM-DD` cuando `datePreset === "specific"`. */
  specificDate: string;
  fleet: "all" | VehicleFleetKind;
};

export function defaultTripOperationsFilters(): TripOperationsFilters {
  return {
    search: "",
    zoneId: "all",
    status: "all",
    datePreset: "all",
    specificDate: "",
    fleet: "all",
  };
}

export function normalizePlateValue(plate: string) {
  return plate.trim().toUpperCase();
}

export function buildFleetKindResolver(vehicles: Vehicle[]) {
  const map = new Map<string, VehicleFleetKind>();
  vehicles.forEach((v) => {
    if (v.type === "Camión") map.set(normalizePlateValue(v.plate), v.fleetKind);
  });
  return (plate: string) => map.get(normalizePlateValue(plate));
}

function toDateOnly(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function tripMatchesOperationsFilters(
  trip: PlannedTrip,
  filters: TripOperationsFilters,
  getFleetKind: (plate: string) => VehicleFleetKind | undefined,
  options?: { skipZone?: boolean },
): boolean {
  const query = filters.search.trim().toLowerCase();
  const matchesQuery =
    !query ||
    trip.id.toLowerCase().includes(query) ||
    trip.driver.toLowerCase().includes(query) ||
    trip.vehiclePlate.toLowerCase().includes(query) ||
    trip.clientCompany.toLowerCase().includes(query) ||
    trip.remitoNumber.toLowerCase().includes(query) ||
    `${trip.origin} ${trip.destination} ${formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}`.toLowerCase().includes(query);

  const matchesStatus = filters.status === "all" || trip.status === filters.status;
  const fleetKind = getFleetKind(trip.vehiclePlate);
  const matchesFleet = filters.fleet === "all" || fleetKind === filters.fleet;

  const today = toDateOnly(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfWeek = new Date(today);
  const daysUntilSunday = today.getDay() === 0 ? 0 : 7 - today.getDay();
  endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
  const specificDateObj = filters.specificDate ? new Date(`${filters.specificDate}T00:00:00`) : null;
  const tripDate = new Date(trip.scheduledAt);
  let matchesDate = true;
  if (filters.datePreset === "today") {
    matchesDate = isSameDay(tripDate, today);
  } else if (filters.datePreset === "tomorrow") {
    matchesDate = isSameDay(tripDate, tomorrow);
  } else if (filters.datePreset === "upcoming") {
    matchesDate = tripDate > tomorrow && tripDate <= endOfWeek;
  } else if (filters.datePreset === "specific") {
    matchesDate = specificDateObj ? isSameDay(tripDate, specificDateObj) : false;
  }

  const matchesZone = options?.skipZone || filters.zoneId === "all" || trip.zoneId === filters.zoneId;

  return matchesQuery && matchesStatus && matchesFleet && matchesDate && matchesZone;
}

export function filterTripsForOperations(
  trips: PlannedTrip[],
  filters: TripOperationsFilters,
  getFleetKind: (plate: string) => VehicleFleetKind | undefined,
): PlannedTrip[] {
  return trips.filter((t) => tripMatchesOperationsFilters(t, filters, getFleetKind));
}

/** Etiqueta legible para impresión / leyendas (Gestión de viajes y Centro de operaciones). */
export function summarizeTripOperationsFilters(
  filters: TripOperationsFilters,
  zones: Array<{ id: ZoneId; name: string }>,
): string {
  const labels: string[] = [];
  if (filters.status !== "all") labels.push(`estado ${filters.status.toLowerCase()}`);
  if (filters.fleet !== "all") labels.push(`flota ${filters.fleet.toLowerCase()}`);
  if (filters.zoneId !== "all") {
    const zoneName = zones.find((z) => z.id === filters.zoneId)?.name ?? filters.zoneId;
    labels.push(`zona ${zoneName}`);
  }
  if (filters.datePreset === "today") labels.push("hoy");
  if (filters.datePreset === "tomorrow") labels.push("mañana");
  if (filters.datePreset === "upcoming") labels.push("próximos días");
  if (filters.datePreset === "specific" && filters.specificDate) labels.push(`fecha ${filters.specificDate}`);
  if (filters.search.trim()) labels.push(`búsqueda "${filters.search.trim()}"`);
  return labels.length ? labels.join(" · ") : "sin filtros (todos los viajes visibles)";
}
