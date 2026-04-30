import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { expirationConfig, realtimeAlerts } from "./mock-data";
import {
  getSyncDocuments,
  getSyncSettings,
  getSyncTrips,
  getSyncUsers,
  getSyncVehicles,
  initSyncCollection,
  initSyncStore,
  RESET_REQUEST_KEY,
  resetSyncDemoData,
  resolveSyncAlertsByTrip,
  setSyncDocuments,
  setSyncSettings,
  setSyncTrips,
  setSyncUsers,
  setSyncVehicles,
  SyncAlert,
} from "./sync-store";

export type ZoneId = "zona-argentina" | "zona-uruguay";
type LatLngExpression = [number, number];
export type TripStatus = "Pendiente de aceptación" | "Asignado" | "En Planta" | "Cargando" | "En Ruta" | "Entregado" | "Cancelado";

export type Driver = { id: string; name: string; zoneId: ZoneId };
export type UserRole = "Administrador" | "Operador" | "Supervisor" | "Chofer" | "Visualizador";
export type UserStatus = "Activo" | "Inactivo";
export type VehicleStatus = "Activo" | "Mantenimiento" | "Inactivo";
export type Vehicle = { id: string; plate: string; type: "Camión" | "Remolque"; zoneId: ZoneId; brand: string; model: string; status: VehicleStatus };
export type AppUser = { id: string; name: string; email: string; role: UserRole; status: UserStatus; zoneId: ZoneId };
export type AuditLog = { id: number; dateTime: string; user: string; ip: string; action: string };
export type DocumentEntityType = "user" | "vehicle";
export type DocumentRecord = {
  id: string;
  entityType: DocumentEntityType;
  entityId: string;
  documentType: string;
  expiresAt: string;
  status: "Vigente" | "Próximo a vencer" | "Vencido";
  notes: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
  uploadedAt: string;
};
export type RouteTemplate = {
  id: string;
  zoneId: ZoneId;
  label: string;
  origin: string;
  destination: string;
  path: LatLngExpression[];
};

export type PlannedTrip = {
  id: string;
  zoneId: ZoneId;
  driver: string;
  vehiclePlate: string;
  origin: string;
  destination: string;
  routePath: LatLngExpression[];
  progress: number;
  status: TripStatus;
  cargo: string;
  plan: string;
  scheduledAt: string;
  timeline?: Array<{ timestamp: string; descripcion: string }>;
  evidencias?: Array<{ tipo: string; nombre: string; fecha: string }>;
};

export type InvoiceStatus = "Cargada" | "Firmada";
export type DriverInvoice = {
  id: string;
  driverId: string;
  driverName: string;
  period: string;
  amount: number;
  uploadedAt: string;
  status: InvoiceStatus;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
  signedAt?: string;
};
export type ExpirationRule = {
  id: number;
  docType: string;
  frequency: string;
  prealertDays: number;
  enabled: boolean;
};

type TripInput = {
  zoneId: ZoneId;
  driverId: string;
  vehicleId: string;
  routeId: string;
  cargo: string;
  plan: string;
  scheduledAt: string;
};

type UserInput = { name: string; email: string; role: UserRole; zoneId: ZoneId };
type VehicleInput = { plate: string; type: "Camión" | "Remolque"; zoneId: ZoneId; brand: string; model: string };
type DocumentInput = {
  entityType: DocumentEntityType;
  entityId: string;
  documentType: string;
  expiresAt: string;
  notes: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
};
type InvoiceInput = {
  driverId: string;
  period: string;
  amount: number;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
};

