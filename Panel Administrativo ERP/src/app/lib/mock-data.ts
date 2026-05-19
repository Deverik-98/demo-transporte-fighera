export const trips = [
  { id: "VJ-1001", origin: "Buenos Aires, AR", destination: "Montevideo, UY", driver: "Juan Pérez", plate: "AB123CD", status: "En ruta" },
  { id: "VJ-1002", origin: "Rosario, AR", destination: "Córdoba, AR", driver: "María González", plate: "XY456EF", status: "En planta" },
  { id: "VJ-1003", origin: "Montevideo, UY", destination: "Punta del Este, UY", driver: "Carlos Rodríguez", plate: "MN789GH", status: "Entregado" },
  { id: "VJ-1004", origin: "Mendoza, AR", destination: "Santiago, CL", driver: "Roberto Silva", plate: "PQ234IJ", status: "Asignado" },
  { id: "VJ-1005", origin: "La Plata, AR", destination: "Mar del Plata, AR", driver: "Ana Martínez", plate: "ST567KL", status: "Asignado" },
  { id: "VJ-1006", origin: "Colonia, UY", destination: "Buenos Aires, AR", driver: "Diego Fernández", plate: "UV890MN", status: "Aceptado" },
  { id: "VJ-1007", origin: "Tucumán, AR", destination: "Salta, AR", driver: "Laura Sánchez", plate: "WX123OP", status: "Sin chofer" },
  { id: "VJ-1008", origin: "Buenos Aires, AR", destination: "Asunción, PY", driver: "Miguel Torres", plate: "YZ456QR", status: "Reprogramado" },
];

export const alerts = [
  { id: 1, date: "2026-04-28 14:23", vehicle: "AB123CD", driver: "Juan Pérez", type: "Desvío de Ruta", severity: "Alta", status: "Activa" },
  { id: 2, date: "2026-04-28 09:15", vehicle: "XY456EF", driver: "María González", type: "Vencimiento de VTV", severity: "Media", status: "Activa" },
  { id: 3, date: "2026-04-27 18:47", vehicle: "MN789GH", driver: "Carlos Rodríguez", type: "Retraso en Entrega", severity: "Baja", status: "Resuelta" },
  { id: 4, date: "2026-04-28 11:32", vehicle: "PQ234IJ", driver: "Roberto Silva", type: "Vencimiento de Licencia", severity: "Alta", status: "Activa" },
  { id: 5, date: "2026-04-28 07:05", vehicle: "ST567KL", driver: "Ana Martínez", type: "Botón de Pánico", severity: "Alta", status: "Resuelta" },
  { id: 6, date: "2026-04-27 22:18", vehicle: "UV890MN", driver: "Diego Fernández", type: "Vencimiento de Seguro", severity: "Alta", status: "Activa" },
  { id: 7, date: "2026-04-28 13:50", vehicle: "WX123OP", driver: "Laura Sánchez", type: "Parada No Autorizada", severity: "Media", status: "Activa" },
  { id: 8, date: "2026-04-26 16:22", vehicle: "YZ456QR", driver: "Miguel Torres", type: "Vencimiento Psicofísico", severity: "Media", status: "Resuelta" },
];

export const costData = [
  { id: "VJ-1001", trip: "Buenos Aires → Montevideo", cost: 45000, revenue: 68000, profit: 23000, date: "2026-04-25" },
  { id: "VJ-1002", trip: "Rosario → Córdoba", cost: 32000, revenue: 48000, profit: 16000, date: "2026-04-24" },
  { id: "VJ-1003", trip: "Montevideo → Punta del Este", cost: 28000, revenue: 42000, profit: 14000, date: "2026-04-23" },
  { id: "VJ-1004", trip: "Mendoza → Santiago", cost: 55000, revenue: 85000, profit: 30000, date: "2026-04-22" },
  { id: "VJ-1005", trip: "La Plata → Mar del Plata", cost: 38000, revenue: 56000, profit: 18000, date: "2026-04-21" },
  { id: "VJ-1006", trip: "Colonia → Buenos Aires", cost: 35000, revenue: 52000, profit: 17000, date: "2026-04-20" },
];

export const expirationConfig = [
  { id: 1, docType: "Licencia de Conducir", frequency: "Anual", prealertDays: 30, enabled: true },
  { id: 2, docType: "VTV (Verificación Técnica)", frequency: "Semestral", prealertDays: 15, enabled: true },
  { id: 3, docType: "Seguro del Vehículo", frequency: "Anual", prealertDays: 30, enabled: true },
  { id: 4, docType: "Psicofísico del Chofer", frequency: "Anual", prealertDays: 60, enabled: true },
  { id: 5, docType: "Habilitación Municipal", frequency: "Anual", prealertDays: 45, enabled: true },
  { id: 6, docType: "Carnet de Cargas Peligrosas", frequency: "Trimestral", prealertDays: 20, enabled: false },
];

