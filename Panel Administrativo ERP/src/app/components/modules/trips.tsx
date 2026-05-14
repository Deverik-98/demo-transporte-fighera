import { Fragment, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useOperationsData, PlannedTrip, TripStage, ZoneId } from "../../lib/operations-data";
import {
  buildFleetKindResolver,
  defaultTripOperationsFilters,
  filterTripsForOperations,
  summarizeTripOperationsFilters,
  TRIP_KANBAN_AND_FILTER_STAGES,
  type TripOperationsFilters,
} from "../../lib/trip-operations-filters";
import { TripOperationsFiltersPanel } from "./trip-operations-filters-panel";
import {
  getPrincipalLoadPlanMaxLength,
  isPrincipalClientCompany,
  isValidPrincipalLoadPlan,
  loadPlanValidationMessage,
  normalizePrincipalLoadPlanValue,
} from "../../lib/trip-clients";
import { formatTripRouteStops } from "../../lib/trip-route";
import { AlertTriangle, CheckCircle2, FolderOpen, Navigation, Palette, PenSquare, Plus, Printer, Trash2, Truck, XCircle } from "lucide-react";
import { TripAssignmentModal } from "./trip-assignment-modal";
import { realtimeAlerts } from "../../lib/mock-data";
import { useSyncAlerts } from "../../lib/sync-store";
import { toast } from "sonner";

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-AR");
}

type TripsProps = {
  onFocusTripInMap?: (tripId: string, zoneId: ZoneId) => void;
  onOpenTripDocuments?: (tripId: string) => void;
};