type OperationsDataContextValue = {
  zones: { id: ZoneId; name: string; colorClass: string; mapCenter: LatLngExpression; zoom: number }[];
  drivers: Driver[];
  users: AppUser[];
  vehicles: Vehicle[];
  documents: DocumentRecord[];
  auditLogs: AuditLog[];
  userDocumentTypesByRole: Record<UserRole, string[]>;
  vehicleDocumentTypes: string[];
  routeTemplates: RouteTemplate[];
  trips: PlannedTrip[];
  invoices: DriverInvoice[];
  expirationRules: ExpirationRule[];
  addTrip: (input: TripInput) => PlannedTrip | null;
  updateTripStatus: (tripId: string, status: TripStatus) => void;
  cancelTrip: (tripId: string) => void;
  removeTrip: (tripId: string) => void;
  addUser: (input: UserInput) => AppUser;
  updateUserStatus: (userId: string, status: UserStatus) => void;
  removeUser: (userId: string) => void;
  addVehicle: (input: VehicleInput) => Vehicle | null;
  updateVehicleStatus: (vehicleId: string, status: VehicleStatus) => void;
  removeVehicle: (vehicleId: string) => void;
  addDocument: (input: DocumentInput) => DocumentRecord | null;
  removeDocument: (documentId: string) => void;
  addInvoice: (input: InvoiceInput) => DriverInvoice | null;
  markInvoiceSigned: (invoiceId: string) => void;
  setExpirationRules: (rules: ExpirationRule[]) => void;
  resetDemoData: () => void;
};

const zones = [
  { id: "zona-argentina" as const, name: "Argentina", colorClass: "bg-blue-500", mapCenter: [-34.4, -63.6] as LatLngExpression, zoom: 5 },
  { id: "zona-uruguay" as const, name: "Uruguay", colorClass: "bg-emerald-500", mapCenter: [-33.2, -56.2] as LatLngExpression, zoom: 7 },
];

const userDocumentTypesByRole: Record<UserRole, string[]> = {
  Administrador: ["DNI", "Contrato Laboral"],
  Operador: ["DNI", "Contrato Laboral"],
  Supervisor: ["DNI", "Contrato Laboral"],
  Chofer: ["Licencia de Conducir", "Psicofísico", "Seguro Personal", "Carnet de Cargas Peligrosas"],
  Visualizador: ["DNI"],
};

const vehicleDocumentTypes = ["VTV", "Seguro del Vehículo", "Habilitación", "Póliza de Carga"];

const initialUsers: AppUser[] = [
  { id: "USR-01", name: "Admin Principal", email: "admin@transportefighera.com", role: "Administrador", status: "Activo", zoneId: "zona-argentina" },
  { id: "USR-02", name: "Operador Logística", email: "operador@transportefighera.com", role: "Operador", status: "Activo", zoneId: "zona-argentina" },
  { id: "USR-03", name: "Supervisor Rutas", email: "supervisor@transportefighera.com", role: "Supervisor", status: "Activo", zoneId: "zona-uruguay" },
  { id: "USR-04", name: "Juan Pérez", email: "juan.perez@transportefighera.com", role: "Chofer", status: "Activo", zoneId: "zona-argentina" },
  { id: "USR-05", name: "María González", email: "maria.gonzalez@transportefighera.com", role: "Chofer", status: "Activo", zoneId: "zona-argentina" },
  { id: "USR-06", name: "Carlos Rodríguez", email: "carlos.rodriguez@transportefighera.com", role: "Chofer", status: "Activo", zoneId: "zona-uruguay" },
  { id: "USR-07", name: "Diego Fernández", email: "diego.fernandez@transportefighera.com", role: "Chofer", status: "Activo", zoneId: "zona-uruguay" },
];

const initialVehicles: Vehicle[] = [
  { id: "VH-01", plate: "AB123CD", type: "Camión", zoneId: "zona-argentina", brand: "Iveco", model: "Stralis", status: "Activo" },
  { id: "VH-02", plate: "XY456EF", type: "Camión", zoneId: "zona-argentina", brand: "Scania", model: "R450", status: "Activo" },
  { id: "VH-03", plate: "MN789GH", type: "Camión", zoneId: "zona-uruguay", brand: "Mercedes-Benz", model: "Actros", status: "Activo" },
  { id: "VH-04", plate: "UV890MN", type: "Camión", zoneId: "zona-uruguay", brand: "Volvo", model: "FH", status: "Mantenimiento" },
];

