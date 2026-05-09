import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { useOperationsData, ZoneId } from "../../lib/operations-data";
import { PRINCIPAL_CLIENT_COMPANIES, isPrincipalClientCompany } from "../../lib/trip-clients";
import { CalendarClock, MapPinned, Plus } from "lucide-react";
import { toast } from "sonner";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

/** Evita sprites rotos del ícono por defecto en Vite (markers con DivIcon claros). */
const tripManualOriginIcon = L.divIcon({
  className: "!border-0 !bg-transparent focus:outline-none",
  html:
    '<div style="display:flex;width:28px;height:28px;margin:-14px -14px;align-items:center;justify-content:center"><span style="width:18px;height:18px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"><span></span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const tripManualDestIcon = L.divIcon({
  className: "!border-0 !bg-transparent focus:outline-none",
  html:
    '<div style="display:flex;width:28px;height:28px;margin:-14px -14px;align-items:center;justify-content:center"><span style="width:18px;height:18px;background:#059669;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"><span></span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const PLACE_TYPE_PHOTON_SCORE: Record<string, number> = {
  city: 90,
  town: 82,
  village: 74,
  hamlet: 68,
  suburb: 62,
  district: 56,
  county: 50,
};

function sanitizeJsonSnippet(text: string) {
  const t = text.trim();
  const i = Math.min(...[t.indexOf("{"), t.indexOf("[")].filter((x) => x >= 0));
  if (!Number.isFinite(i) || i < 0) return null;
  try {
    return JSON.parse(t.slice(i));
  } catch {
    return null;
  }
}

function isSettledPlaceLabel(value: string) {
  const t = value.trim();
  return Boolean(t && t !== "Localizando…" && !t.startsWith("Localizando"));
}

function pickPhotonReverseLabel(fc: { features?: Array<{ properties?: Record<string, unknown> }> }) {
  const list = fc.features ?? [];
  let best: string | null = null;
  let score = -1;
  for (const f of list) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const t = String(p.type ?? p.osm_value ?? "").toLowerCase();
    let s = PLACE_TYPE_PHOTON_SCORE[t] ?? 35;
    if (t === "other" || t === "street" || t === "building" || p.osm_value === "dam") s -= 35;
    if (typeof p.name === "string" && p.name.trim()) s += 25;
    if (typeof p.state === "string" && p.state) s += 10;
    if (typeof p.country === "string") s += 2;
    if (s < 25) continue;
    const locality = typeof p.city === "string" ? p.city : typeof p.town === "string" ? p.town : typeof p.name === "string" ? p.name : null;
    const state = typeof p.state === "string" ? p.state : null;
    const country = typeof p.country === "string" ? p.country : "";
    const parts = [locality, state === locality ? null : state, country !== "Argentina" ? country : null].filter(Boolean) as string[];
    const label = parts.length ? parts.join(", ") : typeof p.name === "string" && p.name ? p.name : null;
    if (!label) continue;
    if (s > score) {
      score = s;
      best = label;
    }
  }
  return best;
}

async function reverseGeocodePlaceName(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
    if (!r.ok) throw new Error("photon");
    const fc = sanitizeJsonSnippet(await r.text()) as { features?: Array<{ properties?: Record<string, unknown> }> };
    const fromPhoton = fc && typeof fc === "object" ? pickPhotonReverseLabel(fc) : null;
    if (fromPhoton) return fromPhoton;
  } catch {
    /* continuar nominatim */
  }
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json", "Accept-Language": "es-AR,es" } },
    );
    if (!r.ok) throw new Error("nominatim");
    const raw = await r.text();
    const j = sanitizeJsonSnippet(raw) as {
      display_name?: string;
      address?: { city?: string; town?: string; village?: string; suburb?: string; state?: string; county?: string; country?: string };
    };
    const a = j?.address ?? {};
    const head =
      [a.city, a.town, a.village, a.suburb, a.county].find((x) => typeof x === "string" && x.trim()) ?? "";
    const state = typeof a.state === "string" ? a.state : "";
    if (head) return [head, state && head !== state ? state : null, (a.country as string | undefined)?.includes("Argentina") ? null : (a.country as string)]
      .filter(Boolean)
      .join(", ");
    if (j?.display_name) return String(j.display_name).split(",").slice(0, 3).join(",").trim();
  } catch {
    /* último recurso corto sin coordenadas largas */
  }
  return "Ubicación en mapa";
}

