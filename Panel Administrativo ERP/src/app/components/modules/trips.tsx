import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import { type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND_NAME } from "../../lib/brand";
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
import { buildPathForStopCount, formatTripRouteStops } from "../../lib/trip-route";
import {
  AutoFitMapBounds,
  fetchRoadPolyline,
  geocodePlaceName,
  reverseGeocodePlaceName,
  tripManualDestIcon,
  tripManualMidIcon,
  tripManualOriginIcon,
} from "./trip-route-map-support";
import { AlertTriangle, CheckCircle2, FolderOpen, Navigation, Palette, PenSquare, Plus, Printer, Trash2, Truck, XCircle } from "lucide-react";
import { TripAssignmentModal } from "./trip-assignment-modal";
import { realtimeAlerts } from "../../lib/mock-data";
import { alertBelongsToOperationalTrip, useSyncAlerts } from "../../lib/sync-store";
import { toast } from "sonner";

function EditTripRouteMapClick({ onPick }: { onPick: (point: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-AR");
}

type TripsProps = {
  onFocusTripInMap?: (tripId: string, zoneId: ZoneId) => void;
  onOpenTripDocuments?: (tripId: string) => void;
};

export function Trips({ onFocusTripInMap, onOpenTripDocuments }: TripsProps) {
  const { trips, zones, drivers, vehicles, routeTemplates, updateTrip, updateTripStatus, cancelTrip, removeTrip } = useOperationsData();
  const [filters, setFilters] = useState<TripOperationsFilters>(() => defaultTripOperationsFilters());
  const [printOpen, setPrintOpen] = useState(false);
  const [simulatingDownload, setSimulatingDownload] = useState(false);
  const [alertDetailsTripId, setAlertDetailsTripId] = useState<string | null>(null);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    zoneId: "",
    routeId: "",
    status: "Sin chofer" as TripStage,
    driver: "",
    vehiclePlate: "",
    routeStops: ["", ""] as string[],
    routePath: [] as LatLngExpression[],
    cargo: "",
    plan: "",
    internalNote: "",
    scheduledAt: "",
    clientCompany: "",
    remitoNumber: "",
  });
  const [editManualOriginPoint, setEditManualOriginPoint] = useState<[number, number] | null>(null);
  const [editManualDestinationPoint, setEditManualDestinationPoint] = useState<[number, number] | null>(null);
  const [editMapSelectionTarget, setEditMapSelectionTarget] = useState<"origin" | "destination">("origin");
  const [editResolvedStopPoints, setEditResolvedStopPoints] = useState<[number, number][]>([]);
  const [editPreviewGeoPath, setEditPreviewGeoPath] = useState<LatLngExpression[]>([]);
  const editGeocodeCacheRef = useRef<Map<string, [number, number] | null>>(new Map());
  const editRouteResolveSeqRef = useRef(0);
  const editMapSelRef = useRef(editMapSelectionTarget);
  editMapSelRef.current = editMapSelectionTarget;

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
      const alerts = syncAlerts.filter((alert) => alertBelongsToOperationalTrip(alert, trip.id, trip.vehiclePlate));
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
  const editZoneRoutes = useMemo(
    () => routeTemplates.filter((route) => route.zoneId === editForm.zoneId),
    [routeTemplates, editForm.zoneId],
  );
  const editSelectedZone = useMemo(
    () => zones.find((zone) => zone.id === editForm.zoneId),
    [zones, editForm.zoneId],
  );
  const editSelectedRouteTemplate = useMemo(
    () => editZoneRoutes.find((route) => route.id === editForm.routeId),
    [editZoneRoutes, editForm.routeId],
  );
  const editShouldUseManualRoute = editZoneRoutes.length === 0;
  const editEffectivePreviewPath = useMemo<LatLngExpression[]>(() => {
    if (editPreviewGeoPath.length >= 2) return editPreviewGeoPath;
    const path = (editSelectedRouteTemplate?.path ?? editForm.routePath) as LatLngExpression[];
    if (!path.length) return [];
    return buildPathForStopCount(path, Math.max(2, editForm.routeStops.length));
  }, [editPreviewGeoPath, editSelectedRouteTemplate, editForm.routePath, editForm.routeStops.length]);
  const editDisplayStopPoints = useMemo<LatLngExpression[]>(() => {
    if (editResolvedStopPoints.length >= 2) return editResolvedStopPoints;
    const path = (editSelectedRouteTemplate?.path ?? editForm.routePath) as LatLngExpression[];
    if (path.length >= 2) return buildPathForStopCount(path, Math.max(2, editForm.routeStops.length));
    return [];
  }, [editResolvedStopPoints, editSelectedRouteTemplate, editForm.routePath, editForm.routeStops.length]);
  const editMapCenter = useMemo<LatLngExpression>(() => {
    if (editManualOriginPoint) return editManualOriginPoint;
    if (editSelectedRouteTemplate?.path?.length) return editSelectedRouteTemplate.path[0] as LatLngExpression;
    if (editForm.routePath.length && Number.isFinite(Number(editForm.routePath[0]?.[0])))
      return editForm.routePath[0] as LatLngExpression;
    return editSelectedZone?.mapCenter ?? [-34.6037, -58.3816];
  }, [editManualOriginPoint, editSelectedRouteTemplate, editForm.routePath, editSelectedZone]);

  useEffect(() => {
    if (editingTripId) return;
    setEditManualOriginPoint(null);
    setEditManualDestinationPoint(null);
    setEditMapSelectionTarget("origin");
    setEditResolvedStopPoints([]);
    setEditPreviewGeoPath([]);
    editGeocodeCacheRef.current = new Map();
  }, [editingTripId]);

  useEffect(() => {
    if (!editingTripId) return;
    const labels = editForm.routeStops.map((s) => s.trim());
    if (labels.length < 2 || labels.some((s) => !s)) {
      setEditResolvedStopPoints([]);
      setEditPreviewGeoPath([]);
      return;
    }
    const currentSeq = ++editRouteResolveSeqRef.current;
    const timer = window.setTimeout(async () => {
      const coords: [number, number][] = [];
      for (let i = 0; i < labels.length; i++) {
        const key = labels[i].toLowerCase();
        if (i === 0 && editManualOriginPoint) {
          coords.push(editManualOriginPoint);
          editGeocodeCacheRef.current.set(key, editManualOriginPoint);
          continue;
        }
        if (i === labels.length - 1 && editManualDestinationPoint) {
          coords.push(editManualDestinationPoint);
          editGeocodeCacheRef.current.set(key, editManualDestinationPoint);
          continue;
        }
        const cached = editGeocodeCacheRef.current.get(key);
        if (cached) {
          coords.push(cached);
          continue;
        }
        const geo = await geocodePlaceName(labels[i]);
        editGeocodeCacheRef.current.set(key, geo);
        if (!geo) continue;
        coords.push(geo);
      }
      if (currentSeq !== editRouteResolveSeqRef.current) return;
      if (coords.length < 2) {
        setEditResolvedStopPoints([]);
        setEditPreviewGeoPath([]);
        return;
      }
      setEditResolvedStopPoints(coords);
      const roadPath = await fetchRoadPolyline(coords);
      if (currentSeq !== editRouteResolveSeqRef.current) return;
      setEditPreviewGeoPath(roadPath.length >= 2 ? roadPath : coords);
    }, 360);
    return () => window.clearTimeout(timer);
  }, [editForm.routeStops, editManualOriginPoint, editManualDestinationPoint, editingTripId]);

  const handleEditManualMapClick = useCallback((point: [number, number]) => {
    const target = editMapSelRef.current;
    if (target === "origin") {
      setEditManualOriginPoint(point);
      setEditMapSelectionTarget("destination");
      setEditForm((prev) => {
        const next = [...prev.routeStops];
        if (!next.length) return { ...prev, routeStops: ["Localizando…", ""] };
        next[0] = "Localizando…";
        return { ...prev, routeStops: next };
      });
      reverseGeocodePlaceName(point[0], point[1]).then((name) =>
        setEditForm((prev) => {
          const n = [...prev.routeStops];
          if (n.length) n[0] = name;
          return { ...prev, routeStops: n };
        }),
      );
      return;
    }
    setEditManualDestinationPoint(point);
    setEditForm((prev) => {
      const next = [...prev.routeStops];
      if (next.length < 2) return { ...prev, routeStops: [...next, "Localizando…"] };
      next[next.length - 1] = "Localizando…";
      return { ...prev, routeStops: next };
    });
    reverseGeocodePlaceName(point[0], point[1]).then((name) =>
      setEditForm((prev) => {
        const n = [...prev.routeStops];
        if (n.length >= 2) n[n.length - 1] = name;
        return { ...prev, routeStops: n };
      }),
    );
  }, []);

  const clearEditManualMap = () => {
    setEditManualOriginPoint(null);
    setEditManualDestinationPoint(null);
    setEditMapSelectionTarget("origin");
    if (!editShouldUseManualRoute) {
      const rt = routeTemplates.find((r) => r.id === editForm.routeId && r.zoneId === editForm.zoneId);
      if (rt) {
        setEditForm((prev) => ({ ...prev, routeStops: [rt.origin, rt.destination], routePath: [...rt.path] }));
      }
    }
    if (editShouldUseManualRoute) {
      toast.message("Mapa limpiado.", { description: "Volvé a marcar origen y destino." });
    } else {
      toast.message("Puntos del mapa borrados.", { description: "Se mantiene la plantilla del listado." });
    }
  };

  const firstEditStopLabel = editForm.routeStops[0] ?? "";
  const lastEditStopLabel = editForm.routeStops[editForm.routeStops.length - 1] ?? "";

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
    const matchedRoute = routeTemplates.find(
      (route) =>
        route.zoneId === trip.zoneId &&
        route.origin.trim().toLowerCase() === trip.origin.trim().toLowerCase() &&
        route.destination.trim().toLowerCase() === trip.destination.trim().toLowerCase(),
    );
    setEditingTripId(trip.id);
    setEditForm({
      zoneId: trip.zoneId,
      routeId: matchedRoute?.id ?? "__manual__",
      status: trip.status,
      driver: trip.status === "Sin chofer" ? "" : trip.driver,
      vehiclePlate: trip.status === "Sin chofer" ? "" : trip.vehiclePlate,
      routeStops: trip.routeStops.length >= 2 ? [...trip.routeStops] : [trip.origin, trip.destination],
      routePath: trip.routePath.length >= 2 ? [...trip.routePath] : [],
      cargo: trip.cargo,
      plan: trip.plan,
      internalNote: trip.internalNote ?? "",
      scheduledAt: trip.scheduledAt,
      clientCompany: trip.clientCompany,
      remitoNumber: trip.remitoNumber,
    });
    setEditManualOriginPoint(null);
    setEditManualDestinationPoint(null);
    setEditMapSelectionTarget("origin");
    setEditResolvedStopPoints([]);
    setEditPreviewGeoPath([]);
    editGeocodeCacheRef.current = new Map();
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

    const generatedPath = editEffectivePreviewPath.filter(
      (point) => Number.isFinite(point[0]) && Number.isFinite(point[1]),
    ) as LatLngExpression[];
    const canUseGeneratedPath = generatedPath.length >= 2;
    const useGeneratedManualRoute =
      canUseGeneratedPath &&
      (editShouldUseManualRoute ||
        editForm.routeStops.length > 2 ||
        Boolean(editManualOriginPoint) ||
        Boolean(editManualDestinationPoint));

    if (editShouldUseManualRoute && !canUseGeneratedPath) {
      toast.error("Definí una ruta válida en el mapa o con paradas ubicables.");
      return;
    }
    const hasTemplateRoute = editForm.routeId !== "__manual__" && Boolean(editSelectedRouteTemplate);
    if (!editShouldUseManualRoute && !useGeneratedManualRoute && !hasTemplateRoute && editForm.routePath.length < 2) {
      toast.error("Elegí una ruta o usá el mapa.");
      return;
    }

    let routePathToSave: LatLngExpression[];
    if (useGeneratedManualRoute) {
      routePathToSave = generatedPath;
    } else if (hasTemplateRoute && editSelectedRouteTemplate?.path?.length) {
      routePathToSave = [...editSelectedRouteTemplate.path];
    } else if (editForm.routePath.length >= 2) {
      routePathToSave = [...editForm.routePath];
    } else {
      routePathToSave = generatedPath;
    }

    const updated = updateTrip(editingTripId, {
      zoneId: editForm.zoneId,
      status: nextStatus,
      driver: editForm.driver,
      vehiclePlate: editForm.vehiclePlate,
      routeStops: trimmed,
      routePath: routePathToSave,
      cargo: editForm.cargo,
      plan: editForm.plan,
      internalNote: editForm.internalNote,
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
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground lg:hidden">
                Vista optimizada para móvil. En pantallas grandes se mantiene la planilla tabular completa.
              </p>
              <div className="space-y-3 lg:hidden">
                {groupedByZone.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    No hay viajes para los filtros seleccionados.
                  </div>
                ) : (
                  groupedByZone.map((zoneGroup) => (
                    <section key={`zone-cards-${zoneGroup.zoneId}`} className="space-y-2">
                      <div className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-100">
                        Zona: {zoneGroup.zoneName}
                      </div>
                      <div className="space-y-2">
                        {zoneGroup.items.map((trip) => {
                          const incidents = alertsByTripId.get(trip.id) ?? [];
                          const activeIncidents = incidents.filter((alert) => alert.status === "Activa").length;
                          return (
                            <Card key={`trip-card-${trip.id}`} className={`${rowStatusTone(trip)} border-border/60`}>
                              <CardContent className="space-y-2 p-3 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold">{trip.id}</span>
                                  <Badge variant={statusBadgeVariant(trip.status) as "secondary"}>{trip.status}</Badge>
                                </div>
                                <p><span className="font-medium">Fecha:</span> {formatDateTime(trip.scheduledAt)}</p>
                                <p><span className="font-medium">Chofer:</span> {trip.driver}</p>
                                <p><span className="font-medium">Empresa:</span> {trip.clientCompany}</p>
                                <p><span className="font-medium">Plan de carga:</span> <span className="font-mono">{trip.remitoNumber}</span></p>
                                <p><span className="font-medium">Camión:</span> <span className="font-mono">{trip.vehiclePlate}</span></p>
                                <p><span className="font-medium">Ruta:</span> {formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}</p>
                                <p><span className="font-medium">Material/Carga:</span> {trip.cargo}</p>
                                <p><span className="font-medium">Obs. interna:</span> {trip.internalNote?.trim() || "—"}</p>
                                {incidents.length === 0 ? (
                                  <span className="text-muted-foreground">Sin alertas</span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant={activeIncidents > 0 ? "destructive" : "outline"}
                                    className="h-8 px-2 text-[11px]"
                                    onClick={() => setAlertDetailsTripId(trip.id)}
                                  >
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    {activeIncidents > 0 ? `${activeIncidents} activa(s)` : `${incidents.length} resueltas`}
                                  </Button>
                                )}
                                <div className="flex flex-wrap gap-1 pt-1">
                                  <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => focusTripInMap(trip)}>
                                    <Navigation className="mr-1 h-3 w-3" />
                                    Mapa
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2 text-[11px]"
                                    onClick={() => onOpenTripDocuments?.(trip.id)}
                                  >
                                    <FolderOpen className="mr-1 h-3 w-3" />
                                    Docs
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => openEditTrip(trip)}>
                                    <PenSquare className="mr-1 h-3 w-3" />
                                    Editar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2 text-[11px]"
                                    disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                                    onClick={() => updateTripStatus(trip.id, "Entregado")}
                                  >
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    Entregar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2 text-[11px]"
                                    disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                                    onClick={() => cancelTrip(trip.id)}
                                  >
                                    <XCircle className="mr-1 h-3 w-3" />
                                    Cancelar
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => removeTrip(trip.id)}>
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    Eliminar
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
              <div className="hidden overflow-x-auto rounded-lg border lg:block">
                <table className="w-full min-w-[1100px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-1.5 text-left">ID Viaje</th>
                      <th className="px-2 py-1.5 text-left">Fecha y hora del viaje</th>
                      <th className="px-2 py-1.5 text-left">Chofer</th>
                      <th className="px-2 py-1.5 text-left">Empresa/Cliente</th>
                      <th className="px-2 py-1.5 text-left">Número de plan de carga</th>
                      <th className="px-2 py-1.5 text-left">Camión (Tractor)</th>
                      <th className="px-2 py-1.5 text-left">Ruta (paradas)</th>
                      <th className="px-2 py-1.5 text-left">Material/Carga</th>
                      <th className="px-2 py-1.5 text-left">Obs. interna</th>
                      <th className="px-2 py-1.5 text-left">Estado</th>
                      <th className="px-2 py-1.5 text-left">Incidencias</th>
                      <th className="px-2 py-1.5 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedByZone.map((zoneGroup) => (
                      <Fragment key={`zone-block-${zoneGroup.zoneId}`}>
                        <tr className="bg-gray-800 text-xs font-semibold uppercase tracking-wide text-gray-100">
                          <td className="px-2 py-1.5" colSpan={12}>
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
                              <td className="px-2 py-1.5 font-mono text-[11px] text-foreground" title="Plan de carga o ID correlativo">
                                {trip.remitoNumber}
                              </td>
                              <td className="px-2 py-1.5 font-mono">{trip.vehiclePlate}</td>
                              <td className="max-w-[280px] px-2 py-1.5 leading-snug">{formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}</td>
                              <td className="px-2 py-1.5">{trip.cargo}</td>
                              <td className="max-w-[240px] px-2 py-1.5 leading-snug text-muted-foreground">
                                {trip.internalNote?.trim() ? trip.internalNote : "—"}
                              </td>
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
                                    className="h-7 px-2 text-[10px]"
                                    onClick={() => setAlertDetailsTripId(trip.id)}
                                  >
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    {activeIncidents > 0 ? `${activeIncidents} activa(s)` : `${incidents.length} resueltas`}
                                  </Button>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex flex-wrap gap-1">
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => focusTripInMap(trip)}>
                                    <Navigation className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px]"
                                    onClick={() => onOpenTripDocuments?.(trip.id)}
                                  >
                                    <FolderOpen className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => openEditTrip(trip)}>
                                    <PenSquare className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px]"
                                    disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                                    onClick={() => updateTripStatus(trip.id, "Entregado")}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px]"
                                    disabled={trip.status === "Entregado" || trip.status === "Cancelado"}
                                    onClick={() => cancelTrip(trip.id)}
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => removeTrip(trip.id)}>
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
                            <p className="font-mono text-[10px] text-muted-foreground">
                              <span className="font-sans font-medium text-foreground">Número de plan de carga:</span> {trip.remitoNumber}
                            </p>
                            <p><span className="font-medium">Observación interna:</span> {trip.internalNote?.trim() || "—"}</p>
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
        <DialogContent className="z-[1600] max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar viaje {editingTripId}</DialogTitle>
            <DialogDescription>
              Misma lógica de programación de viaje: podés editar paradas, chofer, camión y condiciones operativas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <section className="rounded-xl border border-border/80 bg-muted/15 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Zona</label>
              <Select
                value={editForm.zoneId}
                onValueChange={(value) => {
                  setEditManualOriginPoint(null);
                  setEditManualDestinationPoint(null);
                  setEditMapSelectionTarget("origin");
                  setEditForm((prev) => {
                    const keepsCurrent = vehicles.some(
                      (vehicle) =>
                        vehicle.type === "Camión" && vehicle.zoneId === value && vehicle.plate === prev.vehiclePlate,
                    );
                    const suggestedPlate =
                      prev.driver.trim() && prev.driver !== "Sin asignar"
                        ? suggestVehiclePlateForDriver(prev.driver.trim(), value)
                        : "";
                    const firstRouteForZone = routeTemplates.find((route) => route.zoneId === value);
                    return {
                      ...prev,
                      zoneId: value,
                      routeId: firstRouteForZone?.id ?? "__manual__",
                      routePath: firstRouteForZone?.path?.length ? [...firstRouteForZone.path] : [],
                      routeStops: firstRouteForZone ? [firstRouteForZone.origin, firstRouteForZone.destination] : ["", ""],
                      vehiclePlate: keepsCurrent ? prev.vehiclePlate : suggestedPlate,
                    };
                  });
                }}
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
              </div>
            </section>
            <section aria-label="Ruta" className="rounded-xl border border-border/80 bg-muted/15 p-4 space-y-4">
              <div className="space-y-2 rounded-lg border border-border/60 bg-background p-3">
                <div className="overflow-hidden rounded-lg border [&_.leaflet-container]:z-[0] [&_.leaflet-pane]:isolate">
                  <MapContainer center={editMapCenter} zoom={editSelectedZone?.zoom ?? 6} className="h-[clamp(220px,34dvh,340px)] w-full" scrollWheelZoom>
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                    <AutoFitMapBounds path={editEffectivePreviewPath} />
                    <EditTripRouteMapClick onPick={handleEditManualMapClick} />
                    {editEffectivePreviewPath.length >= 2 ? (
                      <Polyline positions={editEffectivePreviewPath} pathOptions={{ color: "#2563eb", weight: 4 }} />
                    ) : null}
                    {editDisplayStopPoints.map((point, idx) => (
                      <Marker
                        key={`edit-stop-map-${idx}`}
                        position={point as [number, number]}
                        icon={
                          idx === 0
                            ? tripManualOriginIcon
                            : idx === editDisplayStopPoints.length - 1
                              ? tripManualDestIcon
                              : tripManualMidIcon
                        }
                      />
                    ))}
                  </MapContainer>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditMapSelectionTarget("origin")}>
                    Origen en mapa
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditMapSelectionTarget("destination")}>
                    Destino en mapa
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={clearEditManualMap}>
                    Limpiar mapa
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tocá el mapa: {editMapSelectionTarget === "origin" ? "primero origen (azul)" : "después destino (verde)"}.
                  {editManualOriginPoint ? ` · ${firstEditStopLabel || "Origen"}` : ""}
                  {editManualDestinationPoint ? ` → ${lastEditStopLabel || "Destino"}` : ""}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-trip-route-select" className="text-xs text-muted-foreground">
                  {editShouldUseManualRoute ? "Sin rutas sugeridas en esta zona" : "Rutas sugeridas"}
                </Label>
                {editShouldUseManualRoute ? (
                  <p
                    id="edit-trip-route-select"
                    className="flex min-h-10 items-center rounded-lg border border-dashed border-muted-foreground/30 bg-background/80 px-3 py-2 text-sm text-muted-foreground"
                  >
                    Marcá origen y destino en el mapa.
                  </p>
                ) : (
                  <Select
                    value={editForm.routeId || "__manual__"}
                    onValueChange={(value) => {
                      setEditManualOriginPoint(null);
                      setEditManualDestinationPoint(null);
                      setEditMapSelectionTarget("origin");
                      setEditForm((prev) => {
                        if (value === "__manual__") return { ...prev, routeId: "__manual__" };
                        const selectedRoute = routeTemplates.find((route) => route.id === value);
                        if (!selectedRoute) return prev;
                        return {
                          ...prev,
                          routeId: selectedRoute.id,
                          routeStops: [selectedRoute.origin, selectedRoute.destination],
                          routePath: [...selectedRoute.path],
                        };
                      });
                    }}
                  >
                    <SelectTrigger id="edit-trip-route-select" className="w-full">
                      <SelectValue placeholder="Seleccionar ruta sugerida" />
                    </SelectTrigger>
                    <SelectContent className="z-[1700]">
                      <SelectItem value="__manual__">Ruta personalizada</SelectItem>
                      {editZoneRoutes.map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Planificación del viaje</Label>
                <div className="rounded-xl bg-muted/35 p-2">
                  <div className="relative space-y-1.5 pl-4 sm:pl-6">
                    <span className="absolute left-[11px] top-5 bottom-6 w-px bg-border" />
                    {editForm.routeStops.map((label, idx) => (
                      <Fragment key={`edit-stop-${idx}`}>
                        <div className="relative grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_2.25rem_2.25rem]">
                          <span
                            className={`absolute -left-3 sm:-left-5 inline-flex h-3 w-3 items-center justify-center rounded-full border-2 border-white ${
                              idx === 0 ? "bg-blue-600" : idx === editForm.routeStops.length - 1 ? "bg-emerald-600" : "bg-slate-900"
                            }`}
                          />
                          <Input
                            className="h-10 min-w-0 w-full rounded-xl border-0 bg-white shadow-sm"
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
                          <div className="flex sm:justify-end">
                            {idx > 0 && idx < editForm.routeStops.length - 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground"
                                aria-label="Quitar parada"
                                onClick={() =>
                                  setEditForm((prev) =>
                                    prev.routeStops.length <= 2 ? prev : { ...prev, routeStops: prev.routeStops.filter((_, i) => i !== idx) },
                                  )
                                }
                              >
                                ×
                              </Button>
                            ) : (
                              <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
                            )}
                          </div>
                          <div className="flex sm:justify-end">
                            {idx < editForm.routeStops.length - 1 ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 shrink-0 rounded-xl border-dashed"
                                aria-label="Agregar parada"
                                onClick={() =>
                                  setEditForm((prev) => {
                                    const n = [...prev.routeStops];
                                    n.splice(idx + 1, 0, "");
                                    return { ...prev, routeStops: n };
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
                            )}
                          </div>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className="rounded-xl border border-border/80 bg-background p-4">
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
              <label className="text-xs font-medium text-muted-foreground">Fecha y hora del viaje</label>
              <Input type="datetime-local" value={editForm.scheduledAt} onChange={(event) => setEditForm((prev) => ({ ...prev, scheduledAt: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Material/Carga</label>
              <Input value={editForm.cargo} onChange={(event) => setEditForm((prev) => ({ ...prev, cargo: event.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Condiciones de viaje / Observaciones (chofer)</label>
              <Textarea value={editForm.plan} onChange={(event) => setEditForm((prev) => ({ ...prev, plan: event.target.value }))} className="min-h-[90px]" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Observación interna (solo uso administrativo)</label>
              <Textarea
                value={editForm.internalNote}
                onChange={(event) => setEditForm((prev) => ({ ...prev, internalNote: event.target.value }))}
                className="min-h-[82px]"
                placeholder="No visible para choferes. Ej.: tarifa, acuerdos comerciales o notas de control interno."
              />
            </div>
            </section>
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
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-xl">
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
        <DialogContent className="max-h-[95dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-6xl">
          <DialogHeader className="print-hide">
            <DialogTitle>Previsualización de Planilla Operativa Filtrada</DialogTitle>
            <DialogDescription>Se imprime exactamente la misma data visible según filtros activos.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-center overflow-auto bg-muted/50 p-4">
            <div className="print-sheet w-[210mm] min-h-[297mm] bg-white p-6 text-black shadow-lg">
              <div className="mb-4 border-b border-black pb-3">
                <h2 className="text-xl font-bold">{BRAND_NAME} — Planilla Operativa</h2>
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
                            <th className="border border-black px-1 py-1 text-left">Fecha y hora del viaje</th>
                            <th className="border border-black px-1 py-1 text-left">Chofer</th>
                            <th className="border border-black px-1 py-1 text-left">Empresa</th>
                            <th className="border border-black px-1 py-1 text-left">Número de plan de carga</th>
                            <th className="border border-black px-1 py-1 text-left">Camión</th>
                            <th className="border border-black px-1 py-1 text-left">Ruta</th>
                            <th className="border border-black px-1 py-1 text-left">Carga</th>
                            <th className="border border-black px-1 py-1 text-left">Obs. interna</th>
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
                              <td className="border border-black px-1 py-1 font-mono">{trip.remitoNumber}</td>
                              <td className="border border-black px-1 py-1">{trip.vehiclePlate}</td>
                              <td className="border border-black px-1 py-1">{formatTripRouteStops(trip.routeStops, trip.origin, trip.destination)}</td>
                              <td className="border border-black px-1 py-1">{trip.cargo}</td>
                              <td className="border border-black px-1 py-1">{trip.internalNote?.trim() || "—"}</td>
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
