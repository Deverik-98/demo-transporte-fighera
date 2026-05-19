import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { divIcon, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { realtimeAlerts } from "../../lib/mock-data";
import { AlertTriangle, Clock, FolderOpen, MapPin, Printer } from "lucide-react";
import { useOperationsData, VehicleFleetKind, ZoneId, TripStatus, PlannedTrip } from "../../lib/operations-data";
import {
  buildFleetKindResolver,
  defaultTripOperationsFilters,
  filterTripsForOperations,
  summarizeTripOperationsFilters,
  type TripOperationsFilters,
} from "../../lib/trip-operations-filters";
import { TripOperationsFiltersPanel } from "./trip-operations-filters-panel";
import { BRAND_NAME } from "../../lib/brand";
import { formatTripRouteStops } from "../../lib/trip-route";
import { TripAssignmentModal } from "./trip-assignment-modal";
import { TripImportModal } from "./trip-import-modal";
import { useTheme } from "next-themes";
import {
  alertBelongsToOperationalTrip,
  filterAlertsByFleetDocumentationPolicy,
  useSyncAlerts,
} from "../../lib/sync-store";
import { toast } from "sonner";

function getStatusVariant(status: TripStatus) {
  if (status === "Sin chofer") return "secondary";
  if (status === "Cancelado") return "destructive";
  if (status === "Entregado") return "success";
  if (status === "En ruta") return "default";
  if (status === "En planta" || status === "Reprogramado" || status === "Asignado" || status === "Aceptado") return "warning";
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

function zoneColorToHex(colorClass: string) {
  const colors: Record<string, string> = {
    "bg-blue-500": "#3B82F6",
    "bg-teal-500": "#14B8A6",
    "bg-orange-500": "#F97316",
    "bg-purple-500": "#A855F7",
    "bg-indigo-500": "#6366F1",
    "bg-pink-500": "#EC4899",
  };
  return colors[colorClass] ?? "#3b82f6";
}

function MapResizeHandler({ watchValue }: { watchValue: string }) {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map, watchValue]);
  return null;
}

