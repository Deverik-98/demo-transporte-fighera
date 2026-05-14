import { FormEvent, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { useOperationsData, VehicleFleetKind, VehicleStatus, ZoneId } from "../../lib/operations-data";
import { FileUp, MessageSquare, Plus, Search, Trash2, Truck } from "lucide-react";
import { AssociatedDocumentsDialog } from "./associated-documents-dialog";
import { toast } from "sonner";

type VehicleDocDraft = {
  id: string;
  documentType: string;
  expiresAt: string;
  notes: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
};

export function VehiclesModule() {
  const {
    zones,
    vehicles,
    addVehicle,
    updateVehicleStatus,
    updateVehicleFleetKind,
    updateVehicleObservations,
    removeVehicle,
    documents,
    addDocument,
    vehicleDocumentTypes,
  } = useOperationsData();
  const defaultZoneId = zones[0]?.id ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "all">("all");
  const [fleetFilter, setFleetFilter] = useState<"all" | VehicleFleetKind>("all");
  const [form, setForm] = useState({
    plate: "",
    type: "Camión" as "Camión" | "Remolque",
    zoneId: defaultZoneId as ZoneId,
    brand: "",
    model: "",
    fleetKind: "Propio" as VehicleFleetKind,
    observations: "",
  });
  const [obsEdit, setObsEdit] = useState<{ vehicleId: string; plate: string; text: string } | null>(null);
  const [docsDraft, setDocsDraft] = useState<VehicleDocDraft[]>([
    {
      id: "draft-1",
      documentType: "VTV",
      expiresAt: "",
      notes: "",
      fileName: "",
      fileType: "",
      fileSizeKb: 0,
    },
  ]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.fleetKind === "Propio") {
      const hasCompleteDoc = docsDraft.some((draft) => draft.documentType && draft.expiresAt && draft.fileName);
      if (!hasCompleteDoc) {
        toast.error("Flota propia: indicá al menos un documento completo (tipo, vencimiento y adjunto).");
        return;
      }
    }
    const created = addVehicle(form);
    if (!created) return;
    docsDraft.forEach((draft) => {
      if (!draft.documentType || !draft.expiresAt || !draft.fileName) return;
      addDocument({
        entityType: "vehicle",
        entityId: created.id,
        documentType: draft.documentType,
        expiresAt: draft.expiresAt,
        notes: draft.notes,
        fileName: draft.fileName,
        fileType: draft.fileType || "application/octet-stream",
        fileSizeKb: draft.fileSizeKb || 1,
      });
    });
    setIsOpen(false);
    setForm((prev) => ({ ...prev, plate: "", brand: "", model: "", fleetKind: "Propio", observations: "" }));
    setDocsDraft([
      {
        id: "draft-1",
        documentType: "VTV",
        expiresAt: "",
        notes: "",
        fileName: "",
        fileType: "",
        fileSizeKb: 0,
      },
    ]);
  }

  function addDraftRow() {
    setDocsDraft((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        documentType: vehicleDocumentTypes[0],
        expiresAt: "",
        notes: "",
        fileName: "",
        fileType: "",
        fileSizeKb: 0,
      },
    ]);
  }

  function removeDraftRow(id: string) {
    setDocsDraft((prev) => (prev.length === 1 ? prev : prev.filter((doc) => doc.id !== id)));
  }

  function updateDraft(id: string, patch: Partial<VehicleDocDraft>) {
    setDocsDraft((prev) => prev.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)));
  }

  function onDraftFileChange(id: string, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Solo se permiten imágenes o PDF para documentos.");
      return;
    }
    updateDraft(id, {
      fileName: file.name,
      fileType: file.type,
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
    });
  }

  const filteredVehicles = useMemo(
    () =>
      vehicles.filter((vehicle) => {
        const query = search.trim().toLowerCase();
        const matchesQuery =
          !query ||
          vehicle.plate.toLowerCase().includes(query) ||
          `${vehicle.brand} ${vehicle.model}`.toLowerCase().includes(query) ||
          vehicle.observations.toLowerCase().includes(query);
        const matchesStatus = statusFilter === "all" ? true : vehicle.status === statusFilter;
        const matchesFleet = fleetFilter === "all" ? true : vehicle.fleetKind === fleetFilter;
        return matchesQuery && matchesStatus && matchesFleet;
      }),
    [vehicles, search, statusFilter, fleetFilter],
  );

  useEffect(() => {
    if (!defaultZoneId) return;
    if (form.zoneId) return;
    setForm((prev) => ({ ...prev, zoneId: defaultZoneId as ZoneId }));
  }, [defaultZoneId, form.zoneId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Gestión de Vehículos</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo vehículo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Alta de vehículo + documentación</DialogTitle>
            </DialogHeader>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Patente</Label>
                  <Input value={form.plate} onChange={(e) => setForm((prev) => ({ ...prev, plate: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(value: "Camión" | "Remolque") => setForm((prev) => ({ ...prev, type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Camión">Camión</SelectItem>
                      <SelectItem value="Remolque">Remolque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Zona</Label>
                  <Select value={form.zoneId} onValueChange={(value: ZoneId) => setForm((prev) => ({ ...prev, zoneId: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Titularidad</Label>
                  <Select
                    value={form.fleetKind}
                    onValueChange={(value: VehicleFleetKind) => setForm((prev) => ({ ...prev, fleetKind: value }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Propio">Propio (Transportes Fighera)</SelectItem>
                      <SelectItem value="Fletero">Fletero (terceros)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Marca</Label>
                  <Input value={form.brand} onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input value={form.model} onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observaciones (opcional)</Label>
                <Textarea
                  value={form.observations}
                  onChange={(e) => setForm((prev) => ({ ...prev, observations: e.target.value }))}
                  placeholder="Equipamiento, restricciones de carga, contacto de titular, etc."
                  className="min-h-[80px] resize-y"
                />
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p>Documentos iniciales del vehículo</p>
                    <p className="text-xs text-muted-foreground">
                      {form.fleetKind === "Propio"
                        ? "Obligatorio: al menos un documento con tipo, fecha de vencimiento y adjunto (VTV, seguro, etc.)."
                        : "Opcional para fleteros: podés guardar el vehículo sin documentación o cargarla si la tenés."}
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={addDraftRow}>
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar documento
                  </Button>
                </div>
                <div className="space-y-3">
                  {docsDraft.map((doc) => (
                    <div key={doc.id} className="rounded-md border p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Tipo</Label>
                          <Select value={doc.documentType} onValueChange={(value) => updateDraft(doc.id, { documentType: value })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {vehicleDocumentTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Vencimiento</Label>
                          <Input type="date" value={doc.expiresAt} onChange={(e) => updateDraft(doc.id, { expiresAt: e.target.value })} />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Adjunto (imagen o PDF)</Label>
                          <Input type="file" accept="image/*,.pdf" onChange={(e) => onDraftFileChange(doc.id, e.target.files?.[0] ?? null)} />
                          {doc.fileName ? (
                            <Badge variant="outline" className="mt-1">
                              <FileUp className="mr-1 h-3 w-3" />
                              {doc.fileName} ({doc.fileSizeKb} KB)
                            </Badge>
                          ) : null}
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Notas</Label>
                          <Textarea value={doc.notes} onChange={(e) => updateDraft(doc.id, { notes: e.target.value })} />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Button type="button" size="sm" variant="outline" onClick={() => removeDraftRow(doc.id)}>
                          <Trash2 className="mr-1 h-4 w-4" />
                          Quitar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="col-span-2">
                <Button type="submit">Guardar vehículo</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={obsEdit !== null} onOpenChange={(open) => !open && setObsEdit(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Observaciones — {obsEdit?.plate}</DialogTitle>
              <DialogDescription>Notas internas sobre la unidad; quedan guardadas en la flota.</DialogDescription>
            </DialogHeader>
            <Textarea
              value={obsEdit?.text ?? ""}
              onChange={(e) => setObsEdit((prev) => (prev ? { ...prev, text: e.target.value } : null))}
              placeholder="Detalle opcional del vehículo..."
              className="min-h-[120px] resize-y"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setObsEdit(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!obsEdit) return;
                  updateVehicleObservations(obsEdit.vehicleId, obsEdit.text);
                  setObsEdit(null);
                }}
              >
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por patente, marca, modelo u observaciones..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:w-[min(100%,720px)]">
              <Select value={statusFilter} onValueChange={(value: VehicleStatus | "all") => setStatusFilter(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="Mantenimiento">Mantenimiento</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fleetFilter} onValueChange={(value: "all" | VehicleFleetKind) => setFleetFilter(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda la titularidad</SelectItem>
                  <SelectItem value="Propio">Solo propios</SelectItem>
                  <SelectItem value="Fletero">Solo fleteros</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="sm:col-span-2 lg:col-span-1" onClick={() => { setSearch(""); setStatusFilter("all"); setFleetFilter("all"); }}>
                Limpiar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Flota registrada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left">Patente</th>
                  <th className="p-3 text-left">Tipo</th>
                  <th className="p-3 text-left">Titularidad</th>
                  <th className="p-3 text-left">Marca/Modelo</th>
                  <th className="p-3 text-left">Zona</th>
                  <th className="p-3 text-left">Observaciones</th>
                  <th className="p-3 text-left">Estado</th>
                  <th className="p-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-b border-border">
                    <td className="p-3">{vehicle.plate}</td>
                    <td className="p-3">{vehicle.type}</td>
                    <td className="p-3">
                      <Select
                        value={vehicle.fleetKind}
                        onValueChange={(value: VehicleFleetKind) => updateVehicleFleetKind(vehicle.id, value)}
                      >
                        <SelectTrigger className="h-10 w-[200px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Propio">Propio</SelectItem>
                          <SelectItem value="Fletero">Fletero</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">{vehicle.brand} {vehicle.model}</td>
                    <td className="p-3">{zones.find((zone) => zone.id === vehicle.zoneId)?.name}</td>
                    <td className="p-3 max-w-[220px]">
                      <p className="truncate text-sm text-muted-foreground" title={vehicle.observations || undefined}>
                        {vehicle.observations || "—"}
                      </p>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto gap-1 p-0 text-xs"
                        onClick={() =>
                          setObsEdit({ vehicleId: vehicle.id, plate: vehicle.plate, text: vehicle.observations })
                        }
                      >
                        <MessageSquare className="h-3 w-3" />
                        Editar
                      </Button>
                    </td>
                    <td className="p-3">
                      <Select value={vehicle.status} onValueChange={(value: VehicleStatus) => updateVehicleStatus(vehicle.id, value)}>
                        <SelectTrigger className="h-10 w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Activo">Activo</SelectItem>
                          <SelectItem value="Mantenimiento">Mantenimiento</SelectItem>
                          <SelectItem value="Inactivo">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <AssociatedDocumentsDialog
                          entityType="vehicle"
                          entityId={vehicle.id}
                          title={`Documentos de ${vehicle.plate}`}
                        />
                        <Badge variant="outline" className="h-8 px-2 flex items-center">
                          {documents.filter((doc) => doc.entityType === "vehicle" && doc.entityId === vehicle.id).length} docs
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => removeVehicle(vehicle.id)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

