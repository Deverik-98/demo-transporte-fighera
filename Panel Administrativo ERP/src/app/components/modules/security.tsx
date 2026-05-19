import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { useOperationsData, UserRole, UserStatus, ZoneId } from "../../lib/operations-data";
import { FileUp, Plus, Shield, Trash2, User, FileText, Lock } from "lucide-react";
import { AssociatedDocumentsDialog } from "./associated-documents-dialog";
import { toast } from "sonner";

type DriverDocDraft = {
  id: string;
  documentType: string;
  expiresAt: string;
  notes: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
};

export function Security() {
  const { users, auditLogs, zones, addUser, updateUserStatus, removeUser, addDocument, userDocumentTypesByRole } = useOperationsData();
  const defaultZoneId = zones[0]?.id ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Operador" as UserRole,
    zoneId: defaultZoneId as ZoneId,
  });
  const [driverDocsDraft, setDriverDocsDraft] = useState<DriverDocDraft[]>([
    {
      id: "driver-doc-1",
      documentType: "Licencia de Conducir",
      expiresAt: "",
      notes: "",
      fileName: "",
      fileType: "",
      fileSizeKb: 0,
    },
  ]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = addUser(form);
    if (form.role === "Chofer") {
      driverDocsDraft.forEach((doc) => {
        if (!doc.documentType || !doc.expiresAt || !doc.fileName) return;
        addDocument({
          entityType: "user",
          entityId: created.id,
          documentType: doc.documentType,
          expiresAt: doc.expiresAt,
          notes: doc.notes,
          fileName: doc.fileName,
          fileType: doc.fileType || "application/octet-stream",
          fileSizeKb: doc.fileSizeKb || 1,
        });
      });
    }
    setIsOpen(false);
    setForm((prev) => ({ ...prev, name: "", email: "" }));
    setDriverDocsDraft([
      {
        id: "driver-doc-1",
        documentType: "Licencia de Conducir",
        expiresAt: "",
        notes: "",
        fileName: "",
        fileType: "",
        fileSizeKb: 0,
      },
    ]);
  }

  function addDriverDocRow() {
    setDriverDocsDraft((prev) => [
      ...prev,
      {
        id: `driver-doc-${Date.now()}`,
        documentType: "Psicofísico",
        expiresAt: "",
        notes: "",
        fileName: "",
        fileType: "",
        fileSizeKb: 0,
      },
    ]);
  }

  function updateDriverDocRow(id: string, patch: Partial<DriverDocDraft>) {
    setDriverDocsDraft((prev) => prev.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)));
  }

  function removeDriverDocRow(id: string) {
    setDriverDocsDraft((prev) => (prev.length === 1 ? prev : prev.filter((doc) => doc.id !== id)));
  }

  function onDriverDocFileChange(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Solo se permiten imágenes o PDF.");
      return;
    }
    updateDriverDocRow(id, {
      fileName: file.name,
      fileType: file.type,
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
    });
  }

  useEffect(() => {
    if (!defaultZoneId) return;
    if (form.zoneId) return;
    setForm((prev) => ({ ...prev, zoneId: defaultZoneId as ZoneId }));
  }, [defaultZoneId, form.zoneId]);

  return (
    <div className="space-y-6">
      <h1>Seguridad y Auditoría</h1>

      <Tabs defaultValue="access" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="access">
            <User className="h-4 w-4 mr-2" />
            Gestión de Accesos
          </TabsTrigger>
          <TabsTrigger value="audit">
            <FileText className="h-4 w-4 mr-2" />
            Registro de Auditoría
          </TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Total Usuarios</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl">{users.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Administradores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl text-red-500">
                  {users.filter(u => u.role === "Administrador").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Operadores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl text-blue-500">
                  {users.filter(u => u.role === "Operador" || u.role === "Supervisor").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Usuarios Activos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl text-green-500">
                  {users.filter(u => u.status === "Activo").length}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Usuarios del Sistema
                </CardTitle>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <User className="h-4 w-4 mr-2" />
                      Nuevo Usuario
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Crear usuario</DialogTitle>
                    </DialogHeader>
                    <form className="grid gap-4" onSubmit={handleSubmit}>
                      <div className="space-y-2">
                        <Label>Nombre</Label>
                        <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Rol</Label>
                          <Select
                            value={form.role}
                            onValueChange={(value: UserRole) => setForm((prev) => ({ ...prev, role: value }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Administrador">Administrador</SelectItem>
                              <SelectItem value="Operador">Operador</SelectItem>
                              <SelectItem value="Supervisor">Supervisor</SelectItem>
                              <SelectItem value="Chofer">Chofer</SelectItem>
                              <SelectItem value="Visualizador">Visualizador</SelectItem>
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
                      </div>
                      {form.role === "Chofer" ? (
                        <div className="rounded-lg border p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div>
                              <p>Documentos iniciales del chofer</p>
                              <p className="text-xs text-muted-foreground">
                                Carga simulada de documentación obligatoria para alta operativa.
                              </p>
                            </div>
                            <Button type="button" variant="outline" onClick={addDriverDocRow}>
                              <Plus className="mr-2 h-4 w-4" />
                              Agregar documento
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {driverDocsDraft.map((doc) => (
                              <div key={doc.id} className="rounded-md border p-3">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>Tipo de documento</Label>
                                    <Select
                                      value={doc.documentType}
                                      onValueChange={(value) => updateDriverDocRow(doc.id, { documentType: value })}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {userDocumentTypesByRole.Chofer.map((type) => (
                                          <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Vencimiento</Label>
                                    <Input
                                      type="date"
                                      value={doc.expiresAt}
                                      onChange={(e) => updateDriverDocRow(doc.id, { expiresAt: e.target.value })}
                                    />
                                  </div>
                                  <div className="col-span-2 space-y-2">
                                    <Label>Adjunto (imagen/PDF)</Label>
                                    <Input type="file" accept="image/*,.pdf" onChange={(e) => onDriverDocFileChange(doc.id, e)} />
                                    {doc.fileName ? (
                                      <Badge variant="outline">
                                        <FileUp className="mr-1 h-3 w-3" />
                                        {doc.fileName} ({doc.fileSizeKb} KB)
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="col-span-2 space-y-2">
                                    <Label>Notas</Label>
                                    <Textarea
                                      value={doc.notes}
                                      onChange={(e) => updateDriverDocRow(doc.id, { notes: e.target.value })}
                                    />
                                  </div>
                                </div>
                                <div className="mt-2 flex justify-end">
                                  <Button type="button" size="sm" variant="outline" onClick={() => removeDriverDocRow(doc.id)}>
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    Quitar
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <DialogFooter>
                        <Button type="submit">Guardar usuario</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3">Nombre</th>
                      <th className="text-left p-3">Email</th>
                      <th className="text-left p-3">Rol</th>
                      <th className="text-left p-3">Estado</th>
                      <th className="text-left p-3">Documentación</th>
                      <th className="text-left p-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                        <td className="p-3">{user.name}</td>
                        <td className="p-3 text-sm text-muted-foreground">{user.email}</td>
                        <td className="p-3">
                          <Badge
                            variant={
                              user.role === "Administrador"
                                ? "destructive"
                                : user.role === "Visualizador"
                                ? "secondary"
                                : "default"
                            }
                          >
                            <Lock className="h-3 w-3 mr-1" />
                            {user.role}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Select value={user.status} onValueChange={(value: UserStatus) => updateUserStatus(user.id, value)}>
                            <SelectTrigger className="h-10 w-full min-w-[8rem] sm:w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Activo">Activo</SelectItem>
                              <SelectItem value="Inactivo">Inactivo</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          {user.role === "Chofer" ? (
                            <AssociatedDocumentsDialog
                              entityType="user"
                              entityId={user.id}
                              title={`Documentos de ${user.name}`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">No aplica</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Button size="sm" variant="outline" onClick={() => removeUser(user.id)}>
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-yellow-500/10 border-yellow-500">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <h3 className="mb-1">Seguridad del Sistema</h3>
                  <p className="text-sm text-muted-foreground">
                    Los roles de usuario determinan los permisos de acceso. Los administradores tienen acceso
                    completo, los supervisores pueden aprobar viajes, los operadores gestionan operaciones diarias
                    y los visualizadores solo pueden consultar información.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Registro de Actividad del Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3">Fecha/Hora</th>
                      <th className="text-left p-3">Usuario</th>
                      <th className="text-left p-3">Dirección IP</th>
                      <th className="text-left p-3">Acción Realizada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-border hover:bg-muted/50">
                        <td className="p-3 text-sm text-muted-foreground">{log.dateTime}</td>
                        <td className="p-3">{log.user}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="font-mono text-xs">
                            {log.ip}
                          </Badge>
                        </td>
                        <td className="p-3">{log.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Eventos Hoy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl">
                  {auditLogs.filter(log => log.dateTime.startsWith("2026-04-28")).length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Usuarios Activos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl">
                  {new Set(auditLogs.map(log => log.user)).size}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Total de Registros</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl">{auditLogs.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-blue-500/10 border-blue-500">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="mb-1">Trazabilidad Total</h3>
                  <p className="text-sm text-muted-foreground">
                    Todas las acciones realizadas en el sistema quedan registradas con fecha, hora, usuario e IP.
                    Los registros se mantienen durante 365 días para cumplimiento normativo y análisis forense.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
