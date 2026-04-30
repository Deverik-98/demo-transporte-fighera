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
    userDocumentTypesByRole,
    vehicleDocumentTypes,
  } = useOperationsData();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DocumentEntityType>("vehicle");
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
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (open) {
              setForm((prev) => ({ ...prev, entityType: activeTab }));
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
                  <Label>Vencimiento</Label>
                  <Input type="date" value={form.expiresAt} onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))} required />
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
              const tab = value as DocumentEntityType;
              setActiveTab(tab);
              setForm((prev) => ({ ...prev, entityType: tab, entityId: "", documentType: "" }));
            }}
            className="space-y-4"
          >
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="vehicle">Vehículos</TabsTrigger>
              <TabsTrigger value="user">Choferes</TabsTrigger>
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
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

