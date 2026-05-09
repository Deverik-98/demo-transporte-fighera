import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useOperationsData, TripStatus, ZoneId } from "../../lib/operations-data";
import { CheckCircle2, Navigation, Search, Truck, XCircle, Trash2 } from "lucide-react";
import { TripAssignmentModal } from "./trip-assignment-modal";

export function Trips() {
  const { trips, zones, updateTripStatus, cancelTrip, removeTrip } = useOperationsData();
  const zoneBadgeClass: Record<string, string> = {
    "bg-blue-500": "bg-blue-500 text-white",
    "bg-teal-500": "bg-teal-500 text-white",
    "bg-orange-500": "bg-orange-500 text-white",
    "bg-purple-500": "bg-purple-500 text-white",
    "bg-indigo-500": "bg-indigo-500 text-white",
    "bg-pink-500": "bg-pink-500 text-white",
  };
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TripStatus | "all">("all");
  const [zoneFilter, setZoneFilter] = useState<ZoneId | "all">("all");

  const statusColors: Record<string, string> = {
    "Pendiente de aceptación": "secondary",
    "Asignado": "secondary",
    "En Planta": "outline",
    "Cargando": "warning",
    "En Ruta": "default",
    "Entregado": "success",
    "Cancelado": "destructive",
  };

  const statuses: TripStatus[] = ["Pendiente de aceptación", "Asignado", "En Planta", "Cargando", "En Ruta", "Entregado", "Cancelado"];
  const filteredTrips = useMemo(
    () =>
      trips.filter((trip) => {
        const query = search.trim().toLowerCase();
        const matchesQuery =
          !query ||
          trip.id.toLowerCase().includes(query) ||
          trip.driver.toLowerCase().includes(query) ||
          trip.vehiclePlate.toLowerCase().includes(query) ||
          `${trip.origin} ${trip.destination}`.toLowerCase().includes(query);
        const matchesStatus = statusFilter === "all" ? true : trip.status === statusFilter;
        const matchesZone = zoneFilter === "all" ? true : trip.zoneId === zoneFilter;
        return matchesQuery && matchesStatus && matchesZone;
      }),
    [trips, search, statusFilter, zoneFilter],
  );

  function openTripRouteInMaps(origin: string, destination: string) {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Gestión de Viajes</h1>
        <div className="flex gap-2">
          <TripAssignmentModal
            buttonLabel="Crear y asignar viaje"
            onTripCreated={(tripId) => setSearch(tripId)}
          />
          <Button
            variant={viewMode === "table" ? "default" : "outline"}
            onClick={() => setViewMode("table")}
          >
            Vista Tabla
          </Button>
          <Button
            variant={viewMode === "kanban" ? "default" : "outline"}
            onClick={() => setViewMode("kanban")}
          >
            Vista Kanban
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por ID, chofer, patente o ruta..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[560px]">
              <Select value={zoneFilter} onValueChange={(value: ZoneId | "all") => setZoneFilter(value)}>
                <SelectTrigger><SelectValue placeholder="Zona" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las zonas</SelectItem>
                  {zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value: TripStatus | "all") => setStatusFilter(value)}>
                <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {statuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); setZoneFilter("all"); }}>
                Limpiar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {viewMode === "table" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Listado de Viajes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3">ID Viaje</th>
                    <th className="text-left p-3">Programado</th>
                    <th className="text-left p-3">Origen</th>
                    <th className="text-left p-3">Destino</th>
                    <th className="text-left p-3">Chofer</th>
                    <th className="text-left p-3">Patente</th>
                    <th className="text-left p-3">Zona</th>
                    <th className="text-left p-3">Remitos</th>
                    <th className="text-left p-3">Estado</th>
                    <th className="text-left p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((trip) => (
                    <tr key={trip.id} className="border-b border-border hover:bg-muted/50">
                      <td className="p-3">{trip.id}</td>
                      <td className="p-3 text-sm text-muted-foreground">{new Date(trip.scheduledAt).toLocaleString("es-AR")}</td>
                      <td className="p-3">{trip.origin}</td>
                      <td className="p-3">{trip.destination}</td>
                      <td className="p-3">{trip.driver}</td>
                      <td className="p-3">
                        <Badge variant="outline">{trip.vehiclePlate}</Badge>
                      </td>
                      <td className="p-3">
                        {(() => {
                          const zone = zones.find((item) => item.id === trip.zoneId);
                          if (!zone) {
                            return <Badge variant="outline">{trip.zoneId}</Badge>;
                          }
                          return <Badge className={zoneBadgeClass[zone.colorClass] ?? "bg-blue-500 text-white"}>{zone.name}</Badge>;
                        })()}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(trip.evidencias ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sin evidencia</span>
                          ) : (
                            (trip.evidencias ?? []).map((ev, idx) => (
                              <Badge key={`${ev.nombre}-${idx}`} variant="secondary" className="text-[10px]">
                                {ev.tipo}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={statusColors[trip.status] as any}>
                          {trip.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            title="Abrir ruta en mapa"
                            onClick={() => openTripRouteInMaps(trip.origin, trip.destination)}
                          >
                            <Navigation className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Cerrar viaje"
                            disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                            onClick={() => updateTripStatus(trip.id, "Entregado")}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Cancelar viaje"
                            disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                            onClick={() => cancelTrip(trip.id)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Eliminar viaje"
                            onClick={() => removeTrip(trip.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {statuses.map((status) => {
            const statusTrips = filteredTrips.filter(t => t.status === status);
            return (
              <Card key={status}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span>{status}</span>
                    <Badge variant="secondary">{statusTrips.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {statusTrips.map((trip) => (
                    <Card key={trip.id} className="bg-muted/50">
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{trip.id}</span>
                            <Badge variant="outline" className="text-xs">
                              {trip.vehiclePlate}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {trip.origin} → {trip.destination}
                          </div>
                          <div className="text-xs">{trip.driver}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(trip.scheduledAt).toLocaleString("es-AR")}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
