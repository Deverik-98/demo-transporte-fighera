import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useOperationsData } from "../../lib/operations-data";
import { FileSignature, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

export function InvoicesHRModule() {
  const { users, invoices, addInvoice, markInvoiceSigned } = useOperationsData();
  const drivers = users.filter((user) => user.role === "Chofer" && user.status === "Activo");
  const [isOpen, setIsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "Cargada" | "Firmada">("all");
  const [form, setForm] = useState({
    driverId: "",
    period: "",
    amount: "",
    fileName: "",
    fileType: "",
    fileSizeKb: 0,
  });

  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => (statusFilter === "all" ? true : invoice.status === statusFilter)),
    [invoices, statusFilter],
  );

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      toast.error("La factura debe ser PDF o imagen.");
      return;
    }
    setForm((prev) => ({
      ...prev,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = addInvoice({
      driverId: form.driverId,
      period: form.period,
      amount: Number(form.amount || 0),
      fileName: form.fileName,
      fileType: form.fileType,
      fileSizeKb: form.fileSizeKb,
    });
    if (!created) {
      toast.error("Completa chofer, periodo y adjunto para cargar la factura.");
      return;
    }
    setIsOpen(false);
    setForm({
      driverId: "",
      period: "",
      amount: "",
      fileName: "",
      fileType: "",
      fileSizeKb: 0,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>RRHH · Facturas para Firma</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Cargar factura
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Nueva factura para chofer</DialogTitle>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label>Chofer</Label>
                <Select value={form.driverId} onValueChange={(value) => setForm((prev) => ({ ...prev, driverId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar chofer" /></SelectTrigger>
                  <SelectContent>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Periodo</Label>
                  <Input
                    placeholder="Ej: Abril 2026"
                    value={form.period}
                    onChange={(e) => setForm((prev) => ({ ...prev, period: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Monto (ARS)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-dashed p-4">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Adjuntar factura (PDF/imagen)
                </Label>
                <Input type="file" accept="application/pdf,image/*" onChange={handleFileUpload} />
                {form.fileName ? (
                  <Badge variant="outline">{form.fileName} · {form.fileSizeKb} KB</Badge>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="submit">Guardar y asignar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Seguimiento de firmas de facturas
            </CardTitle>
            <Select value={statusFilter} onValueChange={(value: "all" | "Cargada" | "Firmada") => setStatusFilter(value)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="Cargada">Cargada</SelectItem>
                <SelectItem value="Firmada">Firmada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
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
                        Marcar firmada
                      </Button>
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