function MapViewportHandler({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();
  const lastViewportKeyRef = useRef<string>("");
  useEffect(() => {
    const [lat, lng] = center as [number, number];
    const nextKey = `${lat.toFixed(6)}:${lng.toFixed(6)}:${zoom}`;
    if (lastViewportKeyRef.current === nextKey) return;
    lastViewportKeyRef.current = nextKey;
    map.flyTo([lat, lng], zoom, { animate: true, duration: 0.55 });
  }, [center, zoom, map]);
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

function UnifiedRouteMap({
  visibleTrips,
  selectedZone,
  zones,
  isDarkTheme,
  getFleetKind,
}: {
  visibleTrips: PlannedTrip[];
  selectedZone: ZoneId | null;
  zones: { id: ZoneId; name: string; colorClass: string; mapCenter: LatLngExpression; zoom: number; radiusKm: number }[];
  isDarkTheme: boolean;
  getFleetKind: (plate: string) => VehicleFleetKind | undefined;
}) {
  const selectedZoneConfig = selectedZone ? zones.find((zone) => zone.id === selectedZone) : null;
  const center = useMemo<LatLngExpression>(() => {
    if (!selectedZoneConfig) return [-34.4, -61.5] as LatLngExpression;
    return selectedZoneConfig.mapCenter;
  }, [selectedZoneConfig]);
  const zoom = selectedZoneConfig ? selectedZoneConfig.zoom : 5;
  const [resolvedRoutes, setResolvedRoutes] = useState<Record<string, LatLngExpression[]>>({});

  useEffect(() => {
    let isActive = true;
    const unresolvedTrips = visibleTrips.filter((trip) => !resolvedRoutes[trip.id]);
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
  }, [visibleTrips, resolvedRoutes]);

  return (
    <div className="overflow-hidden rounded-xl border border-border h-[clamp(260px,52dvh,560px)]">
      <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
        <MapViewportHandler center={center} zoom={zoom} />
        <MapResizeHandler
          watchValue={`${selectedZone ?? "all"}-${visibleTrips.length}-${visibleTrips.map((trip) => trip.id).join(",")}`}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
          url={
            isDarkTheme
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
        />
        {zones.map((zone) => {
          if (!zone.areaGeoJson) return null;
          const geometry =
            zone.areaGeoJson.type === "FeatureCollection"
              ? zone.areaGeoJson.features?.[0]?.geometry
              : zone.areaGeoJson.geometry;
          if (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") return null;
          const active = selectedZone ? selectedZone === zone.id : true;
          const stroke = zoneColorToHex(zone.colorClass);
          return (
            <GeoJSON
              key={`zone-area-${zone.id}`}
              data={zone.areaGeoJson as any}
              style={{
                color: stroke,
                weight: active ? 3 : 2,
                fillColor: stroke,
                fillOpacity: active ? 0.18 : 0.08,
                opacity: active ? 0.9 : 0.45,
              }}
            />
          );
        })}
        {visibleTrips.map((trip) => {
          const mapPath = resolvedRoutes[trip.id] ?? trip.routePath;
          const position = getPositionByProgress(mapPath, trip.progress);
          const tripZone = zones.find((zone) => zone.id === trip.zoneId);
          const tripColor = zoneColorToHex(tripZone?.colorClass ?? "bg-blue-500");
          const fleet = getFleetKind(trip.vehiclePlate);
          return (
            <div key={trip.id}>
              <Polyline positions={mapPath} pathOptions={{ color: tripColor, weight: 4, opacity: 0.9 }} />
              <Marker position={position} icon={tripIcon(trip.vehiclePlate)}>
                <Popup>
                  <div className="space-y-1">
                    <div className="font-medium">{trip.id}</div>
                    <div>{formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}</div>
                    <div>Zona: {tripZone?.name ?? trip.zoneId}</div>
                    <div>Chofer: {trip.driver}</div>
                    <div>
                      Vehículo: {trip.vehiclePlate}
                      {fleet ? (
                        <span className="text-muted-foreground"> ({fleet === "Propio" ? "Propio" : "Fletero"})</span>
                      ) : null}
                    </div>
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

export function Dashboard({ onOpenAlertsHistory }: { onOpenAlertsHistory?: () => void }) {
  const { resolvedTheme } = useTheme();
  const { zones, trips, vehicles } = useOperationsData();
  const syncedAlertsRaw = useSyncAlerts(
    realtimeAlerts.map((alert) => ({
      id: String(alert.id),
      time: alert.time,
      message: alert.message,
      severity: alert.severity === "Alta" ? "Alta" : "Media",
      source: "web" as const,
      status: "Activa" as const,
      alertKind: alert.alertKind,
      vehiclePlate: alert.vehiclePlate,
      tripId: alert.tripId,
    })),
  );
  const syncedAlerts = useMemo(
    () => filterAlertsByFleetDocumentationPolicy(syncedAlertsRaw, vehicles),
    [syncedAlertsRaw, vehicles],
  );
  const [filters, setFilters] = useState<TripOperationsFilters>(() => defaultTripOperationsFilters());
  const [printOpen, setPrintOpen] = useState(false);
  const [simulatingDownload, setSimulatingDownload] = useState(false);
  const isDarkTheme = resolvedTheme === "dark";

  const selectedZoneForMap = filters.zoneId === "all" ? null : filters.zoneId;

  function openTripDocuments(tripId: string) {
    window.dispatchEvent(new CustomEvent("tf-open-trip-documents", { detail: { tripId } }));
  }

  const getFleetKind = useMemo(() => buildFleetKindResolver(vehicles), [vehicles]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ zoneId?: ZoneId }>).detail;
      if (detail?.zoneId) setFilters((prev) => ({ ...prev, zoneId: detail.zoneId }));
    };
    window.addEventListener("tf-select-zone", handler);
    return () => window.removeEventListener("tf-select-zone", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tripId?: string; zoneId?: ZoneId }>).detail;
      if (!detail?.tripId) return;
      setFilters((prev) => ({
        ...prev,
        search: detail.tripId,
        zoneId: detail.zoneId ?? prev.zoneId,
      }));
    };
    window.addEventListener("tf-focus-trip", handler);
    return () => window.removeEventListener("tf-focus-trip", handler);
  }, []);

  const tripsMatchingGlobalFilters = useMemo(() => {
    return filterTripsForOperations(trips, { ...filters, zoneId: "all" }, getFleetKind);
  }, [trips, filters, getFleetKind]);

  const visibleTrips = useMemo(() => {
    return filterTripsForOperations(trips, filters, getFleetKind);
  }, [trips, filters, getFleetKind]);

  const zoneStats = useMemo(
    () =>
      zones.map((zone) => {
        const zoneTrips = tripsMatchingGlobalFilters.filter((trip) => trip.zoneId === zone.id);
        return {
          ...zone,
          activeTrips: zoneTrips.filter((trip) => trip.status !== "Entregado").length,
          alerts: syncedAlerts.filter((alert) =>
            zoneTrips.some((trip) => alertBelongsToOperationalTrip(alert, trip.id, trip.vehiclePlate)),
          ).length,
        };
      }),
    [syncedAlerts, tripsMatchingGlobalFilters, zones],
  );

  const dashboardAlerts = useMemo(() => {
    return syncedAlerts.filter((alert) =>
      visibleTrips.some((trip) => alertBelongsToOperationalTrip(alert, trip.id, trip.vehiclePlate)),
    );
  }, [syncedAlerts, visibleTrips]);

  const printGroups = useMemo(() => {
    const byZone = new Map<ZoneId, PlannedTrip[]>();
    visibleTrips.forEach((trip) => {
      const current = byZone.get(trip.zoneId) ?? [];
      current.push(trip);
      byZone.set(trip.zoneId, current);
    });
    return zones
      .map((zone) => ({ zoneId: zone.id, zoneName: zone.name, items: byZone.get(zone.id) ?? [] }))
      .filter((zone) => zone.items.length > 0);
  }, [visibleTrips, zones]);

  const printFilterLabel = useMemo(() => summarizeTripOperationsFilters(filters, zones), [filters, zones]);

  async function simulatePdfDownload() {
    if (simulatingDownload) return;
    setSimulatingDownload(true);
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setSimulatingDownload(false);
    setPrintOpen(false);
    toast.success("Descarga simulada completada", {
      description: "Se simuló la descarga del PDF con los filtros actuales.",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1>Monitor de Control</h1>
          <p className="text-sm text-muted-foreground">Visualización operativa en tiempo real con asignación rápida de viajes.</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:justify-end lg:w-auto">
          <Button size="lg" className="gap-2" onClick={() => setPrintOpen(true)}>
            <Printer className="h-4 w-4" />
            Imprimir planilla filtrada
          </Button>
          <TripAssignmentModal
            buttonLabel="Crear viaje"
            onTripCreated={(tripId, zoneId) => {
              setFilters((prev) => ({
                ...defaultTripOperationsFilters(),
                search: tripId,
                zoneId: zoneId ?? prev.zoneId,
              }));
              toast.success(`Viaje ${tripId} creado y visible en el tablero general.`);
            }}
          />
          <TripImportModal
            buttonClassName="gap-2"
            onTripsImported={({ tripIds, zoneIds }) => {
              const firstTripId = tripIds[0];
              const firstZone = zoneIds[0];
              setFilters((prev) => ({
                ...prev,
                zoneId: firstZone ?? prev.zoneId,
                search: firstTripId ?? prev.search,
              }));
            }}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <TripOperationsFiltersPanel
            filters={filters}
            onPatch={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            onClear={() => setFilters(defaultTripOperationsFilters())}
            zones={zones}
            searchPlaceholder="Buscar viaje, chofer, patente, plan de carga o ruta…"
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Mapa operativo unificado
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {zoneStats.map((zone) => (
                <div key={zone.id} className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
                  <span className={`h-2.5 w-2.5 rounded-full ${zone.colorClass}`} />
                  <span>{zone.name}</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{zone.activeTrips}</Badge>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <UnifiedRouteMap
            visibleTrips={visibleTrips}
            selectedZone={selectedZoneForMap}
            zones={zones}
            isDarkTheme={isDarkTheme}
            getFleetKind={getFleetKind}
          />
          <div className="space-y-2">
            {visibleTrips.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Sin viajes visibles para los filtros actuales.</div>
            ) : (
              visibleTrips.map((trip) => {
                const zone = zones.find((item) => item.id === trip.zoneId);
                const fleet = getFleetKind(trip.vehiclePlate);
                return (
                  <div key={trip.id} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm">{trip.id} · {formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}</p>
                      <p className="text-xs text-muted-foreground">
                        {trip.clientCompany} ·{" "}
                        <span className="font-mono text-foreground" title="Plan de carga / ID de envío">
                          {trip.remitoNumber}
                        </span>
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{trip.driver}</span>
                        <span className="text-border">·</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{trip.vehiclePlate}</span>
                          {fleet ? (
                            <Badge variant={fleet === "Propio" ? "default" : "secondary"} className="h-5 px-1.5 text-[10px] font-normal">
                              {fleet === "Propio" ? "Propio" : "Fletero"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                              Flota N/D
                            </Badge>
                          )}
                        </span>
                        <span className="text-border">·</span>
                        <span>{trip.cargo}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => openTripDocuments(trip.id)}>
                        <FolderOpen className="mr-1 h-3 w-3" />
                        Docs
                      </Button>
                      <Badge variant="outline" className="gap-1">
                        <span className={`h-2 w-2 rounded-full ${zone?.colorClass ?? "bg-blue-500"}`} />
                        {zone?.name ?? trip.zoneId}
                      </Badge>
                      <Badge variant={getStatusVariant(trip.status) as "outline"}>{trip.status}</Badge>
                      <Badge variant="outline">{trip.progress}%</Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />Alertas en Tiempo Real</CardTitle>
            <Button variant="outline" size="sm" onClick={onOpenAlertsHistory}>
              Ver todas las alertas
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {dashboardAlerts.length === 0 ? (
              <div className="col-span-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No hay alertas asociadas a los viajes visibles con los filtros actuales.
              </div>
            ) : null}
            {dashboardAlerts.map((alert) => (
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

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Previsualización de Planilla Operativa Filtrada</DialogTitle>
            <DialogDescription>Se imprime exactamente la misma data visible según filtros activos.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center overflow-auto bg-muted/50 p-4">
            <div className="w-[210mm] min-h-[297mm] bg-white p-6 text-black shadow-lg">
              <div className="mb-4 border-b border-black pb-3">
                <h2 className="text-xl font-bold">{BRAND_NAME} — Planilla Operativa</h2>
                <p className="text-sm">Fecha: {new Date().toLocaleDateString("es-AR")}</p>
                <p className="text-sm">Filtros aplicados: {printFilterLabel}</p>
              </div>
              <div className="space-y-4 text-xs">
                {printGroups.length === 0 ? (
                  <p>No hay viajes para los filtros seleccionados.</p>
                ) : (
                  printGroups.map((group) => (
                    <section key={group.zoneId}>
                      <div className="bg-black px-2 py-1 font-semibold uppercase text-white">Zona: {group.zoneName}</div>
                      <table className="w-full border-collapse border border-black">
                        <thead>
                          <tr>
                            <th className="border border-black px-1 py-1 text-left">ID</th>
                            <th className="border border-black px-1 py-1 text-left">Fecha y hora del viaje</th>
                            <th className="border border-black px-1 py-1 text-left">Chofer</th>
                            <th className="border border-black px-1 py-1 text-left">Empresa</th>
                            <th className="border border-black px-1 py-1 text-left">Número de plan de carga</th>
                            <th className="border border-black px-1 py-1 text-left">Camión</th>
                            <th className="border border-black px-1 py-1 text-left">Ruta</th>
                            <th className="border border-black px-1 py-1 text-left">Carga</th>
                            <th className="border border-black px-1 py-1 text-left">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((trip) => (
                            <tr key={`print-dashboard-${trip.id}`}>
                              <td className="border border-black px-1 py-1">{trip.id}</td>
                              <td className="border border-black px-1 py-1">{new Date(trip.scheduledAt).toLocaleString("es-AR")}</td>
                              <td className="border border-black px-1 py-1">{trip.driver}</td>
                              <td className="border border-black px-1 py-1">{trip.clientCompany}</td>
                              <td className="border border-black px-1 py-1 font-mono">{trip.remitoNumber}</td>
                              <td className="border border-black px-1 py-1">{trip.vehiclePlate}</td>
                              <td className="border border-black px-1 py-1">{formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}</td>
                              <td className="border border-black px-1 py-1">{trip.cargo}</td>
                              <td className="border border-black px-1 py-1">{trip.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPrintOpen(false)}>
              Cerrar
            </Button>
            <Button type="button" onClick={simulatePdfDownload} disabled={simulatingDownload}>
              {simulatingDownload ? "Descargando..." : "Descargar PDF (simulado)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
