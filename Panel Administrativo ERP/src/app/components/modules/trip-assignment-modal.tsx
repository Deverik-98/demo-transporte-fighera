import { FormEvent, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { useOperationsData, ZoneId } from "../../lib/operations-data";
import { CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";

type TripAssignmentModalProps = {
  buttonLabel: string;
  onTripCreated?: (tripId: string, zoneId: ZoneId) => void;
  buttonClassName?: string;
};

export function TripAssignmentModal({ buttonLabel, onTripCreated, buttonClassName }: TripAssignmentModalProps) {
  const { zones, drivers, vehicles, routeTemplates, addTrip } = useOperationsData();
  const [isOpen, setIsOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    zoneId: "zona-argentina" as ZoneId,
    driverId: "",
    vehicleId: "",
    routeId: "",
    cargo: "",
    plan: "",
    scheduledAt: "",
  });

  const filteredDrivers = drivers.filter((driver) => driver.zoneId === assignmentForm.zoneId);
  const filteredVehicles = vehicles.filter((vehicle) => vehicle.zoneId === assignmentForm.zoneId && vehicle.type === "Camión");
  const filteredRoutes = routeTemplates.filter((route) => route.zoneId === assignmentForm.zoneId);

  useEffect(() => {
    if (!isOpen) return;
    const firstDriver = filteredDrivers[0]?.id ?? "";
    const firstVehicle = filteredVehicles[0]?.id ?? "";
    const firstRoute = filteredRoutes[0]?.id ?? "";
    setAssignmentForm((prev) => ({
      ...prev,
      driverId: prev.driverId || firstDriver,
      vehicleId: prev.vehicleId || firstVehicle,
      routeId: prev.routeId || firstRoute,
      scheduledAt: prev.scheduledAt || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    }));
  }, [isOpen, filteredDrivers, filteredVehicles, filteredRoutes]);

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resolvedDriverId = assignmentForm.driverId || filteredDrivers[0]?.id || "";
    const resolvedVehicleId = assignmentForm.vehicleId || filteredVehicles[0]?.id || "";
    const resolvedRouteId = assignmentForm.routeId || filteredRoutes[0]?.id || "";
    const resolvedScheduledAt = assignmentForm.scheduledAt || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

    if (!resolvedDriverId || !resolvedVehicleId || !resolvedRouteId) {
      toast.error("No hay chofer, camión o ruta disponible para la zona seleccionada.");
      return;
    }
    if (!assignmentForm.cargo.trim() || !assignmentForm.plan.trim()) {
      toast.error("Completa carga y plan de viaje para continuar.");
      return;
    }

    const trip = addTrip({
      zoneId: assignmentForm.zoneId,
      driverId: resolvedDriverId,
      vehicleId: resolvedVehicleId,
      routeId: resolvedRouteId,
      cargo: assignmentForm.cargo,
      plan: assignmentForm.plan,
      scheduledAt: resolvedScheduledAt,
    });
    if (!trip) {
      toast.error("No se pudo crear el viaje. Revisa los datos e intenta nuevamente.");
      return;
    }
    onTripCreated?.(trip.id, trip.zoneId);
    setIsOpen(false);
    setAssignmentForm((prev) => ({
      zoneId: prev.zoneId,
      driverId: resolvedDriverId,
      vehicleId: resolvedVehicleId,
      routeId: resolvedRouteId,
      cargo: "",
      plan: "",
      scheduledAt: resolvedScheduledAt,
    }));
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className={buttonClassName}>
          <Plus className="mr-2 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="z-[1600] max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Nueva programación de viaje</DialogTitle>
          <DialogDescription>Completa la asignación para gestionar el viaje desde el panel y monitor.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submitAssignment}>
          <div className="space-y-2">
            <Label>Zona</Label>
            <Select
              value={assignmentForm.zoneId}
              onValueChange={(value: ZoneId) =>
                setAssignmentForm({
                  zoneId: value,
                  driverId: drivers.find((driver) => driver.zoneId === value)?.id ?? "",
                  vehicleId: vehicles.find((vehicle) => vehicle.zoneId === value && vehicle.type === "Camión")?.id ?? "",
                  routeId: routeTemplates.find((route) => route.zoneId === value)?.id ?? "",
                  cargo: "",
                  plan: "",
                  scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
                })
              }
            >
              <SelectTrigger><SelectValue placeholder="Seleccionar zona" /></SelectTrigger>
              <SelectContent className="z-[1700]">
                {zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Chofer</Label>
            <Select value={assignmentForm.driverId} onValueChange={(value) => setAssignmentForm((prev) => ({ ...prev, driverId: value }))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar chofer" /></SelectTrigger>
              <SelectContent className="z-[1700]">
                {filteredDrivers.map((driver) => <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Camión</Label>
            <Select value={assignmentForm.vehicleId} onValueChange={(value) => setAssignmentForm((prev) => ({ ...prev, vehicleId: value }))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar camión" /></SelectTrigger>
              <SelectContent className="z-[1700]">
                {filteredVehicles.map((vehicle) => <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.plate}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ruta origen-destino</Label>
            <Select value={assignmentForm.routeId} onValueChange={(value) => setAssignmentForm((prev) => ({ ...prev, routeId: value }))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar ruta" /></SelectTrigger>
              <SelectContent className="z-[1700]">
                {filteredRoutes.map((route) => <SelectItem key={route.id} value={route.id}>{route.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><CalendarClock className="h-4 w-4" />Programación (fecha y hora)</Label>
            <Input
              type="datetime-local"
              value={assignmentForm.scheduledAt}
              onChange={(event) => setAssignmentForm((prev) => ({ ...prev, scheduledAt: event.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Carga</Label>
            <Input value={assignmentForm.cargo} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, cargo: event.target.value }))} placeholder="Ej: Químicos industriales - 15 toneladas" required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Plan de viaje</Label>
            <Textarea value={assignmentForm.plan} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, plan: event.target.value }))} placeholder="Ventanas horarias, paradas, checklist de entrega..." required />
          </div>
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Programar y asignar viaje</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