const initialDocuments: DocumentRecord[] = [
  {
    id: "DOC-01",
    entityType: "user",
    entityId: "USR-04",
    documentType: "Licencia de Conducir",
    expiresAt: "2026-08-15",
    status: "Vigente",
    notes: "Categoría E1 vigente.",
    fileName: "licencia_juan_perez_frente.jpg",
    fileType: "image/jpeg",
    fileSizeKb: 812,
    uploadedAt: "2026-04-15T10:22",
  },
  {
    id: "DOC-02",
    entityType: "user",
    entityId: "USR-04",
    documentType: "Psicofísico",
    expiresAt: "2026-06-02",
    status: "Próximo a vencer",
    notes: "Control médico anual.",
    fileName: "psicofisico_juan_2026.pdf",
    fileType: "application/pdf",
    fileSizeKb: 434,
    uploadedAt: "2026-03-02T08:15",
  },
  {
    id: "DOC-03",
    entityType: "vehicle",
    entityId: "VH-01",
    documentType: "VTV",
    expiresAt: "2026-09-20",
    status: "Vigente",
    notes: "Unidad operativa.",
    fileName: "vtv_ab123cd.pdf",
    fileType: "application/pdf",
    fileSizeKb: 558,
    uploadedAt: "2026-02-20T12:40",
  },
  {
    id: "DOC-04",
    entityType: "vehicle",
    entityId: "VH-04",
    documentType: "Seguro del Vehículo",
    expiresAt: "2026-05-05",
    status: "Próximo a vencer",
    notes: "Renovación en trámite.",
    fileName: "seguro_uv890mn.jpg",
    fileType: "image/jpeg",
    fileSizeKb: 921,
    uploadedAt: "2026-01-11T16:05",
  },
];

const initialAuditLogs: AuditLog[] = [
  { id: 1, dateTime: "2026-04-28 14:32:15", user: "admin@transportefighera.com", ip: "190.123.45.67", action: "Aprobó viaje #VJ-1008" },
  { id: 2, dateTime: "2026-04-28 13:18:42", user: "operador@transportefighera.com", ip: "190.123.45.68", action: "Editó perfil de chofer Juan Pérez" },
  { id: 3, dateTime: "2026-04-28 11:05:33", user: "supervisor@transportefighera.com", ip: "190.123.45.69", action: "Resolvió alerta de desvío #2341" },
];

const initialInvoices: DriverInvoice[] = [
  {
    id: "FAC-01",
    driverId: "USR-04",
    driverName: "Juan Pérez",
    period: "Abril 2026",
    amount: 1250000,
    uploadedAt: "2026-04-28T09:10",
    status: "Firmada",
    fileName: "recibo_sueldo_juan_abril_2026.pdf",
    fileType: "application/pdf",
    fileSizeKb: 286,
    signedAt: "2026-04-28T14:26",
  },
  {
    id: "FAC-02",
    driverId: "USR-05",
    driverName: "María González",
    period: "Abril 2026",
    amount: 1195000,
    uploadedAt: "2026-04-29T08:40",
    status: "Cargada",
    fileName: "recibo_sueldo_maria_abril_2026.pdf",
    fileType: "application/pdf",
    fileSizeKb: 301,
  },
];

function buildId(prefix: string, count: number) {
  return `${prefix}-${String(count).padStart(2, "0")}`;
}

const routeTemplates: RouteTemplate[] = [
  {
    id: "RT-AR-001",
    zoneId: "zona-argentina",
    label: "Buenos Aires -> Rosario -> Córdoba",
    origin: "Buenos Aires",
    destination: "Córdoba",
    path: [
      [-34.6037, -58.3816],
      [-33.113, -60.643],
      [-31.4201, -64.1888],
    ],
  },
  {
    id: "RT-AR-002",
    zoneId: "zona-argentina",
    label: "Mendoza -> San Luis -> Buenos Aires",
    origin: "Mendoza",
    destination: "Buenos Aires",
    path: [
      [-32.8895, -68.8458],
      [-33.3017, -66.3378],
      [-34.6037, -58.3816],
    ],
  },
  {
    id: "RT-UY-001",
    zoneId: "zona-uruguay",
    label: "Montevideo -> Colonia",
    origin: "Montevideo",
    destination: "Colonia del Sacramento",
    path: [
      [-34.9011, -56.1645],
      [-34.4698, -57.8438],
    ],
  },
  {
    id: "RT-UY-002",
    zoneId: "zona-uruguay",
    label: "Montevideo -> Maldonado -> Punta del Este",
    origin: "Montevideo",
    destination: "Punta del Este",
    path: [
      [-34.9011, -56.1645],
      [-34.9065, -54.9556],
      [-34.967, -54.949],
    ],
  },
];

