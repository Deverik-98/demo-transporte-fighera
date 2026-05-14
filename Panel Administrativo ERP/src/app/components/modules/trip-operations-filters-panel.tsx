import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Filter, Search, Truck } from "lucide-react";
import type { TripStage, VehicleFleetKind, ZoneId } from "../../lib/operations-data";
import {
  TRIP_KANBAN_AND_FILTER_STAGES,
  type TripDatePreset,
  type TripOperationsFilters,
} from "../../lib/trip-operations-filters";

type TripOperationsFiltersPanelProps = {
  filters: TripOperationsFilters;
  onPatch: (patch: Partial<TripOperationsFilters>) => void;
  onClear: () => void;
  zones: Array<{ id: ZoneId; name: string }>;
  /** Clases del grid de selects (columnas responsive). */
  filtersGridClassName?: string;
  searchPlaceholder?: string;
};

export function TripOperationsFiltersPanel({
  filters,
  onPatch,
  onClear,
  zones,
  filtersGridClassName = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:w-[min(100%,1180px)]",
  searchPlaceholder = "Buscar por ID, chofer, patente, empresa, plan de carga o ruta…",
}: TripOperationsFiltersPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={searchPlaceholder}
          value={filters.search}
          onChange={(event) => onPatch({ search: event.target.value })}
        />
      </div>
      <div className={filtersGridClassName}>
        <Select value={filters.zoneId} onValueChange={(value: ZoneId | "all") => onPatch({ zoneId: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Zona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las zonas</SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(value: TripStage | "all") => onPatch({ status: value })}>
          <SelectTrigger>
            <Filter className="mr-2 h-4 w-4 shrink-0" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {TRIP_KANBAN_AND_FILTER_STAGES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.datePreset}
          onValueChange={(value: TripDatePreset) => {
            onPatch({ datePreset: value, ...(value !== "specific" ? { specificDate: "" } : {}) });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Fecha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las fechas</SelectItem>
            <SelectItem value="today">Hoy</SelectItem>
            <SelectItem value="tomorrow">Mañana</SelectItem>
            <SelectItem value="upcoming">Próximos días</SelectItem>
            <SelectItem value="specific">Fecha específica</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filters.specificDate}
          disabled={filters.datePreset !== "specific"}
          onChange={(event) => {
            const v = event.target.value;
            onPatch({ specificDate: v, ...(v ? { datePreset: "specific" } : {}) });
          }}
        />
        <Select value={filters.fleet} onValueChange={(value: "all" | VehicleFleetKind) => onPatch({ fleet: value })}>
          <SelectTrigger>
            <Truck className="mr-2 h-4 w-4 shrink-0" />
            <SelectValue placeholder="Flota" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda la flota</SelectItem>
            <SelectItem value="Propio">Solo vehículos propios</SelectItem>
            <SelectItem value="Fletero">Solo fleteros</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" className="w-full shrink-0 lg:w-auto" onClick={onClear}>
          Limpiar filtros
        </Button>
      </div>
    </div>
  );
}

export function ZoneTripCountBadges({
  zones,
  countsByZoneId,
}: {
  zones: Array<{ id: ZoneId; name: string; colorClass?: string }>;
  countsByZoneId: Map<ZoneId, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {zones.map((zone) => (
        <div key={zone.id} className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
          {zone.colorClass ? <span className={`h-2.5 w-2.5 rounded-full ${zone.colorClass}`} /> : null}
          <span>{zone.name}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {countsByZoneId.get(zone.id) ?? 0}
          </Badge>
        </div>
      ))}
    </div>
  );
}