export const users = [
  { id: 1, name: "Admin Principal", email: "admin@transportefighiera.com", role: "Administrador", status: "Activo" },
  { id: 2, name: "Operador Logística", email: "operador@transportefighiera.com", role: "Operador", status: "Activo" },
  { id: 3, name: "Supervisor Rutas", email: "supervisor@transportefighiera.com", role: "Supervisor", status: "Activo" },
  { id: 4, name: "Auditor Externo", email: "auditor@transportefighiera.com", role: "Visualizador", status: "Inactivo" },
];

export const auditLogs = [
  { id: 1, dateTime: "2026-04-28 14:32:15", user: "admin@transportefighiera.com", ip: "190.123.45.67", action: "Aprobó viaje #VJ-1008" },
  { id: 2, dateTime: "2026-04-28 13:18:42", user: "operador@transportefighiera.com", ip: "190.123.45.68", action: "Editó perfil de chofer Juan Pérez" },
  { id: 3, dateTime: "2026-04-28 11:05:33", user: "supervisor@transportefighiera.com", ip: "190.123.45.69", action: "Resolvió alerta de desvío #2341" },
  { id: 4, dateTime: "2026-04-28 09:47:22", user: "admin@transportefighiera.com", ip: "190.123.45.67", action: "Modificó configuración de vencimientos" },
  { id: 5, dateTime: "2026-04-27 18:25:11", user: "operador@transportefighiera.com", ip: "190.123.45.68", action: "Creó nuevo viaje #VJ-1009" },
  { id: 6, dateTime: "2026-04-27 16:12:05", user: "admin@transportefighiera.com", ip: "190.123.45.67", action: "Desactivó usuario auditor@transportefighiera.com" },
  { id: 7, dateTime: "2026-04-27 14:38:27", user: "supervisor@transportefighiera.com", ip: "190.123.45.69", action: "Exportó reporte de costos mensual" },
  { id: 8, dateTime: "2026-04-27 10:22:19", user: "operador@transportefighiera.com", ip: "190.123.45.68", action: "Actualizó estado de viaje #VJ-1003 a Entregado" },
];

export const zones = [
  {
    id: "zona-bsas",
    name: "Buenos Aires",
    activeTrips: 2,
    alerts: 1,
    color: "bg-blue-500",
    routes: [
      { from: "Buenos Aires", to: "La Plata", progress: 65, truck: "AB123CD" },
    ],
  },
  {
    id: "zona-santafe",
    name: "Santa Fe",
    activeTrips: 2,
    alerts: 2,
    color: "bg-teal-500",
    routes: [
      { from: "Santa Fe", to: "Rafaela", progress: 55, truck: "MN789GH" },
    ],
  },
  {
    id: "zona-sanjuan",
    name: "San Juan",
    activeTrips: 2,
    alerts: 1,
    color: "bg-orange-500",
    routes: [{ from: "San Juan", to: "Mendoza", progress: 48, truck: "UV890MN" }],
  },
  {
    id: "zona-tucuman",
    name: "Tucumán",
    activeTrips: 2,
    alerts: 1,
    color: "bg-purple-500",
    routes: [{ from: "Tucumán", to: "Concepción", progress: 33, truck: "VC227BB" }],
  },
  {
    id: "zona-cordoba",
    name: "Córdoba",
    activeTrips: 2,
    alerts: 1,
    color: "bg-indigo-500",
    routes: [{ from: "Ciudad de Córdoba", to: "Villa María", progress: 61, truck: "RS320AA" }],
  },
];

export type RealtimeAlertSeed = {
  id: number;
  time: string;
  message: string;
  severity: string;
  alertKind?: "vehicle_documentation" | "operational" | "driver_documentation";
  vehiclePlate?: string;
  tripId?: string;
};

export const realtimeAlerts: RealtimeAlertSeed[] = [
  {
    id: 1,
    time: "14:32",
    message: "Desvío detectado en ruta — Viaje VJ-1001 (Juan Pérez · Mendoza → San Juan)",
    severity: "Alta",
    alertKind: "operational",
    tripId: "VJ-1001",
    vehiclePlate: "AB123CD",
  },
];

export const monthlyChartData = [
  { month: "Oct", costo: 280000, ingreso: 425000 },
  { month: "Nov", costo: 310000, ingreso: 468000 },
  { month: "Dic", costo: 295000, ingreso: 442000 },
  { month: "Ene", costo: 325000, ingreso: 485000 },
  { month: "Feb", costo: 340000, ingreso: 512000 },
  { month: "Mar", costo: 355000, ingreso: 535000 },
  { month: "Abr", costo: 238000, ingreso: 356000 },
];