export function Trips({ onFocusTripInMap, onOpenTripDocuments }: TripsProps) {
  const { trips, zones, drivers, vehicles, updateTrip, updateTripStatus, cancelTrip, removeTrip } = useOperationsData();
  const [filters, setFilters] = useState<TripOperationsFilters>(() => defaultTripOperationsFilters());
  const [printOpen, setPrintOpen] = useState(false);
  const [simulatingDownload, setSimulatingDownload] = useState(false);
  const [alertDetailsTripId, setAlertDetailsTripId] = useState<string | null>(null);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    zoneId: "",
    status: "Sin chofer" as TripStage,
    driver: "",
    vehiclePlate: "",
    routeStops: ["", ""] as string[],
    cargo: "",
    plan: "",
    scheduledAt: "",
    clientCompany: "",
    remitoNumber: "",
  });

  const syncAlerts = useSyncAlerts(
    realtimeAlerts.map((alert) => ({
      id: String(alert.id),
      time: alert.time,
      message: alert.message,
      severity: alert.severity === "Alta" ? "Alta" : "Media",
      source: "web" as const,
      status: "Activa" as const,
      alertKind: alert.alertKind,
      tripId: alert.tripId,
      vehiclePlate: alert.vehiclePlate,
    })),
  );

  const alertsByTripId = useMemo(() => {
    const map = new Map<string, typeof syncAlerts>();
    trips.forEach((trip) => {
      const plate = trip.vehiclePlate.trim().toUpperCase();
      const alerts = syncAlerts.filter(
        (alert) =>
          alert.tripId === trip.id ||
          (alert.vehiclePlate?.trim().toUpperCase() ?? "") === plate,
      );
      map.set(trip.id, alerts);
    });
    return map;
  }, [syncAlerts, trips]);

  const activeIncidentTripIds = useMemo(() => {
    const ids = new Set<string>();
    alertsByTripId.forEach((alerts, tripId) => {
      if (alerts.some((alert) => alert.status === "Activa")) ids.add(tripId);
    });
    return ids;
  }, [alertsByTripId]);

  const selectedTripAlerts = useMemo(
    () => (alertDetailsTripId ? alertsByTripId.get(alertDetailsTripId) ?? [] : []),
    [alertDetailsTripId, alertsByTripId],
  );

  const getFleetKind = useMemo(() => buildFleetKindResolver(vehicles), [vehicles]);

  const filteredTrips = useMemo(() => {
    return filterTripsForOperations(trips, filters, getFleetKind);
  }, [trips, filters, getFleetKind]);

  const groupedByZone = useMemo(() => {
    const map = new Map<string, { zoneId: ZoneId; zoneName: string; items: PlannedTrip[] }>();
    zones.forEach((zone) => map.set(zone.id, { zoneId: zone.id, zoneName: zone.name, items: [] }));
    filteredTrips.forEach((trip) => {
      const bucket = map.get(trip.zoneId) ?? { zoneId: trip.zoneId, zoneName: trip.zoneId, items: [] };
      bucket.items.push(trip);
      map.set(trip.zoneId, bucket);
    });
    return [...map.values()].filter((zone) => zone.items.length > 0);
  }, [filteredTrips, zones]);

  const printFilterLabel = useMemo(() => summarizeTripOperationsFilters(filters, zones), [filters, zones]);

  const suggestVehiclePlateForDriver = (driverName: string, zoneId: string) => {
    const zoneFleet = vehicles.filter((vehicle) => vehicle.type === "Camión" && vehicle.zoneId === zoneId);
    const recent = [...trips]
      .reverse()
      .find((trip) => trip.driver === driverName && zoneFleet.some((vehicle) => vehicle.plate === trip.vehiclePlate));
    if (recent?.vehiclePlate) return recent.vehiclePlate;
    return zoneFleet[0]?.plate ?? "";
  };
  const editZoneVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.type === "Camión" && vehicle.zoneId === editForm.zoneId),
    [vehicles, editForm.zoneId],
  );

  function focusTripInMap(trip: PlannedTrip) {
    onFocusTripInMap?.(trip.id, trip.zoneId);
  }

  function handleEditClientCompanyChange(value: string) {
    setEditForm((prev) => {
      const wasPrincipal = isPrincipalClientCompany(prev.clientCompany.trim());
      const nowPrincipal = isPrincipalClientCompany(value.trim());
      let nextRemito = prev.remitoNumber;
      if (wasPrincipal && !nowPrincipal && editingTripId) {
        const trip = trips.find((t) => t.id === editingTripId);
        if (trip) nextRemito = trip.remitoNumber;
      } else if (!wasPrincipal && nowPrincipal) {
        nextRemito = "";
      } else if (wasPrincipal && nowPrincipal && prev.clientCompany.trim().toLowerCase() !== value.trim().toLowerCase()) {
        const prevLen = getPrincipalLoadPlanMaxLength(prev.clientCompany.trim());
        const nextLen = getPrincipalLoadPlanMaxLength(value.trim());
        if (prevLen !== nextLen) nextRemito = "";
      }
      return { ...prev, clientCompany: value, remitoNumber: nextRemito };
    });
  }

  function openEditTrip(trip: PlannedTrip) {
    setEditingTripId(trip.id);
    setEditForm({
      zoneId: trip.zoneId,
      status: trip.status,
      driver: trip.status === "Sin chofer" ? "" : trip.driver,
      vehiclePlate: trip.status === "Sin chofer" ? "" : trip.vehiclePlate,
      routeStops: trip.routeStops.length >= 2 ? [...trip.routeStops] : [trip.origin, trip.destination],
      cargo: trip.cargo,
      plan: trip.plan,
      scheduledAt: trip.scheduledAt,
      clientCompany: trip.clientCompany,
      remitoNumber: trip.remitoNumber,
    });
  }

  function saveTripEdits() {
    if (!editingTripId) return;
    let nextStatus = editForm.status;
    if (nextStatus === "Sin chofer" && editForm.driver.trim() && editForm.driver.trim().toLowerCase() !== "sin asignar") {
      nextStatus = "Asignado";
    }
    if (nextStatus !== "Sin chofer" && !editForm.driver.trim()) {
      toast.error("Seleccioná un chofer para guardar el viaje.");
      return;
    }
    if (nextStatus !== "Sin chofer" && !editForm.vehiclePlate.trim()) {
      toast.error("Seleccioná un camión para guardar el viaje.");
      return;
    }
    const trimmed = editForm.routeStops.map((s) => s.trim());
    if (trimmed.length < 2 || trimmed.some((s) => !s)) {
      toast.error("Completá todas las paradas (origen, destino e intermedias).");
      return;
    }
    const clientCompany = editForm.clientCompany.trim();
    if (isPrincipalClientCompany(clientCompany)) {
      const max = getPrincipalLoadPlanMaxLength(clientCompany) ?? 8;
      const digits = normalizePrincipalLoadPlanValue(editForm.remitoNumber, max);
      if (!isValidPrincipalLoadPlan(clientCompany, digits)) {
        toast.error(loadPlanValidationMessage(clientCompany));
        return;
      }
    }

    const updated = updateTrip(editingTripId, {
      zoneId: editForm.zoneId,
      status: nextStatus,
      driver: editForm.driver,
      vehiclePlate: editForm.vehiclePlate,
      routeStops: trimmed,
      cargo: editForm.cargo,
      plan: editForm.plan,
      scheduledAt: editForm.scheduledAt,
      clientCompany,
      remitoNumber: isPrincipalClientCompany(clientCompany)
        ? normalizePrincipalLoadPlanValue(editForm.remitoNumber, getPrincipalLoadPlanMaxLength(clientCompany) ?? 8)
        : editForm.remitoNumber.trim() || undefined,
    });
    if (updated) {
      setEditingTripId(null);
    }
  }

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

  function statusBadgeVariant(status: TripStage) {
    if (status === "Cancelado") return "destructive";
    if (status === "Entregado") return "success";
    if (status === "En ruta") return "default";
    if (status === "En planta" || status === "Asignado" || status === "Aceptado") return "warning";
    if (status === "Reprogramado") return "outline";
    return "secondary";
  }

  function rowStatusTone(trip: PlannedTrip) {
    if (activeIncidentTripIds.has(trip.id) || trip.status === "Cancelado") {
      return "border-l-4 border-l-red-600 bg-red-100 dark:bg-red-950/35";
    }
    if (trip.status === "Entregado") {
      return "border-l-4 border-l-emerald-600 bg-green-100 dark:bg-green-950/35";
    }
    if (trip.status === "En ruta") {
      return "border-l-4 border-l-sky-600 bg-sky-100 dark:bg-sky-950/35";
    }
    if (trip.status === "En planta") {
      return "border-l-4 border-l-orange-600 bg-orange-100 dark:bg-orange-950/35";
    }
    if (trip.status === "Asignado" || trip.status === "Aceptado") {
      return "border-l-4 border-l-amber-600 bg-yellow-100 dark:bg-yellow-950/35";
    }
    if (trip.status === "Reprogramado") {
      return "border-l-4 border-l-violet-600 bg-violet-100 dark:bg-violet-950/35";
    }
    return "border-l-4 border-l-gray-500 bg-gray-100 dark:bg-gray-800/80";
  }

  return (
    <div className="space-y-5">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-sheet,
          .print-sheet * {
            visibility: visible !important;
          }
          .print-sheet {
            position: fixed;
            inset: 0;
            margin: 0;
            padding: 8mm;
            width: 210mm;
            min-height: 297mm;
            background: #fff !important;
            color: #000 !important;
          }
          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Gestión de Viajes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" className="gap-2" onClick={() => setPrintOpen(true)}>
            <Printer className="h-4 w-4" />
            Imprimir planilla filtrada
          </Button>
          <TripAssignmentModal
            buttonLabel="Crear viaje"
            onTripCreated={(tripId, zoneId) =>
              setFilters((prev) => ({
                ...defaultTripOperationsFilters(),
                search: tripId,
                zoneId,
              }))
            }
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
            searchPlaceholder="Buscar por ID, chofer, patente, empresa, plan de carga o ruta…"
          />
        </CardContent>
      </Card>

      <section
        className="print-hide rounded-lg border border-border/80 bg-muted/25 px-4 py-3"
        aria-label="Leyenda de colores de filas en la planilla operativa"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Palette className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Leyenda — Planilla operativa</h2>
          <span className="text-xs text-muted-foreground">
            El borde izquierdo y el fondo indican el estado del viaje; el rojo también marca alertas activas.
          </span>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-6 w-8 shrink-0 rounded-sm border-l-4 border-l-gray-500 bg-gray-100 dark:bg-gray-800/80"
              aria-hidden
            />
            <span>
              <span className="font-medium text-foreground">Gris</span>
              <span className="text-muted-foreground"> · Sin chofer (sin asignación)</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-6 w-8 shrink-0 rounded-sm border-l-4 border-l-amber-600 bg-yellow-100 dark:bg-yellow-950/35"
              aria-hidden
            />
            <span>
              <span className="font-medium text-foreground">Ámbar</span>
              <span className="text-muted-foreground"> · Asignado o aceptado</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-6 w-8 shrink-0 rounded-sm border-l-4 border-l-orange-600 bg-orange-100 dark:bg-orange-950/35"
              aria-hidden
            />
            <span>
              <span className="font-medium text-foreground">Naranja</span>
              <span className="text-muted-foreground"> · En planta</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-6 w-8 shrink-0 rounded-sm border-l-4 border-l-sky-600 bg-sky-100 dark:bg-sky-950/35"
              aria-hidden
            />
            <span>
              <span className="font-medium text-foreground">Azul</span>
              <span className="text-muted-foreground"> · En ruta</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-6 w-8 shrink-0 rounded-sm border-l-4 border-l-emerald-600 bg-green-100 dark:bg-green-950/35"
              aria-hidden
            />
            <span>
              <span className="font-medium text-foreground">Verde</span>
              <span className="text-muted-foreground"> · Entregado</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-6 w-8 shrink-0 rounded-sm border-l-4 border-l-violet-600 bg-violet-100 dark:bg-violet-950/35"
              aria-hidden
            />
            <span>
              <span className="font-medium text-foreground">Violeta</span>
              <span className="text-muted-foreground"> · Reprogramado</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-6 w-8 shrink-0 rounded-sm border-l-4 border-l-red-600 bg-red-100 dark:bg-red-950/35"
              aria-hidden
            />
            <span>
              <span className="font-medium text-foreground">Rojo</span>
              <span className="text-muted-foreground"> · Cancelado o alerta activa</span>
            </span>
          </li>
        </ul>
      </section>

      <Tabs defaultValue="planilla" className="space-y-3">
        <TabsList>
          <TabsTrigger value="planilla">Planilla Operativa</TabsTrigger>
          <TabsTrigger value="kanban">Tablero Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="planilla">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Planilla Operativa (cuaderno digital)
              </CardTitle>
              <p className="text-xs text-muted-foreground">Los colores de fila siguen la leyenda superior.</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-1.5 text-left">ID Viaje</th>
                      <th className="px-2 py-1.5 text-left">Fecha</th>
                      <th className="px-2 py-1.5 text-left">Chofer</th>
                      <th className="px-2 py-1.5 text-left">Empresa/Cliente</th>
                      <th className="px-2 py-1.5 text-left">Camión (Tractor)</th>
                      <th className="px-2 py-1.5 text-left">Ruta (paradas)</th>
                      <th className="px-2 py-1.5 text-left">Material/Carga</th>
                      <th className="px-2 py-1.5 text-left">Estado</th>
                      <th className="px-2 py-1.5 text-left">Incidencias</th>
                      <th className="px-2 py-1.5 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedByZone.map((zoneGroup) => (
                      <Fragment key={`zone-block-${zoneGroup.zoneId}`}>
                        <tr className="bg-gray-800 text-xs font-semibold uppercase tracking-wide text-gray-100">
                          <td className="px-2 py-1.5" colSpan={10}>
                            Zona: {zoneGroup.zoneName}
                          </td>
                        </tr>
                        {zoneGroup.items.map((trip) => {
                          const incidents = alertsByTripId.get(trip.id) ?? [];
                          const activeIncidents = incidents.filter((alert) => alert.status === "Activa").length;
                          return (
                            <tr key={trip.id} className={`${rowStatusTone(trip)} border-b border-border/60`}>
                              <td className="px-2 py-1.5 font-medium">{trip.id}</td>
                              <td className="px-2 py-1.5">{formatDateTime(trip.scheduledAt)}</td>
                              <td className="px-2 py-1.5">{trip.driver}</td>
                              <td className="px-2 py-1.5">{trip.clientCompany}</td>
                              <td className="px-2 py-1.5 font-mono">{trip.vehiclePlate}</td>
                              <td className="max-w-[280px] px-2 py-1.5 leading-snug">{formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}</td>
                              <td className="px-2 py-1.5">{trip.cargo}</td>
                              <td className="px-2 py-1.5">
                                <Badge variant={statusBadgeVariant(trip.status) as "secondary"}>{trip.status}</Badge>
                              </td>
                              <td className="px-2 py-1.5">
                                {incidents.length === 0 ? (
                                  <span className="text-muted-foreground">Sin alertas</span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant={activeIncidents > 0 ? "destructive" : "outline"}
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => setAlertDetailsTripId(trip.id)}
                                  >
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    {activeIncidents > 0 ? `${activeIncidents} activa(s)` : `${incidents.length} resueltas`}
                                  </Button>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex flex-wrap gap-1">
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => focusTripInMap(trip)}>
                                    <Navigation className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => onOpenTripDocuments?.(trip.id)}
                                  >
                                    <FolderOpen className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => openEditTrip(trip)}>
                                    <PenSquare className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px]"
                                    disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                                    onClick={() => updateTripStatus(trip.id, "Entregado")}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px]"
                                    disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                                    onClick={() => cancelTrip(trip.id)}
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => removeTrip(trip.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kanban">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {TRIP_KANBAN_AND_FILTER_STAGES.map((stage) => {
              const stageTrips = filteredTrips.filter((trip) => trip.status === stage);
              return (
                <Card key={stage}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span>{stage}</span>
                      <Badge variant="secondary">{stageTrips.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {stageTrips.length === 0 ? (
                      <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                        Sin viajes
                      </div>
                    ) : null}
                    {stageTrips.map((trip) => {
                      const zoneName = zones.find((zone) => zone.id === trip.zoneId)?.name ?? trip.zoneId;
                      const incidents = alertsByTripId.get(trip.id) ?? [];
                      const activeIncidents = incidents.filter((alert) => alert.status === "Activa").length;
                      return (
                        <Card key={trip.id} className="bg-muted/40">
                          <CardContent className="space-y-2 p-3 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{trip.id}</span>
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {trip.vehiclePlate}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground">{formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}</p>
                            <p><span className="font-medium">Zona:</span> {zoneName}</p>
                            <p><span className="font-medium">Chofer:</span> {trip.driver}</p>
                            <p><span className="font-medium">Patente:</span> {trip.vehiclePlate}</p>
                            <p><span className="font-medium">Empresa:</span> {trip.clientCompany}</p>
                            {activeIncidents > 0 ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => setAlertDetailsTripId(trip.id)}
                              >
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                {activeIncidents} alerta(s)
                              </Button>
                            ) : null}
                            <div className="flex flex-wrap gap-1 pt-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => focusTripInMap(trip)}>
                                <Navigation className="mr-1 h-3 w-3" />
                                Mapa
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => onOpenTripDocuments?.(trip.id)}
                              >
                                <FolderOpen className="mr-1 h-3 w-3" />
                                Docs
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => openEditTrip(trip)}
                              >
                                <PenSquare className="mr-1 h-3 w-3" />
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px]"
                                disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                                onClick={() => updateTripStatus(trip.id, "Entregado")}
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Entregar
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={editingTripId !== null} onOpenChange={(open) => !open && setEditingTripId(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar viaje {editingTripId}</DialogTitle>
            <DialogDescription>Actualizá cualquier dato operativo del viaje y guardá los cambios.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Zona</label>
              <Select
                value={editForm.zoneId}
                onValueChange={(value) =>
                  setEditForm((prev) => {
                    const keepsCurrent = vehicles.some(
                      (vehicle) =>
                        vehicle.type === "Camión" && vehicle.zoneId === value && vehicle.plate === prev.vehiclePlate,
                    );
                    const suggestedPlate =
                      prev.driver.trim() && prev.driver !== "Sin asignar"
                        ? suggestVehiclePlateForDriver(prev.driver.trim(), value)
                        : "";
                    return {
                      ...prev,
                      zoneId: value,
                      vehiclePlate: keepsCurrent ? prev.vehiclePlate : suggestedPlate,
                    };
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {zones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <Select
                value={editForm.status}
                onValueChange={(value: TripStage) =>
                  setEditForm((prev) => ({
                    ...prev,
                    status: value,
                    driver: value === "Sin chofer" ? "" : prev.driver,
                    vehiclePlate: value === "Sin chofer" ? "" : prev.vehiclePlate,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIP_KANBAN_AND_FILTER_STAGES.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Chofer</label>
              <Select
                value={editForm.driver || "__sin_chofer__"}
                onValueChange={(value) =>
                  setEditForm((prev) => {
                    const nextDriver = value === "__sin_chofer__" ? "" : value;
                    const suggestedVehicle = nextDriver ? suggestVehiclePlateForDriver(nextDriver, prev.zoneId) : "";
                    return {
                      ...prev,
                      driver: nextDriver,
                      vehiclePlate: nextDriver ? suggestedVehicle || prev.vehiclePlate : "",
                      status:
                        value === "__sin_chofer__"
                          ? "Sin chofer"
                          : prev.status === "Sin chofer"
                            ? "Asignado"
                            : prev.status,
                    };
                  })
                }
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar chofer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_chofer__">Sin chofer asignado</SelectItem>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.name}>{driver.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Camión</label>
              <Select
                value={editForm.vehiclePlate || "__sin_camion__"}
                onValueChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    vehiclePlate: value === "__sin_camion__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar camión" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_camion__">Sin camión asignado</SelectItem>
                  {editZoneVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.plate}>{vehicle.plate}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Paradas en orden</label>
              <div className="space-y-1">
                {editForm.routeStops.map((label, idx) => (
                  <Fragment key={`edit-stop-${idx}`}>
                    <div className="flex gap-2">
                      <Input
                        value={label}
                        placeholder={idx === 0 ? "Origen" : idx === editForm.routeStops.length - 1 ? "Destino" : "Parada"}
                        onChange={(event) => {
                          const v = event.target.value;
                          setEditForm((prev) => {
                            const n = [...prev.routeStops];
                            n[idx] = v;
                            return { ...prev, routeStops: n };
                          });
                        }}
                      />
                      {idx > 0 && idx < editForm.routeStops.length - 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          aria-label="Quitar parada"
                          onClick={() =>
                            setEditForm((prev) =>
                              prev.routeStops.length <= 2
                                ? prev
                                : { ...prev, routeStops: prev.routeStops.filter((_, i) => i !== idx) },
                            )
                          }
                        >
                          ×
                        </Button>
                      ) : (
                        <span className="w-10 shrink-0" />
                      )}
                    </div>
                    {idx < editForm.routeStops.length - 1 ? (
                      <div className="flex justify-center py-0.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          aria-label="Agregar parada"
                          onClick={() =>
                            setEditForm((prev) => {
                              const n = [...prev.routeStops];
                              n.splice(idx + 1, 0, "Parada");
                              return { ...prev, routeStops: n };
                            })
                          }
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </Fragment>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Cliente / empresa</label>
                <Input value={editForm.clientCompany} onChange={(event) => handleEditClientCompanyChange(event.target.value)} />
              </div>
              <div className="space-y-1">
                {isPrincipalClientCompany(editForm.clientCompany) ? (
                  <>
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="edit-load-plan">
                      Número de plan de carga
                    </label>
                    <Input
                      id="edit-load-plan"
                      className="font-mono"
                      autoComplete="off"
                      maxLength={getPrincipalLoadPlanMaxLength(editForm.clientCompany) ?? 8}
                      value={editForm.remitoNumber}
                      onChange={(event) => {
                        const max = getPrincipalLoadPlanMaxLength(editForm.clientCompany) ?? 8;
                        setEditForm((prev) => ({
                          ...prev,
                          remitoNumber: normalizePrincipalLoadPlanValue(event.target.value, max),
                        }));
                      }}
                      placeholder={getPrincipalLoadPlanMaxLength(editForm.clientCompany) === 7 ? "7 caracteres" : "8 caracteres"}
                    />
                  </>
                ) : (
                  <>
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="edit-load-plan-auto">
                      Plan de carga (ID automático)
                    </label>
                    <Input
                      id="edit-load-plan-auto"
                      readOnly
                      disabled
                      className="bg-muted/50 font-mono text-muted-foreground"
                      value={editForm.remitoNumber}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Fecha del viaje</label>
              <Input type="datetime-local" value={editForm.scheduledAt} onChange={(event) => setEditForm((prev) => ({ ...prev, scheduledAt: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Material/Carga</label>
              <Input value={editForm.cargo} onChange={(event) => setEditForm((prev) => ({ ...prev, cargo: event.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Condiciones de viaje</label>
              <Textarea value={editForm.plan} onChange={(event) => setEditForm((prev) => ({ ...prev, plan: event.target.value }))} className="min-h-[90px]" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingTripId(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveTripEdits}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={alertDetailsTripId !== null} onOpenChange={(open) => !open && setAlertDetailsTripId(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Alertas del viaje {alertDetailsTripId}</DialogTitle>
            <DialogDescription>Detalle de incidencias vinculadas al viaje o a su camión.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {selectedTripAlerts.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Este viaje no tiene alertas registradas.
              </div>
            ) : (
              selectedTripAlerts.map((alert) => (
                <div key={alert.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={alert.status === "Activa" ? "destructive" : "outline"}>{alert.status}</Badge>
                    <Badge variant={alert.severity === "Alta" ? "destructive" : "warning"}>{alert.severity}</Badge>
                    <span className="text-xs text-muted-foreground">{alert.time}</span>
                  </div>
                  <p>{alert.message}</p>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAlertDetailsTripId(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-y-auto sm:max-w-6xl">
          <DialogHeader className="print-hide">
            <DialogTitle>Previsualización de Planilla Operativa Filtrada</DialogTitle>
            <DialogDescription>Se imprime exactamente la misma data visible según filtros activos.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-center overflow-auto bg-muted/50 p-4">
            <div className="print-sheet w-[210mm] min-h-[297mm] bg-white p-6 text-black shadow-lg">
              <div className="mb-4 border-b border-black pb-3">
                <h2 className="text-xl font-bold">Transportes Fighera — Planilla Operativa</h2>
                <p className="text-sm">Fecha: {new Date().toLocaleDateString("es-AR")}</p>
                <p className="text-sm">Filtros aplicados: {printFilterLabel}</p>
              </div>

              <div className="space-y-4 text-xs">
                {groupedByZone.length === 0 ? (
                  <p>No hay viajes para los filtros seleccionados.</p>
                ) : (
                  groupedByZone.map((group) => (
                    <section key={group.zoneId}>
                      <div className="bg-black px-2 py-1 font-semibold uppercase text-white">Zona: {group.zoneName}</div>
                      <table className="w-full border-collapse border border-black">
                        <thead>
                          <tr>
                            <th className="border border-black px-1 py-1 text-left">ID</th>
                            <th className="border border-black px-1 py-1 text-left">Fecha</th>
                            <th className="border border-black px-1 py-1 text-left">Chofer</th>
                            <th className="border border-black px-1 py-1 text-left">Empresa</th>
                            <th className="border border-black px-1 py-1 text-left">Camión</th>
                            <th className="border border-black px-1 py-1 text-left">Ruta</th>
                            <th className="border border-black px-1 py-1 text-left">Carga</th>
                            <th className="border border-black px-1 py-1 text-left">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((trip) => (
                            <tr key={`print-${trip.id}`}>
                              <td className="border border-black px-1 py-1">{trip.id}</td>
                              <td className="border border-black px-1 py-1">{formatDateTime(trip.scheduledAt)}</td>
                              <td className="border border-black px-1 py-1">{trip.driver}</td>
                              <td className="border border-black px-1 py-1">{trip.clientCompany}</td>
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

          <DialogFooter className="print-hide">
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
