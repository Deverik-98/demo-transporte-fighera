import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { divIcon, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { realtimeAlerts } from "../../lib/mock-data";
import { AlertTriangle, Clock, Filter, MapPin, Search } from "lucide-react";
import { useOperationsData, ZoneId, TripStatus, PlannedTrip } from "../../lib/operations-data";
import { TripAssignmentModal } from "./trip-assignment-modal";
import { useTheme } from "next-themes";
import { useSyncAlerts } from "../../lib/sync-store";

function getStatusVariant(status: TripStatus) {
  if (status === "Pendiente de aceptación") return "secondary";
  if (status === "Cancelado") return "destructive";
  if (status === "Entregado") return "success";
  if (status === "En Ruta") return "default";
  if (status === "Cargando") return "warning";
  return "outline";
}

function getPositionByProgress(path: LatLngExpression[], progress: number): LatLngExpression {
  if (path.length < 2) return path[0];
  const pct = Math.max(0, Math.min(progress, 100)) / 100;
  const segments = path.length - 1;
  const scaled = pct * segments;
  const segmentIndex = Math.min(Math.floor(scaled), segments - 1);
  const localProgress = scaled - segmentIndex;
  const [latA, lngA] = path[segmentIndex] as [number, number];
  const [latB, lngB] = path[segmentIndex + 1] as [number, number];
  return [latA + (latB - latA) * localProgress, lngA + (lngB - lngA) * localProgress];
}

function tripIcon(plate: string) {
  return divIcon({
    className: "map-trip-pin-wrapper",
    html: `<div class="map-trip-pin"><span class="map-trip-truck">🚚</span><span class="map-trip-label">${plate}</span></div>`,
    iconSize: [92, 28],
    iconAnchor: [14, 14],
  });
}

function MapResizeHandler({ watchValue }: { watchValue: string }) {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map, watchValue]);
  return null;
}

async function fetchRoadRoute(path: LatLngExpression[]): Promise<LatLngExpression[]> {
  const coords = path
    .map((point) => {
      const [lat, lng] = point as [number, number];
      return `${lng},${lat}`;
    })
    .join(";");
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
  );
  if (!response.ok) throw new Error("routing-error");
  const payload = await response.json();
  const geometry = payload?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
  if (!geometry?.length) throw new Error("no-geometry");
  return geometry.map(([lng, lat]) => [lat, lng] as LatLngExpression);
}