type TripAssignmentModalProps = {
  buttonLabel: string;
  onTripCreated?: (tripId: string, zoneId: ZoneId) => void;
  buttonClassName?: string;
};

export function TripAssignmentModal({ buttonLabel, onTripCreated, buttonClassName }: TripAssignmentModalProps) {
  const { zones, drivers, vehicles, routeTemplates, trips, addTrip } = useOperationsData();
  const defaultZoneId = zones[0]?.id ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    zoneId: defaultZoneId as ZoneId,
    driverId: "",
    vehicleId: "",
    routeId: "",
    cargo: "",
    plan: "",
    scheduledAt: "",
    clientCompanySelect: "SIDERSA" as "SIDERSA" | "Acindar" | "CIPLAR" | "otra",
    clientCompanyOther: "",
    remitoNumber: "",
  });
  const [manualRouteOrigin, setManualRouteOrigin] = useState("");
  const [manualRouteDestination, setManualRouteDestination] = useState("");
  const [manualOriginPoint, setManualOriginPoint] = useState<[number, number] | null>(null);
  const [manualDestinationPoint, setManualDestinationPoint] = useState<[number, number] | null>(null);
  const [mapSelectionTarget, setMapSelectionTarget] = useState<"origin" | "destination">("origin");
  const [manualMapSectionOpen, setManualMapSectionOpen] = useState(false);

  const mapSelRef = useRef(mapSelectionTarget);
  mapSelRef.current = mapSelectionTarget;

  const filteredDrivers = drivers;
  useEffect(() => {
    if (!defaultZoneId) return;
    setAssignmentForm((prev) => (prev.zoneId ? prev : { ...prev, zoneId: defaultZoneId as ZoneId }));
  }, [defaultZoneId]);

  const filteredVehicles = vehicles.filter((vehicle) => vehicle.type === "Camión");
  const filteredRoutes = routeTemplates.filter((route) => route.zoneId === assignmentForm.zoneId);
  const selectedZone = zones.find((zone) => zone.id === assignmentForm.zoneId);
  const resolvedClientPreview = useMemo(() => {
    if (assignmentForm.clientCompanySelect !== "otra") return assignmentForm.clientCompanySelect;
    return assignmentForm.clientCompanyOther.trim();
  }, [assignmentForm.clientCompanySelect, assignmentForm.clientCompanyOther]);
  const requiresRemitoInput = isPrincipalClientCompany(resolvedClientPreview);
  const mapCenter = useMemo<LatLngExpression>(() => {
    const center = selectedZone?.mapCenter;
    if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
      return [-34.6037, -58.3816];
    }
    return center;
  }, [selectedZone]);
  const shouldUseManualRoute = filteredRoutes.length === 0;
  const mapSectionVisible = shouldUseManualRoute || manualMapSectionOpen;
  const routingFromManualMapReady =
    Boolean(
      manualOriginPoint &&
      manualDestinationPoint &&
      isSettledPlaceLabel(manualRouteOrigin) &&
      isSettledPlaceLabel(manualRouteDestination),
    );

  const firstDriverId = filteredDrivers[0]?.id ?? "";
  const firstVehicleId = filteredVehicles[0]?.id ?? "";
  const firstRouteId = filteredRoutes[0]?.id ?? "";

  const suggestVehicleForDriver = (driverId: string) => {
    const selectedDriver = drivers.find((driver) => driver.id === driverId);
    if (!selectedDriver) return "";
    const lastTripWithVehicle = [...trips]
      .reverse()
      .find((trip) => trip.driver === selectedDriver.name && trip.vehiclePlate);
    if (lastTripWithVehicle) {
      const matchedVehicle = filteredVehicles.find((vehicle) => vehicle.plate === lastTripWithVehicle.vehiclePlate);
      if (matchedVehicle) return matchedVehicle.id;
    }
    return filteredVehicles[0]?.id ?? "";
  };

  useEffect(() => {
    setManualOriginPoint(null);
    setManualDestinationPoint(null);
    setManualRouteOrigin("");
    setManualRouteDestination("");
    setMapSelectionTarget("origin");
    setManualMapSectionOpen(false);
  }, [assignmentForm.zoneId]);

  useEffect(() => {
    if (!isOpen) return;
    setAssignmentForm((prev) => ({
      ...prev,
      driverId: prev.driverId || firstDriverId,
      vehicleId: prev.vehicleId || (prev.driverId ? suggestVehicleForDriver(prev.driverId) : firstVehicleId),
      routeId: shouldUseManualRoute ? "" : prev.routeId || firstRouteId,
      scheduledAt: prev.scheduledAt || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    }));
  }, [isOpen, firstDriverId, firstVehicleId, firstRouteId, shouldUseManualRoute]);

  function handleDialogOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      setManualMapSectionOpen(false);
      setManualOriginPoint(null);
      setManualDestinationPoint(null);
      setManualRouteOrigin("");
      setManualRouteDestination("");
      setMapSelectionTarget("origin");
      setAssignmentForm({
        zoneId: (zones[0]?.id ?? "") as ZoneId,
        driverId: "",
        vehicleId: "",
        routeId: "",
        cargo: "",
        plan: "",
        scheduledAt: "",
        clientCompanySelect: "SIDERSA",
        clientCompanyOther: "",
        remitoNumber: "",
      });
    }
  }

  const handleManualMapClick = useCallback((point: [number, number]) => {
    const target = mapSelRef.current;
    if (target === "origin") {
      setManualOriginPoint(point);
      setManualRouteOrigin("Localizando…");
      setMapSelectionTarget("destination");
      reverseGeocodePlaceName(point[0], point[1]).then((name) => setManualRouteOrigin(name));
      return;
    }
    setManualDestinationPoint(point);
    setManualRouteDestination("Localizando…");
    reverseGeocodePlaceName(point[0], point[1]).then((name) => setManualRouteDestination(name));
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
    const resolvedDriverId = assignmentForm.driverId || filteredDrivers[0]?.id || "";
    const resolvedVehicleId = assignmentForm.vehicleId || suggestVehicleForDriver(resolvedDriverId) || filteredVehicles[0]?.id || "";
    const resolvedRouteId = assignmentForm.routeId || filteredRoutes[0]?.id || "";
    const resolvedScheduledAt = assignmentForm.scheduledAt || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

    if (!resolvedDriverId || !resolvedVehicleId) {
      toast.error("Debe existir al menos un chofer y un camión para asignar el viaje.");
      return;
    }
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
    if (isPrincipalClientCompany(clientCompany) && !assignmentForm.remitoNumber.trim()) {
      toast.error("Para SIDERSA, Acindar o CIPLAR debés ingresar el número de remito.");
      return;
    }

    const manualPath = manualOriginPoint && manualDestinationPoint ? [manualOriginPoint, manualDestinationPoint] : [];
    const useManualFromMap = shouldUseManualRoute || routingFromManualMapReady;

    if (shouldUseManualRoute && !routingFromManualMapReady) {
      toast.error("Define origen, destino y ambos puntos en el mapa para la ruta manual.");
      return;
    }
    if (!shouldUseManualRoute && !routingFromManualMapReady && !resolvedRouteId) {
      toast.error("Seleccioná una ruta o definí origen y destino en el mapa.");
      return;
    }
    if (useManualFromMap && (!isSettledPlaceLabel(manualRouteOrigin) || !isSettledPlaceLabel(manualRouteDestination) || manualPath.length < 2)) {
      toast.error("Completá origen y destino en el mapa y esperá el nombre del lugar (o escribilo a mano).");
      return;
    }

    const trip = addTrip({
      zoneId: assignmentForm.zoneId,
      driverId: resolvedDriverId,
      vehicleId: resolvedVehicleId,
      routeId: useManualFromMap ? undefined : resolvedRouteId,
      manualRoute: useManualFromMap
        ? {
            origin: manualRouteOrigin.trim(),
            destination: manualRouteDestination.trim(),
            path: manualPath,
          }
        : undefined,
      cargo: assignmentForm.cargo,
      plan: assignmentForm.plan,
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
      driverId: resolvedDriverId,
      vehicleId: resolvedVehicleId,
      routeId: shouldUseManualRoute ? "" : resolvedRouteId,
      cargo: "",
      plan: "",
      scheduledAt: resolvedScheduledAt,
      clientCompanySelect: "SIDERSA",
      clientCompanyOther: "",
      remitoNumber: "",
    }));
  }

  const clearManualMap = () => {
    setManualOriginPoint(null);
    setManualDestinationPoint(null);
    setManualRouteOrigin("");
    setManualRouteDestination("");
    setMapSelectionTarget("origin");
    if (!shouldUseManualRoute) {
      toast.message("Marcadores del mapa limpiados.", { description: "Se usa la ruta elegida del desplegable." });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button className={buttonClassName}>
          <Plus className="mr-2 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="z-[1600] max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Nueva programación de viaje</DialogTitle>
          <DialogDescription>Completa la asignación para gestionar el viaje desde el panel y monitor.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={submitAssignment}>
          <section aria-labelledby="trip-assign-resources" className="space-y-3">
            <h3 id="trip-assign-resources" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Zona y equipo
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Zona</Label>
                <Select
                  value={assignmentForm.zoneId}
                  onValueChange={(value: ZoneId) =>
                    setAssignmentForm({
                      zoneId: value,
                      driverId: assignmentForm.driverId || drivers[0]?.id || "",
                      vehicleId: assignmentForm.driverId ? suggestVehicleForDriver(assignmentForm.driverId) : filteredVehicles[0]?.id ?? "",
                      routeId: routeTemplates.find((route) => route.zoneId === value)?.id ?? "",
                      cargo: "",
                      plan: "",
                      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
                      clientCompanySelect: "SIDERSA",
                      clientCompanyOther: "",
                      remitoNumber: "",
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Seleccionar zona" /></SelectTrigger>
                  <SelectContent className="z-[1700]">
                    {zones.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chofer</Label>
                <Select
                  value={assignmentForm.driverId}
                  onValueChange={(value) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      driverId: value,
                      vehicleId: suggestVehicleForDriver(value) || prev.vehicleId,
                    }))
                  }
                >
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Seleccionar chofer" /></SelectTrigger>
                  <SelectContent className="z-[1700]">
                    {filteredDrivers.map((driver) => <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <Label>Camión</Label>
                <Select value={assignmentForm.vehicleId} onValueChange={(value) => setAssignmentForm((prev) => ({ ...prev, vehicleId: value }))}>
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Seleccionar camión" /></SelectTrigger>
                  <SelectContent className="z-[1700]">
                    {filteredVehicles.map((vehicle) => <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.plate}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section aria-labelledby="trip-assign-route" className="rounded-lg border border-border/80 bg-muted/20 p-4 shadow-sm">
            <h3 id="trip-assign-route" className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ruta origen–destino
            </h3>
            <div className="space-y-2">
              <Label htmlFor="trip-route-select" className="text-foreground">
                {shouldUseManualRoute ? "Sin plantillas en esta zona" : "Plantilla de ruta"}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  {shouldUseManualRoute ? (
                    <p
                      id="trip-route-select"
                      className="flex min-h-10 items-center rounded-md border border-dashed border-muted-foreground/35 bg-background/80 px-3 py-2 text-sm leading-snug text-muted-foreground"
                    >
                      Esta zona no tiene rutas definidas. Usá el mapa para marcar origen y destino.
                    </p>
                  ) : (
                    <Select value={assignmentForm.routeId} onValueChange={(value) => setAssignmentForm((prev) => ({ ...prev, routeId: value }))}>
                      <SelectTrigger id="trip-route-select" className="h-10 w-full">
                        <SelectValue placeholder="Seleccionar ruta" />
                      </SelectTrigger>
                      <SelectContent className="z-[1700]">
                        {filteredRoutes.map((route) => (
                          <SelectItem key={route.id} value={route.id}>{route.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  type="button"
                  size="lg"
                  variant={mapSectionVisible && !shouldUseManualRoute ? "secondary" : "outline"}
                  className="w-full shrink-0 sm:w-auto sm:min-w-[9.5rem]"
                  title="Abrir mapa para elegir origen y destino"
                  onClick={() => {
                    setManualMapSectionOpen((v) => !v);
                    if (!manualMapSectionOpen) setMapSelectionTarget("origin");
                  }}
                >
                  <MapPinned className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{mapSectionVisible && !shouldUseManualRoute ? "Ocultar mapa" : "Mapa"}</span>
                </Button>
              </div>
            </div>
          </section>

          {mapSectionVisible ? (
            <section aria-label="Selección en mapa" className="space-y-3 rounded-lg border border-border/60 bg-background p-4 shadow-sm">
              {!shouldUseManualRoute ? (
                <p className="text-xs text-muted-foreground">
                  Opcional: si marcás origen y destino en el mapa, se usa esa traza en lugar de la plantilla de la ruta seleccionada.
                </p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Origen</Label>
                  <Input placeholder="Ej: Mendoza" value={manualRouteOrigin} onChange={(event) => setManualRouteOrigin(event.target.value)} required={shouldUseManualRoute || routingFromManualMapReady} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Destino</Label>
                  <Input placeholder="Ej: Córdoba" value={manualRouteDestination} onChange={(event) => setManualRouteDestination(event.target.value)} required={shouldUseManualRoute || routingFromManualMapReady} />
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border [&_.leaflet-container]:z-[0] [&_.leaflet-pane]:isolate">
                <MapContainer center={mapCenter} zoom={selectedZone?.zoom ?? 6} className="h-64 w-full" scrollWheelZoom>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  />
                  <ManualRouteMapEvents />
                  {manualOriginPoint ? (
                    <Marker position={manualOriginPoint} icon={tripManualOriginIcon} />
                  ) : null}
                  {manualDestinationPoint ? (
                    <Marker position={manualDestinationPoint} icon={tripManualDestIcon} />
                  ) : null}
                  {manualOriginPoint && manualDestinationPoint ? (
                    <Polyline positions={[manualOriginPoint, manualDestinationPoint]} pathOptions={{ color: "#2563eb", weight: 4 }} />
                  ) : null}
                </MapContainer>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setMapSelectionTarget("origin")}>
                  Seleccionar origen
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setMapSelectionTarget("destination")}>
                  Seleccionar destino
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearManualMap}>
                  Limpiar puntos
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Clic actual: {mapSelectionTarget === "origin" ? "marcá ORIGEN (azul)" : "marcá DESTINO (verde)"}.
                {manualOriginPoint ? ` Origen seleccionado: ${manualRouteOrigin || "punto marcado"}.` : ""}
                {manualDestinationPoint ? ` Destino seleccionado: ${manualRouteDestination || "punto marcado"}.` : ""}
              </p>
            </section>
          ) : null}

          <section aria-labelledby="trip-assign-client" className="space-y-3 rounded-lg border border-border/80 bg-muted/15 p-4">
            <h3 id="trip-assign-client" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Empresa / cliente y remito
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <Label>Empresa o cliente</Label>
                <Select
                  value={assignmentForm.clientCompanySelect}
                  onValueChange={(value: "SIDERSA" | "Acindar" | "CIPLAR" | "otra") =>
                    setAssignmentForm((prev) => ({ ...prev, clientCompanySelect: value }))
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent className="z-[1700]">
                    {PRINCIPAL_CLIENT_COMPANIES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    <SelectItem value="otra">Otra empresa o cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {assignmentForm.clientCompanySelect === "otra" ? (
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="trip-client-other">Nombre del cliente</Label>
                  <Input
                    id="trip-client-other"
                    className="h-10"
                    value={assignmentForm.clientCompanyOther}
                    onChange={(event) => setAssignmentForm((prev) => ({ ...prev, clientCompanyOther: event.target.value }))}
                    placeholder="Ej: Distribuidora regional"
                    required
                  />
                </div>
              ) : null}
              <div className="space-y-2 sm:col-span-2">
                {requiresRemitoInput ? (
                  <>
                    <Label htmlFor="trip-remito">Número de remito</Label>
                    <Input
                      id="trip-remito"
                      className="h-10 max-w-md"
                      value={assignmentForm.remitoNumber}
                      onChange={(event) => setAssignmentForm((prev) => ({ ...prev, remitoNumber: event.target.value }))}
                      placeholder="Ej: R-458821"
                      required
                    />
                  </>
                ) : resolvedClientPreview ? (
                  <p className="text-xs text-muted-foreground">
                    No hace falta remito: al guardar se asignará un código único generado por el sistema (prefijo SYS-).
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section aria-labelledby="trip-assign-detail" className="space-y-3">
            <h3 id="trip-assign-detail" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Programación y detalle
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  Fecha del viaje
                </Label>
                <Input
                  type="datetime-local"
                  className="h-10"
                  value={assignmentForm.scheduledAt}
                  onChange={(event) => setAssignmentForm((prev) => ({ ...prev, scheduledAt: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de carga</Label>
                <Input
                  className="h-10"
                  value={assignmentForm.cargo}
                  onChange={(event) => setAssignmentForm((prev) => ({ ...prev, cargo: event.target.value }))}
                  placeholder="Ej: Químicos industriales - 15 toneladas"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Condiciones de viaje</Label>
              <Textarea
                value={assignmentForm.plan}
                onChange={(event) => setAssignmentForm((prev) => ({ ...prev, plan: event.target.value }))}
                placeholder="Ventanas horarias, paradas, checklist de entrega..."
                className="min-h-[100px] resize-y"
                required
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
