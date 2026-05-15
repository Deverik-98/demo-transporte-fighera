import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Play } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { useOperationsData, ZoneId } from "../../lib/operations-data";
import { getPrincipalLoadPlanMaxLength, isPrincipalClientCompany, isValidPrincipalLoadPlan, normalizePrincipalLoadPlanValue } from "../../lib/trip-clients";

type TripImportModalProps = {
  buttonClassName?: string;
  onTripsImported?: (detail: { tripIds: string[]; zoneIds: ZoneId[] }) => void;
};

type ImportTripRow = {
  zoneId: ZoneId;
  zone: string;
  clientCompany: string;
  /** Plan de carga (solo dígitos) si empresa_cliente es SIDERSA, Acindar o CIPLAR. */
  remito?: string;
  origin: string;
  destination: string;
  cargo: string;
  scheduledAt: string;
  plan: string;
};

const MIN_REQUIRED_COLUMNS = ["empresa_cliente", "zona", "origen", "destino", "carga", "fecha_hora_programada"];

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildMockRows(
  zones: Array<{ id: ZoneId; name: string }>,
  routeTemplates: Array<{ zoneId: ZoneId; origin: string; destination: string }>,
): ImportTripRow[] {
  const now = Date.now();
  const base = routeTemplates.slice(0, 6).map((route, idx) => {
    const zone = zones.find((item) => item.id === route.zoneId);
    if (!zone) return null;
    const principals = ["SIDERSA", "Acindar", "CIPLAR"] as const;
    const clientCompany = principals[idx % principals.length];
    const maxLen = getPrincipalLoadPlanMaxLength(clientCompany) ?? 7;
    const remito =
      maxLen === 7
        ? `A${String(100000 + idx * 137).slice(-6)}`
        : `AB${String(100000 + idx * 137).slice(-6)}`;
    return {
      zoneId: zone.id,
      zone: zone.name,
      clientCompany,
      remito,
      origin: route.origin,
      destination: route.destination,
      cargo: `Carga consolidada ${idx + 1} - ${8 + idx} toneladas`,
      scheduledAt: new Date(now + (idx + 1) * 90 * 60 * 1000).toISOString().slice(0, 16),
      plan: `Asignacion automatica por lote ${idx + 1}.`,
    } satisfies ImportTripRow;
  }).filter(Boolean) as ImportTripRow[];

  if (base.length >= 4) return base;

  return zones.slice(0, 4).map((zone, idx) => ({
    zoneId: zone.id,
    zone: zone.name,
    clientCompany: idx % 2 === 0 ? "SIDERSA" : "Cliente masivo demo",
    remito: idx % 2 === 0 ? "A123456" : undefined,
    origin: `${zone.name} Centro`,
    destination: `${zone.name} Norte`,
    cargo: `Carga estandar ${idx + 1} - ${10 + idx} toneladas`,
    scheduledAt: new Date(now + (idx + 1) * 2 * 60 * 60 * 1000).toISOString().slice(0, 16),
    plan: "Ruta sugerida por importacion masiva.",
  }));
}

function buildFallbackPath(center: [number, number]) {
  const [lat, lng] = center;
  return [
    [lat - 0.08, lng - 0.12],
    [lat + 0.12, lng + 0.16],
  ] as [number, number][];
}