const initialTrips: PlannedTrip[] = [
  {
    id: "VJ-1001",
    zoneId: "zona-argentina",
    driver: "Juan Pérez",
    vehiclePlate: "AB123CD",
    origin: "Buenos Aires",
    destination: "Córdoba",
    routePath: routeTemplates[0].path,
    progress: 62,
    status: "En Ruta",
    cargo: "Insumos alimenticios - 19 toneladas",
    plan: "Salida 06:00, control en peaje Campana, entrega 17:30.",
    scheduledAt: "2026-04-30T15:00",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1002",
    zoneId: "zona-argentina",
    driver: "María González",
    vehiclePlate: "XY456EF",
    origin: "Mendoza",
    destination: "Buenos Aires",
    routePath: routeTemplates[1].path,
    progress: 28,
    status: "Cargando",
    cargo: "Acero laminado - 23 toneladas",
    plan: "Carga en planta 09:00, salida estimada 11:15.",
    scheduledAt: "2026-04-30T18:00",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1003",
    zoneId: "zona-uruguay",
    driver: "Carlos Rodríguez",
    vehiclePlate: "MN789GH",
    origin: "Montevideo",
    destination: "Colonia del Sacramento",
    routePath: routeTemplates[2].path,
    progress: 75,
    status: "En Ruta",
    cargo: "Paquetería seca - 8 toneladas",
    plan: "Ruta costera con parada de control a mitad de tramo.",
    scheduledAt: "2026-05-01T09:30",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1004",
    zoneId: "zona-argentina",
    driver: "Diego Fernández",
    vehiclePlate: "UV890MN",
    origin: "La Plata",
    destination: "Mar del Plata",
    routePath: [
      [-34.9215, -57.9545],
      [-37.999, -57.548],
    ],
    progress: 10,
    status: "Asignado",
    cargo: "Enlatados y bebidas - 14 toneladas",
    plan: "Salida 15:00, ventana de descarga 20:00.",
    scheduledAt: "2026-05-01T15:00",
    timeline: [],
    evidencias: [],
  },
  {
    id: "VJ-1005",
    zoneId: "zona-uruguay",
    driver: "María González",
    vehiclePlate: "XY456EF",
    origin: "Montevideo",
    destination: "Punta del Este",
    routePath: routeTemplates[3].path,
    progress: 0,
    status: "Pendiente de aceptación",
    cargo: "Insumos farmacéuticos - 6 toneladas",
    plan: "Salida 07:30, control documental previo en base.",
    scheduledAt: "2026-05-01T07:30",
    timeline: [],
    evidencias: [],
  },
];

const initialSyncAlerts: SyncAlert[] = realtimeAlerts.map((alert) => ({
  id: String(alert.id),
  time: alert.time,
  message: alert.message,
  severity: alert.severity === "Alta" ? "Alta" : "Media",
  source: "web",
  status: "Activa",
}));

const OperationsDataContext = createContext<OperationsDataContextValue | null>(null);

