import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useOperationsData, DocumentEntityType, TripDocumentType } from "../../lib/operations-data";
import { formatTripRouteStops } from "../../lib/trip-route";
import { FileText, Pencil, Plus, Trash2, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";

type DocumentsModuleProps = {
  focusTripId?: string | null;
  onFocusTripConsumed?: () => void;
};

export function DocumentsModule({ focusTripId, onFocusTripConsumed }: DocumentsModuleProps) {
  const {
    users,
    vehicles,
    documents,
    addDocument,
    removeDocument,
    trips,
    invoices,
    addInvoice,
    markInvoiceSigned,
    userDocumentTypesByRole,
    vehicleDocumentTypes,
    tripDocumentTypes,
    addTripDocument,
    updateTripDocument,
    removeTripDocument,
  } = useOperationsData();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"vehicle" | "user" | "trip" | "payroll">("vehicle");
  const [statusFilter, setStatusFilter] = useState<"all" | "Cargada" | "Firmada">("all");
  const [isPayrollOpen, setIsPayrollOpen] = useState(false);
  const [payrollForm, setPayrollForm] = useState({
    driverId: "",
    fileName: "",
    fileType: "",
    fileSizeKb: 0,
  });
  const [form, setForm] = useState({
    entityType: "vehicle" as DocumentEntityType,
    entityId: "",
    documentType: "",
    expiresAt: "",
    notes: "",
    fileName: "",
    fileType: "",
    fileSizeKb: 0,
  });
  const [isAutofillApplied, setIsAutofillApplied] = useState(false);
  const [tripDocDialogOpen, setTripDocDialogOpen] = useState(false);
  const [newTripDoc, setNewTripDoc] = useState({
    tripId: "",
    type: "Remito" as TripDocumentType,
    name: "",
    url: "",
  });
  const [tripFilterTripId, setTripFilterTripId] = useState<string>("all");
  const [editingTripDoc, setEditingTripDoc] = useState<{ tripId: string; docId: string } | null>(null);

  const userOwners = users.filter((user) => user.role === "Chofer");
  const drivers = users.filter((user) => user.role === "Chofer" && user.status === "Activo");
  const availableOwners = activeTab === "user" ? userOwners : vehicles;
  const selectedUser = users.find((user) => user.id === form.entityId);
  const availableDocTypes =
    activeTab === "user"
      ? selectedUser
        ? userDocumentTypesByRole[selectedUser.role]
        : userDocumentTypesByRole.Chofer
      : vehicleDocumentTypes;

  const vehicleDocs = useMemo(() => documents.filter((doc) => doc.entityType === "vehicle"), [documents]);
  const userDocs = useMemo(() => documents.filter((doc) => doc.entityType === "user"), [documents]);
  const tripDocs = useMemo(
    () =>
      trips.flatMap((trip) =>
        (trip.evidencias ?? []).map((doc) => ({
          tripId: trip.id,
          docId: doc.id,
          driver: trip.driver,
          route: formatTripRouteStops(trip.routeStops, trip.origin, trip.destination),
          status: trip.status,
          type: (doc.type ?? doc.tipo ?? "Otro") as TripDocumentType,
          name: doc.name ?? doc.nombre ?? "documento",
          date: doc.date ?? doc.fecha ?? "",
          uploadedBy: doc.uploadedBy ?? (doc.source === "chofer" ? "chofer" : "admin"),
        })),
      ),
    [trips],
  );
  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => (statusFilter === "all" ? true : invoice.status === statusFilter)),
    [invoices, statusFilter],
  );
  const filteredTripDocs = useMemo(
    () => (tripFilterTripId === "all" ? tripDocs : tripDocs.filter((row) => row.tripId === tripFilterTripId)),
    [tripDocs, tripFilterTripId],
  );

  useEffect(() => {
    if (!focusTripId) return;
    setActiveTab("trip");
    setTripFilterTripId(focusTripId);
    setNewTripDoc((prev) => ({ ...prev, tripId: focusTripId }));
    onFocusTripConsumed?.();
  }, [focusTripId, onFocusTripConsumed]);

  function handleTripDocumentAction() {
    if (!newTripDoc.tripId || !newTripDoc.name.trim()) {
      toast.error("Seleccioná viaje y nombre de documento.");
      return;
    }
    const ok = addTripDocument(newTripDoc.tripId, {
      type: newTripDoc.type,
      name: newTripDoc.name.trim(),
      url: newTripDoc.url.trim() || undefined,
      uploadedBy: "admin",
    });
    if (!ok) return;
    setTripDocDialogOpen(false);
    setNewTripDoc({ tripId: "", type: "Remito", name: "", url: "" });
  }

  function openEditTripDocument(tripId: string, docId: string) {
    const trip = trips.find((t) => t.id === tripId);
    const doc = trip?.evidencias?.find((d) => d.id === docId);
    if (!doc) return;
    setEditingTripDoc({ tripId, docId });
    setNewTripDoc({
      tripId,
      type: (doc.type ?? doc.tipo ?? "Otro") as TripDocumentType,
      name: doc.name ?? doc.nombre ?? "",
      url: doc.url ?? "",
    });
  }

  function saveEditTripDocument() {
    if (!editingTripDoc || !newTripDoc.name.trim()) return;
    const ok = updateTripDocument(editingTripDoc.tripId, editingTripDoc.docId, {
      type: newTripDoc.type,
      name: newTripDoc.name.trim(),
      url: newTripDoc.url.trim() || undefined,
      uploadedBy: "admin",
    });
    if (!ok) return;
    setEditingTripDoc(null);
    setNewTripDoc({ tripId: "", type: "Remito", name: "", url: "" });
  }

  function deleteTripDocument(tripId: string, docId: string) {
    removeTripDocument(tripId, docId);
  }

  function detectDocumentType(fileName: string, entityType: DocumentEntityType, role?: string) {
    const normalized = fileName.toLowerCase();
    const userTypes = role ? userDocumentTypesByRole[role as keyof typeof userDocumentTypesByRole] ?? [] : [];
    const candidateTypes = entityType === "user" ? userTypes : vehicleDocumentTypes;
    const found = candidateTypes.find((type) => normalized.includes(type.toLowerCase().split(" ")[0]));
    if (found) return found;
    if (normalized.includes("licencia")) return "Licencia de Conducir";
    if (normalized.includes("psicofisico")) return "Psicofísico";
    if (normalized.includes("seguro")) return entityType === "vehicle" ? "Seguro del Vehículo" : "Seguro Personal";
    if (normalized.includes("vtv")) return "VTV";
    return "";
  }

  function detectExpiryDate(fileName: string) {
    const normalized = fileName.replace(/[^0-9]/g, "");
    if (normalized.length >= 8) {
      const year = normalized.slice(0, 4);
      const month = normalized.slice(4, 6);
      const day = normalized.slice(6, 8);
      if (Number(year) > 2020 && Number(month) <= 12 && Number(day) <= 31) {
        return `${year}-${month}-${day}`;
      }
    }
    return "";
  }

  function detectOwner(fileName: string, entityType: DocumentEntityType) {
    const normalized = fileName.toLowerCase();
    const owners = entityType === "user" ? userOwners : vehicles;
    return owners.find((owner: any) => normalized.includes((entityType === "user" ? owner.name : owner.plate).toLowerCase().split(" ")[0]))?.id ?? "";
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Solo se permiten imágenes o PDF.");
      return;
    }

    const ownerId = detectOwner(file.name, activeTab);
    const ownerRole =
      activeTab === "user"
        ? users.find((user) => user.id === ownerId)?.role ?? users.find((user) => user.id === form.entityId)?.role
        : undefined;
    const documentType = detectDocumentType(file.name, activeTab, ownerRole);
    const expiresAt = detectExpiryDate(file.name);

    setForm((prev) => ({
      ...prev,
      entityType: activeTab,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
      entityId: ownerId || prev.entityId,
      documentType: documentType || prev.documentType,
      expiresAt: expiresAt || prev.expiresAt,
      notes: prev.notes || "Autocompletado inicial desde nombre/metadatos del archivo. Validar antes de guardar.",
    }));
    setIsAutofillApplied(true);
    toast.success("Archivo cargado. Se aplicó autocompletado simulado.");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.fileName) {
      toast.error("Adjunta una imagen o PDF del documento.");
      return;
    }
    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === form.entityId);
    const fleteroDocOpcional = activeTab === "vehicle" && selectedVehicle?.fleetKind === "Fletero";
    if (!fleteroDocOpcional && !form.expiresAt?.trim()) {
      toast.error("Indicá la fecha de vencimiento del documento.");
      return;
    }
    const created = addDocument(form);
    if (!created) return;
    setIsOpen(false);
    setForm((prev) => ({
      ...prev,
      entityId: "",
      documentType: "",
      expiresAt: "",
      notes: "",
      fileName: "",
      fileType: "",
      fileSizeKb: 0,
    }));
    setIsAutofillApplied(false);
  }

  function handlePayrollFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      toast.error("El recibo debe ser PDF o imagen.");
      return;
    }
    setPayrollForm((prev) => ({
      ...prev,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
    }));
  }

  function handlePayrollSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const autoPeriod = new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    const created = addInvoice({
      driverId: payrollForm.driverId,
      period: autoPeriod,
      amount: 0,
      fileName: payrollForm.fileName,
      fileType: payrollForm.fileType,
      fileSizeKb: payrollForm.fileSizeKb,
    });
    if (!created) {
      toast.error("Completa chofer y adjunto para cargar el recibo.");
      return;
    }
    setIsPayrollOpen(false);
    setPayrollForm({
      driverId: "",
      fileName: "",
      fileType: "",
      fileSizeKb: 0,
    });
  }

  function ownerLabel(entityType: DocumentEntityType, entityId: string) {
    if (entityType === "user") {
      return users.find((user) => user.id === entityId)?.name ?? "Usuario";
    }
    return vehicles.find((vehicle) => vehicle.id === entityId)?.plate ?? "Vehículo";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Gestión de Documentos</h1>
        {activeTab === "trip" ? (
          <Button onClick={() => setTripDocDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Subir documento del viaje
          </Button>
        ) : activeTab === "payroll" ? (
          <Button onClick={() => setIsPayrollOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Cargar documento
          </Button>
        ) : (
          <Dialog
            open={isOpen}
            onOpenChange={(open) => {
              setIsOpen(open);
              if (open) {
                setForm((prev) => ({ ...prev, entityType: activeTab === "user" ? "user" : "vehicle" }));
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Cargar documento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Alta de documento</DialogTitle>
              </DialogHeader>
              <form className="grid gap-4" onSubmit={handleSubmit}>
              <div className="space-y-2 rounded-lg border border-dashed p-4">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Cargar imagen o PDF
                </Label>
                <Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} />
                <p className="text-xs text-muted-foreground">
                  Simulación de lectura de metadatos/OCR: intenta detectar entidad, tipo documental y vencimiento.
                </p>
                {form.fileName ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{form.fileName}</Badge>
                    <Badge variant="secondary">{form.fileSizeKb} KB</Badge>
                    <Badge variant="secondary">{form.fileType}</Badge>
                    {isAutofillApplied && (
                      <Badge variant="warning" className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Datos autocompletados (revisar)
                      </Badge>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>{activeTab === "vehicle" ? "Vehículo asociado" : "Chofer asociado"}</Label>
                <Select value={form.entityId} onValueChange={(value) => setForm((prev) => ({ ...prev, entityId: value, documentType: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {availableOwners.map((owner: any) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {activeTab === "user" ? owner.name : owner.plate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo de documento</Label>
                  <Select value={form.documentType} onValueChange={(value) => setForm((prev) => ({ ...prev, documentType: value }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                    <SelectContent>
                      {availableDocTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    Vencimiento
                    {activeTab === "vehicle" && vehicles.find((v) => v.id === form.entityId)?.fleetKind === "Fletero"
                      ? " (opcional, fletero)"
                      : null}
                  </Label>
                  <Input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                    required={
                      !(activeTab === "vehicle" && vehicles.find((v) => v.id === form.entityId)?.fleetKind === "Fletero")
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observaciones</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>
                <DialogFooter>
                  <Button type="submit">Guardar documento</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Repositorio documental
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const tab = value as "vehicle" | "user" | "trip" | "payroll";
              setActiveTab(tab);
              setForm((prev) => ({ ...prev, entityType: tab === "user" ? "user" : "vehicle", entityId: "", documentType: "" }));
              if (tab !== "trip") setTripFilterTripId("all");
            }}
            className="space-y-4"
          >
            <TabsList className="grid w-full max-w-3xl grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="vehicle">Vehículos</TabsTrigger>
              <TabsTrigger value="user">Choferes</TabsTrigger>
              <TabsTrigger value="trip">Viajes</TabsTrigger>
              <TabsTrigger value="payroll">Recibos de pago</TabsTrigger>
            </TabsList>

            {[
              { key: "vehicle", data: vehicleDocs, ownerLabelText: "Vehículo" },
              { key: "user", data: userDocs, ownerLabelText: "Chofer" },
            ].map((tab) => (
              <TabsContent key={tab.key} value={tab.key} className="mt-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-3 text-left">{tab.ownerLabelText}</th>
                        <th className="p-3 text-left">Documento</th>
                        <th className="p-3 text-left">Vencimiento</th>
                        <th className="p-3 text-left">Estado</th>
                        <th className="p-3 text-left">Adjunto</th>
                        <th className="p-3 text-left">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tab.data.map((doc) => (
                        <tr key={doc.id} className="border-b border-border">
                          <td className="p-3">{ownerLabel(doc.entityType, doc.entityId)}</td>
                          <td className="p-3">{doc.documentType}</td>
                          <td className="p-3">{new Date(doc.expiresAt).toLocaleDateString("es-AR")}</td>
                          <td className="p-3">
                            <Badge variant={doc.status === "Vigente" ? "success" : doc.status === "Próximo a vencer" ? "warning" : "destructive"}>
                              {doc.status}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1 text-xs">
                              <span className="text-muted-foreground">{doc.fileName}</span>
                              <span className="text-muted-foreground">{doc.fileSizeKb} KB · {doc.fileType}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <Button size="sm" variant="outline" onClick={() => removeDocument(doc.id)}>
                              Eliminar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            ))}

            <TabsContent value="trip" className="mt-0">
              <Dialog
                open={tripDocDialogOpen}
                onOpenChange={(open) => {
                  setTripDocDialogOpen(open);
                  if (!open) setEditingTripDoc(null);
                }}
              >
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Subir documento de viaje</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div className="space-y-1">
                      <Label>Viaje</Label>
                      <Select value={newTripDoc.tripId} onValueChange={(value) => setNewTripDoc((prev) => ({ ...prev, tripId: value }))}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar viaje" /></SelectTrigger>
                        <SelectContent>
                          {trips.map((trip) => (
                            <SelectItem key={trip.id} value={trip.id}>{trip.id} · {trip.driver}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Select value={newTripDoc.type} onValueChange={(value) => setNewTripDoc((prev) => ({ ...prev, type: value as TripDocumentType }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {tripDocumentTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Nombre</Label>
                      <Input value={newTripDoc.name} onChange={(e) => setNewTripDoc((prev) => ({ ...prev, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>URL simulada (opcional)</Label>
                      <Input value={newTripDoc.url} onChange={(e) => setNewTripDoc((prev) => ({ ...prev, url: e.target.value }))} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setTripDocDialogOpen(false)}>Cancelar</Button>
                    <Button type="button" onClick={editingTripDoc ? saveEditTripDocument : handleTripDocumentAction}>
                      {editingTripDoc ? "Guardar cambios" : "Subir documento"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">Filtrar por viaje</Label>
                <Select value={tripFilterTripId} onValueChange={(value) => setTripFilterTripId(value)}>
                  <SelectTrigger className="w-full sm:w-[320px]">
                    <SelectValue placeholder="Todos los viajes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los viajes</SelectItem>
                    {trips.map((trip) => (
                      <SelectItem key={`trip-filter-${trip.id}`} value={trip.id}>
                        {trip.id} · {trip.driver}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tripFilterTripId !== "all" ? (
                  <Button size="sm" variant="outline" onClick={() => setTripFilterTripId("all")}>
                    Limpiar filtro
                  </Button>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 text-left">Viaje</th>
                      <th className="p-3 text-left">Ruta</th>
                      <th className="p-3 text-left">Chofer</th>
                      <th className="p-3 text-left">Estado</th>
                      <th className="p-3 text-left">Tipo</th>
                      <th className="p-3 text-left">Documento</th>
                      <th className="p-3 text-left">Fecha</th>
                      <th className="p-3 text-left">Origen</th>
                      <th className="p-3 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTripDocs.length === 0 ? (
                      <tr>
                        <td className="p-3 text-sm text-muted-foreground" colSpan={9}>
                          No hay documentos para el filtro seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredTripDocs.map((row) => (
                        <tr key={`${row.tripId}-${row.docId}`} className="border-b border-border">
                          <td className="p-3">{row.tripId}</td>
                          <td className="p-3">{row.route}</td>
                          <td className="p-3">{row.driver}</td>
                          <td className="p-3"><Badge variant="outline">{row.status}</Badge></td>
                          <td className="p-3"><Badge variant="secondary">{row.type}</Badge></td>
                          <td className="p-3 text-sm">{row.name}</td>
                          <td className="p-3 text-xs text-muted-foreground">{row.date}</td>
                          <td className="p-3">
                            <Badge variant={row.uploadedBy === "chofer" ? "default" : "outline"}>
                              {row.uploadedBy === "chofer" ? "Chofer" : "Admin"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  openEditTripDocument(row.tripId, row.docId);
                                  setTripDocDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => deleteTripDocument(row.tripId, row.docId)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="payroll" className="mt-0">
              <Dialog open={isPayrollOpen} onOpenChange={setIsPayrollOpen}>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Nuevo recibo de pago para chofer</DialogTitle>
                  </DialogHeader>
                  <form className="grid gap-4" onSubmit={handlePayrollSubmit}>
                    <div className="space-y-2">
                      <Label>Chofer</Label>
                      <Select value={payrollForm.driverId} onValueChange={(value) => setPayrollForm((prev) => ({ ...prev, driverId: value }))}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar chofer" /></SelectTrigger>
                        <SelectContent>
                          {drivers.map((driver) => (
                            <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 rounded-lg border border-dashed p-4">
                      <Label className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Adjuntar recibo (PDF/imagen)
                      </Label>
                      <Input type="file" accept="application/pdf,image/*" onChange={handlePayrollFileUpload} />
                      {payrollForm.fileName ? (
                        <Badge variant="outline">{payrollForm.fileName} · {payrollForm.fileSizeKb} KB</Badge>
                      ) : null}
                    </div>
                    <DialogFooter>
                      <Button type="submit">Guardar y asignar</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 text-left">ID</th>
                      <th className="p-3 text-left">Chofer</th>
                      <th className="p-3 text-left">Periodo</th>
                      <th className="p-3 text-left">Monto</th>
                      <th className="p-3 text-left">Adjunto</th>
                      <th className="p-3 text-left">Estado</th>
                      <th className="p-3 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-border">
                        <td className="p-3">{invoice.id}</td>
                        <td className="p-3">{invoice.driverName}</td>
                        <td className="p-3">{invoice.period}</td>
                        <td className="p-3">${invoice.amount.toLocaleString("es-AR")}</td>
                        <td className="p-3 text-xs text-muted-foreground">{invoice.fileName}</td>
                        <td className="p-3">
                          <Badge variant={invoice.status === "Firmada" ? "success" : "warning"}>
                            {invoice.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={invoice.status === "Firmada"}
                            onClick={() => markInvoiceSigned(invoice.id)}
                          >
                            Marcar firmado
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