export function TripImportModal({ buttonClassName, onTripsImported }: TripImportModalProps) {
  const { zones, drivers, vehicles, routeTemplates, addTrip } = useOperationsData();
  const [open, setOpen] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [loadedRows, setLoadedRows] = useState<ImportTripRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [simulatingFormat, setSimulatingFormat] = useState<null | "excel" | "csv">(null);

  const columnPreview = useMemo(
    () => ["archivo", ...MIN_REQUIRED_COLUMNS, "plan_viaje", "plan_carga"],
    [],
  );

  const rowsByZone = useMemo(() => {
    const byZone = new Map<ZoneId, ImportTripRow[]>();
    for (const row of loadedRows) {
      const current = byZone.get(row.zoneId) ?? [];
      current.push(row);
      byZone.set(row.zoneId, current);
    }
    return byZone;
  }, [loadedRows]);

  function handleDialogOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelectedFileName("");
      setLoadedRows([]);
      setIsProcessing(false);
      setSimulatingFormat(null);
    }
  }

  async function simulateFileLoad(kind: "excel" | "csv") {
    if (simulatingFormat) return;
    const fileName =
      kind === "excel" ? "viajes_programacion_lote.xlsx" : "viajes_programacion_lote.csv";
    setSimulatingFormat(kind);
    setLoadedRows([]);
    setSelectedFileName("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 750));
      const rows = buildMockRows(
        zones.map((z) => ({ id: z.id, name: z.name })),
        routeTemplates.map((r) => ({ zoneId: r.zoneId, origin: r.origin, destination: r.destination })),
      );
      setSelectedFileName(fileName);
      setLoadedRows(rows);
      toast.success(kind === "excel" ? "Excel simulado cargado" : "CSV simulado cargado", {
        description: `${rows.length} registros listos para importar.`,
      });
    } finally {
      setSimulatingFormat(null);
    }
  }

  function processImport() {
    if (!loadedRows.length) {
      toast.error("Primero cargá el archivo para previsualizar los viajes.");
      return;
    }
    const availableTrucks = vehicles.filter((vehicle) => vehicle.type === "Camión" && vehicle.status !== "Inactivo");
    if (!drivers.length || !availableTrucks.length) {
      toast.error("Se requieren choferes y camiones activos para importar viajes.");
      return;
    }

    setIsProcessing(true);
    const cursorByZone = new Map<string, number>();
    const createdTripIds: string[] = [];
    const usedZones = new Set<ZoneId>();
    let skipped = 0;

    for (const row of loadedRows) {
      const zone = zones.find((item) => item.id === row.zoneId);
      if (!zone) {
        skipped += 1;
        continue;
      }
      const zoneDrivers = drivers.filter((driver) => driver.zoneId === zone.id);
      const zoneVehicles = availableTrucks.filter((vehicle) => vehicle.zoneId === zone.id);
      const driverPool = zoneDrivers.length ? zoneDrivers : drivers;
      const vehiclePool = zoneVehicles.length ? zoneVehicles : availableTrucks;
      if (!driverPool.length || !vehiclePool.length) {
        skipped += 1;
        continue;
      }

      const idx = cursorByZone.get(zone.id) ?? 0;
      const driver = driverPool[idx % driverPool.length];
      const vehicle = vehiclePool[idx % vehiclePool.length];
      cursorByZone.set(zone.id, idx + 1);

      const route = routeTemplates.find(
        (tpl) =>
          tpl.zoneId === zone.id &&
          normalizeKey(tpl.origin) === normalizeKey(row.origin) &&
          normalizeKey(tpl.destination) === normalizeKey(row.destination),
      );

      const clientCompany = row.clientCompany.trim();
      if (!clientCompany) {
        skipped += 1;
        continue;
      }
      const rowRemitoRaw = row.remito?.trim();
      let remitoForAdd: string | undefined;
      if (isPrincipalClientCompany(clientCompany)) {
        const max = getPrincipalLoadPlanMaxLength(clientCompany) ?? 8;
        const normalized = normalizePrincipalLoadPlanValue(rowRemitoRaw ?? "", max);
        if (!isValidPrincipalLoadPlan(clientCompany, normalized)) {
          skipped += 1;
          continue;
        }
        remitoForAdd = normalized;
      } else {
        remitoForAdd = undefined;
      }

      const created = addTrip({
        zoneId: zone.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        routeId: route?.id,
        routeStops: [row.origin.trim(), row.destination.trim()].filter(Boolean),
        manualRoute: route
          ? undefined
          : {
              path: buildFallbackPath(zone.mapCenter),
            },
        cargo: row.cargo,
        plan: row.plan,
        scheduledAt: row.scheduledAt,
        clientCompany,
        remitoNumber: remitoForAdd,
      });

      if (!created) {
        skipped += 1;
        continue;
      }
      usedZones.add(zone.id);
      createdTripIds.push(created.id);
    }

    setIsProcessing(false);
    if (!createdTripIds.length) {
      toast.error("No se pudo importar ningún viaje con el archivo actual.");
      return;
    }

    toast.success(`Importación completada: ${createdTripIds.length} viajes`, {
      description: skipped ? `${skipped} registros fueron omitidos por datos incompletos.` : "Todos los registros fueron procesados.",
    });
    onTripsImported?.({ tripIds: createdTripIds, zoneIds: [...usedZones] });
    handleDialogOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className={cn("gap-2", buttonClassName)}>
          <FileSpreadsheet className="h-4 w-4" />
          Importar viajes
        </Button>
      </DialogTrigger>
      <DialogContent className="z-[1600] max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importación masiva de viajes</DialogTitle>
          <DialogDescription>
            Demo sin archivo real: simulá una carga Excel o CSV, revisá la vista previa y programá viajes automáticamente con la data centralizada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="rounded-lg border bg-muted/20 p-4">
            <div className="space-y-3">
              <div>
                <Label className="text-foreground">Simular origen del archivo</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  No se sube ningún archivo real al navegador; solo se replica el flujo de una importación Excel o CSV.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={simulatingFormat !== null}
                  onClick={() => simulateFileLoad("excel")}
                >
                  {simulatingFormat === "excel" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  Simular Excel (.xlsx)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={simulatingFormat !== null}
                  onClick={() => simulateFileLoad("csv")}
                >
                  {simulatingFormat === "csv" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  Simular CSV (.csv)
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Columnas mínimas:</span>
              {MIN_REQUIRED_COLUMNS.map((column) => (
                <Badge key={column} variant="secondary">{column}</Badge>
              ))}
            </div>
            {selectedFileName ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Archivo simulado: <span className="font-medium text-foreground">{selectedFileName}</span>
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Vista previa del Excel a importar</Label>
              <Badge variant={loadedRows.length ? "success" : "outline"}>
                {loadedRows.length ? `${loadedRows.length} registros` : "Sin carga"}
              </Badge>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="border-b px-3 py-2 text-left font-medium">#</th>
                      {columnPreview.map((column) => (
                        <th key={column} className="border-b px-3 py-2 text-left font-medium uppercase tracking-wide text-xs">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadedRows.length ? (
                      loadedRows.map((row, idx) => (
                        <tr key={`${row.zoneId}-${idx}`} className="odd:bg-background even:bg-muted/20">
                          <td className="border-b px-3 py-2">{idx + 1}</td>
                          <td className="border-b px-3 py-2">{selectedFileName || "viajes_importacion.xlsx"}</td>
                          <td className="border-b px-3 py-2">{row.clientCompany}</td>
                          <td className="border-b px-3 py-2">{row.zone}</td>
                          <td className="border-b px-3 py-2">{row.origin}</td>
                          <td className="border-b px-3 py-2">{row.destination}</td>
                          <td className="border-b px-3 py-2">{row.cargo}</td>
                          <td className="border-b px-3 py-2">{row.scheduledAt.replace("T", " ")}</td>
                          <td className="border-b px-3 py-2">{row.plan}</td>
                          <td className="border-b px-3 py-2 text-muted-foreground">{row.remito ?? "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-8 text-center text-muted-foreground" colSpan={columnPreview.length + 1}>
                          Elegí <span className="font-medium text-foreground">Simular Excel</span> o{" "}
                          <span className="font-medium text-foreground">Simular CSV</span> para visualizar el mockup.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {loadedRows.length ? (
            <section className="rounded-lg border border-dashed bg-background p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Distribución automática:</span>{" "}
              se asignará cada viaje al siguiente chofer/camión disponible por zona para balancear la operación.
              {rowsByZone.size ? ` Zonas detectadas: ${rowsByZone.size}.` : ""}
            </section>
          ) : null}
        </div>

        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={processImport} disabled={!loadedRows.length || isProcessing || simulatingFormat !== null}>
            <Play className="mr-2 h-4 w-4" />
            {isProcessing ? "Procesando..." : "Procesar importación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