export function OperationsDataProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initSyncStore(initialTrips, initialSyncAlerts);
    initSyncCollection("tf_sync_users_v1", initialUsers);
    initSyncCollection("tf_sync_vehicles_v1", initialVehicles);
    initSyncCollection("tf_sync_documents_v1", initialDocuments);
    initSyncCollection("tf_sync_settings_v1", expirationConfig);
  }, []);

  useEffect(() => {
    const syncCollections = () => {
      const syncedUsers = getSyncUsers<AppUser>();
      const syncedVehicles = getSyncVehicles<Vehicle>();
      const syncedDocuments = getSyncDocuments<DocumentRecord>();
      const syncedSettings = getSyncSettings<ExpirationRule>();
      if (syncedUsers.length) setUsers(syncedUsers);
      if (syncedVehicles.length) setVehicles(syncedVehicles);
      if (syncedDocuments.length) setDocuments(syncedDocuments);
      if (syncedSettings.length) setExpirationRulesState(syncedSettings);
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === "tf_sync_users_v1" ||
        event.key === "tf_sync_vehicles_v1" ||
        event.key === "tf_sync_documents_v1" ||
        event.key === "tf_sync_settings_v1"
      ) {
        syncCollections();
      }
    };
    const onInternal = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (
        detail?.key === "tf_sync_users_v1" ||
        detail?.key === "tf_sync_vehicles_v1" ||
        detail?.key === "tf_sync_documents_v1" ||
        detail?.key === "tf_sync_settings_v1"
      ) {
        syncCollections();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("tf-sync-store-updated", onInternal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tf-sync-store-updated", onInternal);
    };
  }, []);

  const [trips, setTrips] = useState<PlannedTrip[]>(() => {
    const synced = getSyncTrips() as PlannedTrip[];
    return synced.length ? synced : initialTrips;
  });
  const [users, setUsers] = useState<AppUser[]>(() => {
    const synced = getSyncUsers<AppUser>();
    return synced.length ? synced : initialUsers;
  });
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    const synced = getSyncVehicles<Vehicle>();
    return synced.length ? synced : initialVehicles;
  });
  const [documents, setDocuments] = useState<DocumentRecord[]>(() => {
    const synced = getSyncDocuments<DocumentRecord>();
    return synced.length ? synced : initialDocuments;
  });
  const [expirationRules, setExpirationRulesState] = useState<ExpirationRule[]>(() => {
    const synced = getSyncSettings<ExpirationRule>();
    return synced.length ? synced : expirationConfig;
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);
  const [invoices, setInvoices] = useState<DriverInvoice[]>(initialInvoices);

  useEffect(() => {
    const syncFromStorage = () => {
      const synced = getSyncTrips() as PlannedTrip[];
      setTrips(synced.length ? synced : initialTrips);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "tf_sync_trips_v1") syncFromStorage();
    };
    const onInternal = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === "tf_sync_trips_v1") syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("tf-sync-store-updated", onInternal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tf-sync-store-updated", onInternal);
    };
  }, []);

  const updateTrips = (updater: (current: PlannedTrip[]) => PlannedTrip[]) => {
    setTrips((prev) => {
      const next = updater(prev);
      setSyncTrips(next);
      return next;
    });
  };
  const updateUsers = (updater: (current: AppUser[]) => AppUser[]) => {
    setUsers((prev) => {
      const next = updater(prev);
      setSyncUsers(next);
      return next;
    });
  };
  const updateVehicles = (updater: (current: Vehicle[]) => Vehicle[]) => {
    setVehicles((prev) => {
      const next = updater(prev);
      setSyncVehicles(next);
      return next;
    });
  };
  const updateDocuments = (updater: (current: DocumentRecord[]) => DocumentRecord[]) => {
    setDocuments((prev) => {
      const next = updater(prev);
      setSyncDocuments(next);
      return next;
    });
  };
  const updateExpirationRules = (updater: (current: ExpirationRule[]) => ExpirationRule[]) => {
    setExpirationRulesState((prev) => {
      const next = updater(prev);
      setSyncSettings(next);
      return next;
    });
  };

  const performFullDemoReset = () => {
    updateUsers(() => initialUsers);
    updateVehicles(() => initialVehicles);
    updateDocuments(() => initialDocuments);
    updateExpirationRules(() => expirationConfig);
    setAuditLogs(initialAuditLogs);
    setInvoices(initialInvoices);
    updateTrips(() => initialTrips);
    resetSyncDemoData(initialTrips, initialSyncAlerts);
    setSyncUsers(initialUsers);
    setSyncVehicles(initialVehicles);
    setSyncDocuments(initialDocuments);
    setSyncSettings(expirationConfig);
    toast.success("Demo reiniciada y sincronizada");
  };

  useEffect(() => {
    const onResetRequested = (event: StorageEvent) => {
      if (event.key === RESET_REQUEST_KEY) {
        performFullDemoReset();
      }
    };
    window.addEventListener("storage", onResetRequested);
    return () => window.removeEventListener("storage", onResetRequested);
  }, []);

  const value = useMemo<OperationsDataContextValue>(
    () => ({
      zones,
      users,
      drivers: users
        .filter((user) => user.role === "Chofer")
        .map((user) => ({ id: user.id, name: user.name, zoneId: user.zoneId })),
      vehicles,
      documents,
      auditLogs,
      userDocumentTypesByRole,
      vehicleDocumentTypes,
      routeTemplates,
      trips,
      invoices,
      expirationRules,
      addTrip: (input) => {
        const driver = users.find((item) => item.id === input.driverId && item.role === "Chofer");
        const vehicle = vehicles.find((item) => item.id === input.vehicleId);
        const route = routeTemplates.find((item) => item.id === input.routeId);
        if (!driver || !vehicle || !route) return null;
        if (!input.cargo.trim() || !input.plan.trim()) return null;

        const sequence = 1000 + trips.length + 1;
        const newTrip: PlannedTrip = {
          id: `VJ-${sequence}`,
          zoneId: input.zoneId,
          driver: driver.name,
          vehiclePlate: vehicle.plate,
          origin: route.origin,
          destination: route.destination,
          routePath: route.path,
          progress: 0,
          status: "Pendiente de aceptación",
          cargo: input.cargo.trim(),
          plan: input.plan.trim(),
          scheduledAt: input.scheduledAt || new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
          timeline: [],
          evidencias: [],
        };
        updateTrips((prev) => [newTrip, ...prev]);
        toast.message(`Viaje ${newTrip.id} creado`, {
          description: "Esperando aceptación del chofer...",
        });
        window.setTimeout(() => {
          updateTrips((prev) =>
            prev.map((trip) =>
              trip.id === newTrip.id
                ? {
                    ...trip,
                    status: "Asignado",
                    progress: 10,
                  }
                : trip,
            ),
          );
          toast.success(`Chofer aceptó ${newTrip.id}`, {
            description: `${newTrip.driver} confirmó el viaje. Ya se muestra en el mapa.`,
          });
        }, 6000);
        return newTrip;
      },
      updateTripStatus: (tripId, status) => {
        updateTrips((prev) =>
          prev.map((trip) =>
            trip.id === tripId
              ? {
                  ...trip,
                  status,
                  progress: status === "Entregado" ? 100 : trip.progress,
                }
              : trip,
          ),
        );
        if (status === "Entregado") {
          const trip = trips.find((item) => item.id === tripId);
          resolveSyncAlertsByTrip(tripId, trip?.vehiclePlate);
          toast.success(`Viaje ${tripId} finalizado. Alertas asociadas resueltas.`);
        }
      },
      cancelTrip: (tripId) => {
        updateTrips((prev) =>
          prev.map((trip) =>
            trip.id === tripId
              ? {
                  ...trip,
                  status: "Cancelado",
                  progress: 0,
                }
              : trip,
          ),
        );
        toast.warning(`Viaje ${tripId} cancelado`);
      },
      removeTrip: (tripId) => {
        updateTrips((prev) => prev.filter((trip) => trip.id !== tripId));
        toast.message(`Viaje ${tripId} eliminado`);
      },
      addUser: (input) => {
        const user: AppUser = {
          id: buildId("USR", users.length + 1),
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          role: input.role,
          status: "Activo",
          zoneId: input.zoneId,
        };
        updateUsers((prev) => [user, ...prev]);
        setAuditLogs((prev) => [{ id: prev.length + 1, dateTime: new Date().toLocaleString("sv-SE"), user: "admin@transportefighera.com", ip: "190.123.45.67", action: `Creó usuario ${user.email}` }, ...prev]);
        toast.success(`Usuario ${user.name} creado`);
        return user;
      },
      updateUserStatus: (userId, status) => {
        updateUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, status } : user)));
      },
      removeUser: (userId) => {
        updateUsers((prev) => prev.filter((user) => user.id !== userId));
        updateDocuments((prev) => prev.filter((doc) => !(doc.entityType === "user" && doc.entityId === userId)));
        setInvoices((prev) => prev.filter((invoice) => invoice.driverId !== userId));
      },
      addVehicle: (input) => {
        if (!input.plate.trim()) return null;
        const vehicle: Vehicle = {
          id: buildId("VH", vehicles.length + 1),
          plate: input.plate.trim().toUpperCase(),
          type: input.type,
          zoneId: input.zoneId,
          brand: input.brand.trim(),
          model: input.model.trim(),
          status: "Activo",
        };
        updateVehicles((prev) => [vehicle, ...prev]);
        toast.success(`Vehículo ${vehicle.plate} creado`);
        return vehicle;
      },
      updateVehicleStatus: (vehicleId, status) => {
        updateVehicles((prev) => prev.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, status } : vehicle)));
        toast.message(`Estado de vehículo actualizado a ${status}`);
      },
      removeVehicle: (vehicleId) => {
        updateVehicles((prev) => prev.filter((vehicle) => vehicle.id !== vehicleId));
        updateDocuments((prev) => prev.filter((doc) => !(doc.entityType === "vehicle" && doc.entityId === vehicleId)));
      },
      addDocument: (input) => {
        if (!input.entityId || !input.documentType || !input.expiresAt || !input.fileName) return null;
        const today = new Date();
        const exp = new Date(input.expiresAt);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status: DocumentRecord["status"] = days < 0 ? "Vencido" : days <= 30 ? "Próximo a vencer" : "Vigente";
        const doc: DocumentRecord = {
          id: buildId("DOC", documents.length + 1),
          entityType: input.entityType,
          entityId: input.entityId,
          documentType: input.documentType,
          expiresAt: input.expiresAt,
          status,
          notes: input.notes.trim(),
          fileName: input.fileName,
          fileType: input.fileType,
          fileSizeKb: input.fileSizeKb,
          uploadedAt: new Date().toISOString().slice(0, 16),
        };
        updateDocuments((prev) => [doc, ...prev]);
        toast.success(`Documento ${doc.documentType} cargado`);
        return doc;
      },
      removeDocument: (documentId) => {
        updateDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      },
      addInvoice: (input) => {
        const driver = users.find((user) => user.id === input.driverId && user.role === "Chofer");
        if (!driver || !input.fileName || !input.period.trim()) return null;
        const invoice: DriverInvoice = {
          id: buildId("FAC", invoices.length + 1),
          driverId: driver.id,
          driverName: driver.name,
          period: input.period.trim(),
          amount: input.amount,
          uploadedAt: new Date().toISOString().slice(0, 16),
          status: "Cargada",
          fileName: input.fileName,
          fileType: input.fileType,
          fileSizeKb: input.fileSizeKb,
        };
        setInvoices((prev) => [invoice, ...prev]);
        toast.success(`Factura ${invoice.id} cargada para ${invoice.driverName}`);
        window.setTimeout(() => {
          setInvoices((prev) =>
            prev.map((item) =>
              item.id === invoice.id
                ? { ...item, status: "Firmada", signedAt: new Date().toISOString().slice(0, 16) }
                : item,
            ),
          );
          toast.message(`Chofer firmó ${invoice.id}`, {
            description: `${invoice.driverName} firmó la factura desde la app móvil.`,
          });
        }, 6000);
        return invoice;
      },
      markInvoiceSigned: (invoiceId) => {
        setInvoices((prev) =>
          prev.map((item) =>
            item.id === invoiceId
              ? { ...item, status: "Firmada", signedAt: new Date().toISOString().slice(0, 16) }
              : item,
          ),
        );
      },
      setExpirationRules: (rules) => {
        updateExpirationRules(() => rules);
      },
      resetDemoData: () => {
        performFullDemoReset();
      },
    }),
    [trips, users, vehicles, documents, auditLogs, invoices, expirationRules],
  );

  return <OperationsDataContext.Provider value={value}>{children}</OperationsDataContext.Provider>;
}

export function useOperationsData() {
  const context = useContext(OperationsDataContext);
  if (!context) {
    throw new Error("useOperationsData must be used within OperationsDataProvider");
  }
  return context;
}

