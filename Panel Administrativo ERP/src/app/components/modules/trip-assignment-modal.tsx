import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { useOperationsData, ZoneId } from "../../lib/operations-data";
import {
  PRINCIPAL_CLIENT_COMPANIES,
  getPrincipalLoadPlanMaxLength,
  isPrincipalClientCompany,
  isValidPrincipalLoadPlan,
  loadPlanValidationMessage,
  normalizePrincipalLoadPlanValue,
} from "../../lib/trip-clients";
import { CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../ui/utils";
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { buildPathForStopCount } from "../../lib/trip-route";
import {
  AutoFitMapBounds,
  fetchRoadPolyline,
  geocodePlaceName,
  reverseGeocodePlaceName,
  tripManualDestIcon,
  tripManualMidIcon,
  tripManualOriginIcon,
} from "./trip-route-map-support";

type TripAssignmentModalProps = {
  buttonLabel: string;
  onTripCreated?: (tripId: string, zoneId: ZoneId) => void;
  buttonClassName?: string;
};

export function TripAssignmentModal({ buttonLabel, onTripCreated, buttonClassName }: TripAssignmentModalProps) {
  const { zones, routeTemplates, addTrip } = useOperationsData();
  const defaultZoneId = zones[0]?.id ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    zoneId: defaultZoneId as ZoneId,
    routeId: "",
    cargo: "",
    plan: "",
    internalNote: "",
    scheduledAt: "",
    clientCompanySelect: "Sidersa" as "Sidersa" | "Acindar" | "Sipar" | "otra",
    clientCompanyOther: "",
    remitoNumber: "",
  });
  /** Paradas en orden: primera = origen, última = destino. */
  const [stopLabels, setStopLabels] = useState<string[]>(["", ""]);
  const [manualOriginPoint, setManualOriginPoint] = useState<[number, number] | null>(null);
  const [manualDestinationPoint, setManualDestinationPoint] = useState<[number, number] | null>(null);
  const [mapSelectionTarget, setMapSelectionTarget] = useState<"origin" | "destination">("origin");
  const [resolvedStopPoints, setResolvedStopPoints] = useState<[number, number][]>([]);
  const [previewRoutePath, setPreviewRoutePath] = useState<LatLngExpression[]>([]);
  const geocodeCacheRef = useRef<Map<string, [number, number] | null>>(new Map());
  const routeResolveSeqRef = useRef(0);

  const mapSelRef = useRef(mapSelectionTarget);
  mapSelRef.current = mapSelectionTarget;

  useEffect(() => {
    if (!defaultZoneId) return;
    setAssignmentForm((prev) => (prev.zoneId ? prev : { ...prev, zoneId: defaultZoneId as ZoneId }));
  }, [defaultZoneId]);

  const filteredRoutes = routeTemplates.filter((route) => route.zoneId === assignmentForm.zoneId);
  const selectedZone = zones.find((zone) => zone.id === assignmentForm.zoneId);
  const resolvedClientPreview = useMemo(() => {
    if (assignmentForm.clientCompanySelect !== "otra") return assignmentForm.clientCompanySelect;
    return assignmentForm.clientCompanyOther.trim();
  }, [assignmentForm.clientCompanySelect, assignmentForm.clientCompanyOther]);
  const requiresManualLoadPlan = isPrincipalClientCompany(resolvedClientPreview);
  const needsCustomClientName = assignmentForm.clientCompanySelect === "otra";
  const loadPlanMaxLen = requiresManualLoadPlan ? getPrincipalLoadPlanMaxLength(resolvedClientPreview) ?? 7 : null;
  const shouldUseManualRoute = filteredRoutes.length === 0;
  const selectedRouteTemplate = useMemo(
    () => filteredRoutes.find((r) => r.id === assignmentForm.routeId),
    [filteredRoutes, assignmentForm.routeId],
  );
  const mapCenter = useMemo<LatLngExpression>(() => {
    if (manualOriginPoint) return manualOriginPoint;
    if (selectedRouteTemplate?.path?.length) return selectedRouteTemplate.path[0];
    const center = selectedZone?.mapCenter;
    if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
      return [-34.6037, -58.3816];
    }
    return center;
  }, [manualOriginPoint, selectedRouteTemplate, selectedZone]);
  const previewPath = useMemo<LatLngExpression[]>(() => {
    if (previewRoutePath.length >= 2) return previewRoutePath;
    const path = selectedRouteTemplate?.path ?? [];
    if (!path.length) return [];
    const totalStops = Math.max(2, stopLabels.length);
    return buildPathForStopCount(path, totalStops);
  }, [previewRoutePath, selectedRouteTemplate, stopLabels.length]);
  const displayStopPoints = useMemo<LatLngExpression[]>(() => {
    if (resolvedStopPoints.length >= 2) return resolvedStopPoints;
    const path = selectedRouteTemplate?.path ?? [];
    if (path.length >= 2) return buildPathForStopCount(path, Math.max(2, stopLabels.length));
    return [];
  }, [resolvedStopPoints, selectedRouteTemplate, stopLabels.length]);
  const firstStopLabel = stopLabels[0] ?? "";
  const lastStopLabel = stopLabels[stopLabels.length - 1] ?? "";

  const firstRouteId = filteredRoutes[0]?.id ?? "";

  useEffect(() => {
    setManualOriginPoint(null);
    setManualDestinationPoint(null);
    setMapSelectionTarget("origin");
  }, [assignmentForm.zoneId]);

  useEffect(() => {
    if (shouldUseManualRoute) {
      setStopLabels(["", ""]);
    }
  }, [shouldUseManualRoute, assignmentForm.zoneId]);

  useEffect(() => {
    if (shouldUseManualRoute) return;
    const rt = routeTemplates.find((r) => r.id === assignmentForm.routeId && r.zoneId === assignmentForm.zoneId);
    if (rt) {
      setStopLabels([rt.origin, rt.destination]);
      setManualOriginPoint(null);
      setManualDestinationPoint(null);
      setMapSelectionTarget("origin");
    }
  }, [assignmentForm.routeId, assignmentForm.zoneId, shouldUseManualRoute, routeTemplates]);

  useEffect(() => {
    const labels = stopLabels.map((s) => s.trim());
    if (labels.length < 2 || labels.some((s) => !s)) {
      setResolvedStopPoints([]);
      setPreviewRoutePath([]);
      return;
    }
    const currentSeq = ++routeResolveSeqRef.current;
    const timer = window.setTimeout(async () => {
      const coords: [number, number][] = [];
      for (let i = 0; i < labels.length; i++) {
        const key = labels[i].toLowerCase();
        if (i === 0 && manualOriginPoint) {
          coords.push(manualOriginPoint);
          geocodeCacheRef.current.set(key, manualOriginPoint);
          continue;
        }
        if (i === labels.length - 1 && manualDestinationPoint) {
          coords.push(manualDestinationPoint);
          geocodeCacheRef.current.set(key, manualDestinationPoint);
          continue;
        }
        const cached = geocodeCacheRef.current.get(key);
        if (cached) {
          coords.push(cached);
          continue;
        }
        const geo = await geocodePlaceName(labels[i]);
        geocodeCacheRef.current.set(key, geo);
        if (!geo) continue;
        coords.push(geo);
      }
      if (currentSeq !== routeResolveSeqRef.current) return;
      if (coords.length < 2) {
        setResolvedStopPoints([]);
        setPreviewRoutePath([]);
        return;
      }
      setResolvedStopPoints(coords);
      const roadPath = await fetchRoadPolyline(coords);
      if (currentSeq !== routeResolveSeqRef.current) return;
      setPreviewRoutePath(roadPath.length >= 2 ? roadPath : coords);
    }, 360);
    return () => window.clearTimeout(timer);
  }, [stopLabels, manualOriginPoint, manualDestinationPoint]);

  useEffect(() => {
    if (!isOpen) return;
    setAssignmentForm((prev) => ({
      ...prev,
      routeId: shouldUseManualRoute ? "" : prev.routeId || firstRouteId,
      scheduledAt: prev.scheduledAt || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    }));
  }, [isOpen, firstRouteId, shouldUseManualRoute]);

  function handleDialogOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      setManualOriginPoint(null);
      setManualDestinationPoint(null);
      setStopLabels(["", ""]);
      setMapSelectionTarget("origin");
      setAssignmentForm({
        zoneId: (zones[0]?.id ?? "") as ZoneId,
        routeId: "",
        cargo: "",
        plan: "",
        internalNote: "",
        scheduledAt: "",
        clientCompanySelect: "Sidersa",
        clientCompanyOther: "",
        remitoNumber: "",
      });
    }
  }

  const handleManualMapClick = useCallback((point: [number, number]) => {
    const target = mapSelRef.current;
    if (target === "origin") {
      setManualOriginPoint(point);
      setMapSelectionTarget("destination");
      setStopLabels((prev) => {
        const next = [...prev];
        if (!next.length) return ["Localizando…", ""];
        next[0] = "Localizando…";
        return next;
      });
      reverseGeocodePlaceName(point[0], point[1]).then((name) =>
        setStopLabels((prev) => {
          const n = [...prev];
          if (n.length) n[0] = name;
          return n;
        }),
      );
      return;
    }
    setManualDestinationPoint(point);
    setStopLabels((prev) => {
      const next = [...prev];
      if (next.length < 2) return [...next, "Localizando…"];
      next[next.length - 1] = "Localizando…";
      return next;
    });
    reverseGeocodePlaceName(point[0], point[1]).then((name) =>
      setStopLabels((prev) => {
        const n = [...prev];
        if (n.length >= 2) n[n.length - 1] = name;
        return n;
      }),
    );
  }, []);

  function ManualRouteMapEvents() {
    useMapEvents({
      click(event) {
        handleManualMapClick([event.latlng.lat, event.latlng.lng]);
      },
    });
    return null;
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resolvedRouteId = assignmentForm.routeId || filteredRoutes[0]?.id || "";
    const resolvedScheduledAt = assignmentForm.scheduledAt || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
    if (!assignmentForm.cargo.trim() || !assignmentForm.plan.trim()) {
      toast.error("Completá tipo de carga y condiciones de viaje para continuar.");
      return;
    }

    const clientCompany =
      assignmentForm.clientCompanySelect !== "otra"
        ? assignmentForm.clientCompanySelect
        : assignmentForm.clientCompanyOther.trim();
    if (!clientCompany) {
      toast.error("Indicá la empresa o cliente del viaje.");
      return;
    }
    if (isPrincipalClientCompany(clientCompany)) {
      const digits = assignmentForm.remitoNumber.trim();
      if (!isValidPrincipalLoadPlan(clientCompany, digits)) {
        toast.error(loadPlanValidationMessage(clientCompany));
        return;
      }
    } else if (assignmentForm.clientCompanySelect === "otra" && !assignmentForm.clientCompanyOther.trim()) {
      toast.error("Indicá el nombre del cliente o empresa.");
      return;
    }

    const trimmedStops = stopLabels.map((s) => s.trim());
    if (trimmedStops.length < 2 || trimmedStops.some((s) => !s)) {
      toast.error("Completá el nombre de cada parada.");
      return;
    }

    const generatedPath = previewPath.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    const canUseGeneratedPath = generatedPath.length >= 2;
    const useGeneratedManualRoute =
      canUseGeneratedPath &&
      (shouldUseManualRoute || stopLabels.length > 2 || Boolean(manualOriginPoint) || Boolean(manualDestinationPoint));

    if (shouldUseManualRoute && !canUseGeneratedPath) {
      toast.error("Definí una ruta válida en el mapa o con paradas ubicables.");
      return;
    }
    if (!shouldUseManualRoute && !useGeneratedManualRoute && !resolvedRouteId) {
      toast.error("Elegí una ruta o usá el mapa.");
      return;
    }

    const trip = addTrip({
      zoneId: assignmentForm.zoneId,
      routeId: useGeneratedManualRoute ? undefined : resolvedRouteId,
      routeStops: trimmedStops,
      manualRoute: useGeneratedManualRoute ? { path: generatedPath as [number, number][] } : undefined,
      cargo: assignmentForm.cargo,
      plan: assignmentForm.plan,
      internalNote: assignmentForm.internalNote,
      scheduledAt: resolvedScheduledAt,
      clientCompany,
      remitoNumber: isPrincipalClientCompany(clientCompany) ? assignmentForm.remitoNumber.trim() : undefined,
    });
    if (!trip) {
      toast.error("No se pudo crear el viaje. Revisa los datos e intenta nuevamente.");
      return;
    }
    onTripCreated?.(trip.id, trip.zoneId);
    handleDialogOpenChange(false);
    setAssignmentForm((prev) => ({
      zoneId: prev.zoneId,
      routeId: shouldUseManualRoute ? "" : resolvedRouteId,
      cargo: "",
      plan: "",
      internalNote: "",
      scheduledAt: resolvedScheduledAt,
      clientCompanySelect: "Sidersa",
      clientCompanyOther: "",
      remitoNumber: "",
    }));
  }

  const clearManualMap = () => {
    setManualOriginPoint(null);
    setManualDestinationPoint(null);
    setMapSelectionTarget("origin");
    if (!shouldUseManualRoute) {
      const rt = routeTemplates.find((r) => r.id === assignmentForm.routeId && r.zoneId === assignmentForm.zoneId);
      if (rt) setStopLabels([rt.origin, rt.destination]);
    }
    if (shouldUseManualRoute) {
      toast.message("Mapa limpiado.", { description: "Volvé a marcar origen y destino." });
    } else {
      toast.message("Puntos del mapa borrados.", { description: "Se mantiene la plantilla del listado." });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" className={cn("gap-2", buttonClassName)}>
          <Plus className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="z-[1600] max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Nueva programación de viaje</DialogTitle>
          <DialogDescription className="text-sm">
            Elegí zona, definí ruta y guardá. El sistema asigna chofer automáticamente según disponibilidad.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={submitAssignment}>
          <div className="w-full space-y-2">
            <Label htmlFor="trip-zone-select" className="block text-sm font-medium leading-snug text-foreground">
              Selecciona la zona a la que deseas establecer el viaje
            </Label>
            <Select
              value={assignmentForm.zoneId}
              onValueChange={(value: ZoneId) =>
                setAssignmentForm({
                  zoneId: value,
                  routeId: routeTemplates.find((route) => route.zoneId === value)?.id ?? "",
                  cargo: "",
                  plan: "",
                  internalNote: "",
                  scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
                  clientCompanySelect: "Sidersa",
                  clientCompanyOther: "",
                  remitoNumber: "",
                })
              }
            >
              <SelectTrigger id="trip-zone-select" className="w-full">
                <SelectValue placeholder="Elegí una zona" />
              </SelectTrigger>
              <SelectContent className="z-[1700]">
                {zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <section aria-label="Ruta" className="rounded-xl border border-border/80 bg-muted/15 p-4 space-y-4">
            <div className="space-y-2 rounded-lg border border-border/60 bg-background p-3">
              <div className="overflow-hidden rounded-lg border [&_.leaflet-container]:z-[0] [&_.leaflet-pane]:isolate">
                <MapContainer center={mapCenter} zoom={selectedZone?.zoom ?? 6} className="h-[clamp(220px,34dvh,340px)] w-full" scrollWheelZoom>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  />
                  <AutoFitMapBounds path={previewPath} />
                  <ManualRouteMapEvents />
                  {previewPath.length >= 2 ? (
                    <Polyline positions={previewPath} pathOptions={{ color: "#2563eb", weight: 4 }} />
                  ) : null}
                  {displayStopPoints.map((point, idx) => (
                    <Marker
                      key={`preview-stop-${idx}`}
                      position={point as [number, number]}
                      icon={idx === 0 ? tripManualOriginIcon : idx === displayStopPoints.length - 1 ? tripManualDestIcon : tripManualMidIcon}
                    />
                  ))}
                </MapContainer>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setMapSelectionTarget("origin")}>
                  Origen en mapa
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setMapSelectionTarget("destination")}>
                  Destino en mapa
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearManualMap}>
                  Limpiar mapa
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tocá el mapa: {mapSelectionTarget === "origin" ? "primero origen (azul)" : "después destino (verde)"}.
                {manualOriginPoint ? ` · ${firstStopLabel || "Origen"}` : ""}
                {manualDestinationPoint ? ` → ${lastStopLabel || "Destino"}` : ""}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trip-route-select" className="text-xs text-muted-foreground">
                {shouldUseManualRoute ? "Sin rutas sugeridas en esta zona" : "Rutas sugeridas"}
              </Label>
              {shouldUseManualRoute ? (
                <p
                  id="trip-route-select"
                  className="flex min-h-10 items-center rounded-lg border border-dashed border-muted-foreground/30 bg-background/80 px-3 py-2 text-sm text-muted-foreground"
                >
                  Marcá origen y destino en el mapa.
                </p>
              ) : (
                <Select value={assignmentForm.routeId} onValueChange={(value) => setAssignmentForm((prev) => ({ ...prev, routeId: value }))}>
                  <SelectTrigger id="trip-route-select" className="w-full">
                    <SelectValue placeholder="Elegir ruta" />
                  </SelectTrigger>
                  <SelectContent className="z-[1700]">
                    {filteredRoutes.map((route) => (
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
                  {stopLabels.map((label, idx) => (
                    <Fragment key={`stop-${idx}`}>
                      <div className="relative grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_2.25rem_2.25rem]">
                        <span
                          className={`absolute -left-3 sm:-left-5 inline-flex h-3 w-3 items-center justify-center rounded-full border-2 border-white ${
                            idx === 0 ? "bg-blue-600" : idx === stopLabels.length - 1 ? "bg-emerald-600" : "bg-slate-900"
                          }`}
                        />
                        <Input
                          className="h-10 min-w-0 w-full rounded-xl border-0 bg-white shadow-sm"
                          value={label}
                          placeholder={idx === 0 ? "Origen" : idx === stopLabels.length - 1 ? "Destino" : "Parada"}
                          onChange={(event) => {
                            const v = event.target.value;
                            setStopLabels((prev) => {
                              const n = [...prev];
                              n[idx] = v;
                              return n;
                            });
                          }}
                        />
                        <div className="flex sm:justify-end">
                          {idx > 0 && idx < stopLabels.length - 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground"
                              aria-label="Quitar parada"
                              onClick={() =>
                                setStopLabels((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)))
                              }
                            >
                              ×
                            </Button>
                          ) : (
                            <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
                          )}
                        </div>
                        <div className="flex sm:justify-end">
                          {idx < stopLabels.length - 1 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 shrink-0 rounded-xl border-dashed"
                              aria-label="Agregar parada"
                              onClick={() =>
                                setStopLabels((prev) => {
                                  const n = [...prev];
                                  n.splice(idx + 1, 0, "");
                                  return n;
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

          <section className="rounded-xl border border-border/80 bg-background p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="trip-client-select" className="text-sm font-medium text-foreground">
                  Cliente / empresa
                </Label>
                <Select
                  value={assignmentForm.clientCompanySelect}
                  onValueChange={(value: "Sidersa" | "Acindar" | "Sipar" | "otra") =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      clientCompanySelect: value,
                      remitoNumber: "",
                      clientCompanyOther: value === "otra" ? prev.clientCompanyOther : "",
                    }))
                  }
                >
                  <SelectTrigger id="trip-client-select" className="w-full">
                    <SelectValue placeholder="Elegí cliente" />
                  </SelectTrigger>
                  <SelectContent className="z-[1700]">
                    {PRINCIPAL_CLIENT_COMPANIES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    <SelectItem value="otra">Otra empresa…</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-2">
                {requiresManualLoadPlan ? (
                  <>
                    <Label htmlFor="trip-load-plan" className="text-sm font-medium text-foreground">
                      Número de plan de carga
                    </Label>
                    <Input
                      id="trip-load-plan"
                      className="font-mono tracking-wide"
                      autoComplete="off"
                      maxLength={loadPlanMaxLen ?? 8}
                      value={assignmentForm.remitoNumber}
                      onChange={(event) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          remitoNumber: normalizePrincipalLoadPlanValue(
                            event.target.value,
                            loadPlanMaxLen ?? 8,
                          ),
                        }))
                      }
                      placeholder={loadPlanMaxLen === 7 ? "7 caracteres" : "8 caracteres"}
                      required
                    />
                  </>
                ) : needsCustomClientName ? (
                  <>
                    <Label htmlFor="trip-client-other" className="text-sm font-medium text-foreground">
                      Nombre del cliente o empresa
                    </Label>
                    <Input
                      id="trip-client-other"
                      value={assignmentForm.clientCompanyOther}
                      onChange={(event) =>
                        setAssignmentForm((prev) => ({ ...prev, clientCompanyOther: event.target.value }))
                      }
                      placeholder="Ej.: distribuidora, obra, contacto comercial"
                      required
                      maxLength={120}
                    />
                  </>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Fecha y hora del viaje
                </Label>
                <Input
                  type="datetime-local"
                  value={assignmentForm.scheduledAt}
                  onChange={(event) => setAssignmentForm((prev) => ({ ...prev, scheduledAt: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Material/Carga</Label>
                <Input
                  value={assignmentForm.cargo}
                  onChange={(event) => setAssignmentForm((prev) => ({ ...prev, cargo: event.target.value }))}
                  placeholder="Tipo y peso"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <Label htmlFor="trip-conditions-notes" className="text-sm font-medium leading-snug text-foreground">
                  Condiciones de viaje / Observaciones (chofer)
                </Label>
                <p id="trip-conditions-notes-hint" className="mt-1 text-xs leading-snug text-muted-foreground">
                  Este campo se verá en la app del chofer (ej.: condiciones de ruta, ventanas horarias, contacto operativo).
                </p>
              </div>
              <Textarea
                id="trip-conditions-notes"
                aria-describedby="trip-conditions-notes-hint"
                value={assignmentForm.plan}
                onChange={(event) => setAssignmentForm((prev) => ({ ...prev, plan: event.target.value }))}
                placeholder="Ej.: condiciones del viaje, camión, contacto operativo, ventanas horarias, etc."
                className="min-h-[88px] resize-y"
                required
              />
            </div>
            <div className="space-y-2">
              <div>
                <Label htmlFor="trip-internal-note" className="text-sm font-medium leading-snug text-foreground">
                  Observación interna (uso administrativo)
                </Label>
                <p id="trip-internal-note-hint" className="mt-1 text-xs leading-snug text-muted-foreground">
                  Solo visible en panel admin. El chofer no verá este contenido (ej.: tarifa, acuerdos comerciales, notas internas).
                </p>
              </div>
              <Textarea
                id="trip-internal-note"
                aria-describedby="trip-internal-note-hint"
                value={assignmentForm.internalNote}
                onChange={(event) => setAssignmentForm((prev) => ({ ...prev, internalNote: event.target.value }))}
                placeholder="Ej.: tarifa pactada, condición de facturación, observaciones internas..."
                className="min-h-[80px] resize-y"
              />
            </div>
          </section>

          <DialogFooter className="mt-2 border-t border-border/80 pt-4">
            <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Programar y asignar viaje</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
