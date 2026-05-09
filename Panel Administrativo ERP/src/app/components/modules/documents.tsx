import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useOperationsData, DocumentEntityType } from "../../lib/operations-data";
import { FileText, Plus, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function DocumentsModule() {
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
      trips
        .filter((trip) => (trip.evidencias ?? []).some((ev) => ev.tipo.includes("remito")))
        .map((trip) => ({
          tripId: trip.id,
          driver: trip.driver,
          route: `${trip.origin} → ${trip.destination}`,
          status: trip.status,
          remitos: (trip.evidencias ?? []).filter((ev) => ev.tipo.includes("remito")),
        })),
    [trips],
  );
  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => (statusFilter === "all" ? true : invoice.status === statusFilter)),
    [invoices, statusFilter],
  );

  function handleTripDocumentAction(tripId: string) {
    toast.message(`Gestionar documentos del viaje ${tripId}`, {
      description: "Utiliza esta acción para continuar con la gestión documental del viaje en este módulo.",
    });
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
        {activeTab === "trip" ? null : activeTab === "payroll" ? (
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
              <div className="grid grid-cols-2 gap-4">
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
            }}
            className="space-y-4"
          >
            <TabsList className="grid w-full max-w-3xl grid-cols-4">
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 text-left">Viaje</th>
                      <th className="p-3 text-left">Ruta</th>
                      <th className="p-3 text-left">Chofer</th>
                      <th className="p-3 text-left">Estado</th>
                      <th className="p-3 text-left">Remitos adjuntos</th>
                      <th className="p-3 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripDocs.length === 0 ? (
                      <tr>
                        <td className="p-3 text-sm text-muted-foreground" colSpan={6}>
                          No hay viajes con remitos adjuntos.
                        </td>
                      </tr>
                    ) : (
                      tripDocs.map((trip) => (
                        <tr key={trip.tripId} className="border-b border-border">
                          <td className="p-3">{trip.tripId}</td>
                          <td className="p-3">{trip.route}</td>
                          <td className="p-3">{trip.driver}</td>
                          <td className="p-3"><Badge variant="outline">{trip.status}</Badge></td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {trip.remitos.map((remito, idx) => (
                                <Badge key={`${trip.tripId}-${remito.nombre}-${idx}`} variant="secondary">
                                  {remito.tipo}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="p-3">
                            <Button size="sm" variant="outline" onClick={() => handleTripDocumentAction(trip.tripId)}>
                              Gestionar
                            </Button>
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