function RouteMap({
  zoneTrips,
  selectedZone,
  zones,
  isDarkTheme,
}: {
  zoneTrips: PlannedTrip[];
  selectedZone: ZoneId | null;
  zones: { id: ZoneId; name: string; colorClass: string; mapCenter: LatLngExpression; zoom: number }[];
  isDarkTheme: boolean;
}) {
  const zoneConfig = selectedZone ? zones.find((zone) => zone.id === selectedZone) : null;
  const center = zoneConfig ? zoneConfig.mapCenter : ([-34.4, -61.5] as LatLngExpression);
  const zoom = zoneConfig ? zoneConfig.zoom : 5;
  const [resolvedRoutes, setResolvedRoutes] = useState<Record<string, LatLngExpression[]>>({});

  useEffect(() => {
    let isActive = true;
    const unresolvedTrips = zoneTrips.filter((trip) => !resolvedRoutes[trip.id]);
    if (!unresolvedTrips.length) return;

    Promise.all(
      unresolvedTrips.map(async (trip) => {
        try {
          const roadPath = await fetchRoadRoute(trip.routePath);
          return { id: trip.id, path: roadPath };
        } catch {
          return { id: trip.id, path: trip.routePath };
        }
      }),
    ).then((results) => {
      if (!isActive) return;
      setResolvedRoutes((prev) => {
        const next = { ...prev };
        results.forEach((item) => {
          next[item.id] = item.path;
        });
        return next;
      });
    });

    return () => {
      isActive = false;
    };
  }, [zoneTrips, resolvedRoutes]);

  return (
    <div className={`overflow-hidden rounded-xl border border-border ${selectedZone ? "h-[520px]" : "h-[420px]"}`}>
      <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
        <MapResizeHandler
          watchValue={`${selectedZone ?? "all"}-${zoneTrips.length}-${zoneTrips.map((trip) => trip.id).join(",")}`}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
          url={
            isDarkTheme
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
        />
        {zoneTrips.map((trip) => {
          const mapPath = resolvedRoutes[trip.id] ?? trip.routePath;
          const position = getPositionByProgress(mapPath, trip.progress);
          return (
            <div key={trip.id}>
              <Polyline positions={mapPath} pathOptions={{ color: "#22d3ee", weight: 4, opacity: 0.9 }} />
              <Marker position={position} icon={tripIcon(trip.vehiclePlate)}>
                <Popup>
                  <div className="space-y-1">
                    <div className="font-medium">{trip.id}</div>
                    <div>{trip.origin} {"->"} {trip.destination}</div>
                    <div>Chofer: {trip.driver}</div>
                    <div>Vehículo: {trip.vehiclePlate}</div>
                    <div>Estado: {trip.status}</div>
                  </div>
                </Popup>
              </Marker>
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}

export function Dashboard() {
  const { resolvedTheme } = useTheme();
  const { zones, trips } = useOperationsData();
  const syncedAlerts = useSyncAlerts(
    realtimeAlerts.map((alert) => ({
      id: String(alert.id),
      time: alert.time,
      message: alert.message,
      severity: alert.severity === "Alta" ? "Alta" : "Media",
      source: "web" as const,
      status: "Activa" as const,
    })),
  );
  const [selectedZone, setSelectedZone] = useState<ZoneId | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<TripStatus | "all">("all");
  const [search, setSearch] = useState("");
  const isDarkTheme = resolvedTheme === "dark";

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ zoneId?: ZoneId }>).detail;
      if (detail?.zoneId) setSelectedZone(detail.zoneId);
    };
    window.addEventListener("tf-select-zone", handler);
    return () => window.removeEventListener("tf-select-zone", handler);
  }, []);

  const visibleTrips = useMemo(() => {
    return trips.filter((trip) => {
      const zoneMatch = selectedZone ? trip.zoneId === selectedZone : true;
      const statusMatch = selectedStatus === "all" ? true : trip.status === selectedStatus;
      const query = search.trim().toLowerCase();
      const searchMatch =
        !query ||
        trip.id.toLowerCase().includes(query) ||
        trip.driver.toLowerCase().includes(query) ||
        trip.vehiclePlate.toLowerCase().includes(query) ||
        `${trip.origin} ${trip.destination}`.toLowerCase().includes(query);
      return zoneMatch && statusMatch && searchMatch;
    });
  }, [trips, selectedZone, selectedStatus, search]);

  const zoneStats = useMemo(
    () =>
      zones.map((zone) => {
        const zoneTrips = trips.filter((trip) => trip.zoneId === zone.id);
        return {
          ...zone,
          activeTrips: zoneTrips.filter((trip) => trip.status !== "Entregado").length,
          alerts: syncedAlerts.filter((alert) =>
            zone.id === "zona-argentina"
              ? alert.message.includes("Ruta") || alert.message.includes("camión")
              : alert.message.includes("Chofer") || alert.message.includes("Parada"),
          ).length,
        };
      }),
    [syncedAlerts, trips],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1>Monitor de Control</h1>
          <p className="text-sm text-muted-foreground">Visualización operativa en tiempo real con asignación rápida de viajes.</p>
        </div>
        <TripAssignmentModal
          buttonLabel="Asignar nuevo viaje"
          buttonClassName="w-full lg:w-auto"
          onTripCreated={(tripId, zoneId) => {
            setSelectedZone(zoneId);
            setSearch(tripId);
          }}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar viaje, chofer, patente, ruta..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[430px]">
              <Select value={selectedStatus} onValueChange={(value: TripStatus | "all") => setSelectedStatus(value)}>
                <SelectTrigger><Filter className="mr-2 h-4 w-4" /><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Pendiente de aceptación">Pendiente de aceptación</SelectItem>
                  <SelectItem value="Asignado">Asignado</SelectItem>
                  <SelectItem value="En Planta">En Planta</SelectItem>
                  <SelectItem value="Cargando">Cargando</SelectItem>
                  <SelectItem value="En Ruta">En Ruta</SelectItem>
                  <SelectItem value="Entregado">Entregado</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => { setSelectedStatus("all"); setSearch(""); setSelectedZone(null); }}>
                Limpiar filtros
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant={selectedZone === null ? "default" : "outline"} size="sm" onClick={() => setSelectedZone(null)}>
              Todas las zonas
            </Button>
            {zoneStats.map((zone) => (
              <Button key={zone.id} variant={selectedZone === zone.id ? "default" : "outline"} size="sm" onClick={() => setSelectedZone(zone.id)}>
                {zone.name}
                <Badge variant="secondary" className="ml-2">{zone.activeTrips}</Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className={`grid gap-6 ${selectedZone ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {zoneStats
          .filter((zone) => (selectedZone ? zone.id === selectedZone : true))
          .map((zone) => {
            const zoneTrips = visibleTrips.filter(
              (trip) =>
                trip.zoneId === zone.id &&
                trip.status !== "Pendiente de aceptación" &&
                trip.status !== "Cancelado" &&
                trip.status !== "Entregado",
            );
            return (
              <Card key={zone.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />{zone.name}</CardTitle>
                    <div className={`h-3 w-3 rounded-full ${zone.colorClass}`} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RouteMap zoneTrips={zoneTrips} selectedZone={selectedZone} zones={zones} isDarkTheme={isDarkTheme} />
                  <div className="space-y-2">
                    {zoneTrips.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Sin viajes visibles para los filtros actuales.</div>
                    ) : (
                      zoneTrips.map((trip) => (
                        <div key={trip.id} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm">{trip.id} · {trip.origin} {"->"} {trip.destination}</p>
                            <p className="text-xs text-muted-foreground">{trip.driver} · {trip.vehiclePlate} · {trip.cargo}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={getStatusVariant(trip.status) as "outline"}>{trip.status}</Badge>
                            <Badge variant="outline">{trip.progress}%</Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />Alertas en Tiempo Real</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {syncedAlerts.map((alert) => (
              <div key={alert.id} className={`rounded-lg border-l-4 p-3 ${alert.status === "Resuelta" ? "border-emerald-500 bg-emerald-500/10 opacity-80" : alert.severity === "Alta" ? "border-red-500 bg-red-500/10" : "border-yellow-500 bg-yellow-500/10"}`}>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{alert.time}</span>
                      <Badge variant={alert.severity === "Alta" ? "destructive" : "warning"} className="text-xs">{alert.severity}</Badge>
                      <Badge variant={alert.status === "Resuelta" ? "success" : "outline"} className="text-xs">
                        {alert.status}
                      </Badge>
                    </div>
                    <p className="text-sm">{alert.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
