import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CalendarClock,
  Car,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  FlaskConical,
  FileBadge,
  FileText,
  Fuel,
  Map,
  MapPin,
  Navigation,
  PenTool,
  Route,
  DollarSign,
  Truck,
  Upload,
  User,
  Wrench,
  Wifi,
  WifiOff,
  X,
  ChevronDown,
  ChevronRight,
  Download,
  Trash2
} from 'lucide-react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { LatLngExpression, divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import type { TripStage } from './components/modules/TripStageStepper';
import { appendCriticalAlert, getSyncDocuments, getSyncTrips, getSyncUsers, getSyncVehicles, requestGlobalDemoReset, setSyncTrips, SyncTrip, TRIPS_KEY } from './lib/sync-store';
import { buildPathForStopCount, formatTripRouteStops } from './lib/trip-route';

type TripStatus = 'sin-chofer' | 'asignado' | 'aceptado' | 'en-planta' | 'en-ruta' | 'completado' | 'cancelado';
type Screen = 'ruta' | 'historial' | 'rrhh' | 'perfil';
type RouteEventType = 'incidente' | 'retraso' | 'desvio' | 'parada';
type ExpenseCategory = 'peajes' | 'combustible' | 'gomeria' | 'fitosanitario' | 'otros';
type TripDocType = 'Remito' | 'Ticket' | 'Gasto' | 'Otro';

const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  peajes: 'Peajes',
  combustible: 'Combustible',
  gomeria: 'Gomería',
  fitosanitario: 'Fitosanitario',
  otros: 'Otros'
};

const routeEventMeta: Record<RouteEventType, { label: string; helper: string }> = {
  incidente: { label: 'Incidente', helper: 'Accidente, riesgo o situación crítica' },
  retraso: { label: 'Retraso', helper: 'Demora operativa por carga, tránsito o espera' },
  desvio: { label: 'Desvío', helper: 'Cambio no planificado de la ruta asignada' },
  parada: { label: 'Parada', helper: 'Detención operativa o técnica en ruta' },
};

type RoutePushReminder = {
  tripId: string;
  type: Extract<RouteEventType, 'desvio' | 'parada'>;
  title: string;
  description: string;
};

interface Trip {
  id: string;
  driverId?: string;
  driver: string;
  zoneId: string;
  stage: TripStage;
  vehiclePlate: string;
  fechaProgramada: string;
  origen: string;
  destino: string;
  /** Paradas en orden (sincronizado con panel). */
  routeStops?: string[];
  carga: string;
  distancia: string;
  eta: string;
  plan: string;
  estado: TripStatus;
  /** Cliente / empresa (sincronizado con panel). */
  clientCompany?: string;
  /** Plan de carga manual o ID AUTO-* (sincronizado con panel). */
  remitoNumber?: string;
  timeline: Array<{ timestamp: string; descripcion: string }>;
  alertas: Array<{ tipo: RouteEventType; descripcion: string; timestamp: string }>;
  routePath: LatLngExpression[];
  progress: number;
  evidencias: Array<{
    id?: string;
    tripId?: string;
    name?: string;
    type?: TripDocType;
    url?: string;
    date?: string;
    uploadedBy?: string;
    tipo: string;
    nombre: string;
    fecha: string;
    source?: 'admin' | 'chofer';
  }>;
}

interface Document {
  id: string;
  tipo: string;
  vencimiento: Date;
  estado: 'verde' | 'amarillo' | 'rojo';
}

interface Receipt {
  id: string;
  mes: string;
  fecha: string;
  firmado: boolean;
}

interface VehicleDocument {
  id: string;
  vehiclePlate: string;
  documentType: 'VTV' | 'Seguro del Vehículo' | 'Habilitación' | 'Póliza de Carga';
  fileName: string;
  status: 'vigente' | 'proximo' | 'vencido';
  expiresAt: string;
}

type SyncedUserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  zoneId?: string;
};

const STAGE_FLOW: Array<{ id: TripStage; label: string }> = [
  { id: 'aceptado', label: 'Aceptar viaje' },
  { id: 'balanza', label: 'Llegada a balanza' },
  { id: 'inicio-carga', label: 'Inicio de carga' },
  { id: 'fin-carga', label: 'Fin de carga' },
  { id: 'en-ruta', label: 'En ruta' },
  { id: 'llegada', label: 'Llegada a destino' },
];

function getPositionByProgress(path: LatLngExpression[], progress: number): LatLngExpression {
  if (path.length < 2) return path[0];
  const pct = Math.max(0, Math.min(progress, 100)) / 100;
  const segments = path.length - 1;
  const scaled = pct * segments;
  const segmentIndex = Math.min(Math.floor(scaled), segments - 1);
  const localProgress = scaled - segmentIndex;
  const [latA, lngA] = path[segmentIndex] as [number, number];
  const [latB, lngB] = path[segmentIndex + 1] as [number, number];
  return [latA + (latB - latA) * localProgress, lngA + (lngB - lngA) * localProgress];
}

function tripIcon(plate: string) {
  return divIcon({
    className: 'mobile-trip-pin-wrapper',
    html: `<div style="display:flex;align-items:center;gap:4px;background:#0f172a;color:#fff;padding:2px 6px;border-radius:999px;font-size:10px;"><span>🚚</span><span>${plate}</span></div>`,
    iconSize: [72, 24],
    iconAnchor: [12, 12]
  });
}

function routeStopIcon(kind: 'start' | 'mid' | 'end', order: number) {
  const bg = kind === 'start' ? '#2563eb' : kind === 'end' ? '#059669' : '#0f172a';
  return divIcon({
    className: 'mobile-route-stop-marker',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;background:${bg};border:2px solid #fff;border-radius:999px;color:#fff;font-size:10px;font-weight:700;box-shadow:0 2px 8px rgba(15,23,42,.35);">${order}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function getTripStops(trip: Pick<Trip, 'routeStops' | 'origen' | 'destino'>): string[] {
  const list = Array.isArray(trip.routeStops)
    ? trip.routeStops.map((stop) => String(stop).trim()).filter(Boolean)
    : [];
  if (list.length >= 2) return list;
  return [trip.origen, trip.destino].map((stop) => String(stop ?? '').trim()).filter(Boolean);
}

function RouteBoundsController({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1])) as [number, number][];
    if (!valid.length) return;
    if (valid.length === 1) {
      map.setView(valid[0], 11, { animate: true });
      return;
    }
    map.fitBounds(valid, { padding: [28, 28], maxZoom: 12, animate: true });
  }, [map, points]);
  return null;
}

function normalizeDriverName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizeIncomingSyncStatus(raw: string | undefined): SyncTrip['status'] {
  if (!raw || typeof raw !== 'string') return 'Asignado';
  const lower = raw.trim().toLowerCase();
  if (lower === 'pendiente' || lower === 'pendiente de aceptación') return 'Asignado';
  const legacy: Record<string, SyncTrip['status']> = {
    'En Ruta': 'En ruta',
    'En Planta': 'En planta',
    Cargando: 'En planta',
  };
  if (legacy[raw]) return legacy[raw];
  const allowed: SyncTrip['status'][] = ['Sin chofer', 'Asignado', 'Aceptado', 'En planta', 'En ruta', 'Entregado', 'Cancelado', 'Reprogramado'];
  return (allowed as string[]).includes(raw) ? (raw as SyncTrip['status']) : 'Asignado';
}

function normalizeTripDocs(tripId: string, raw: unknown) {
  if (!Array.isArray(raw)) return [] as Trip['evidencias'];
  const docs = raw.filter((d): d is Record<string, unknown> => d !== null && typeof d === 'object');
  return docs.map((doc, idx) => {
    const id = typeof doc.id === 'string' && doc.id ? doc.id : `TD-${tripId}-${idx}-${Math.random().toString(36).slice(2, 9)}`;
    const typeRaw = String(doc.type ?? doc.tipo ?? 'Otro');
    const type: TripDocType = typeRaw === 'Remito' || typeRaw === 'Ticket' || typeRaw === 'Gasto' || typeRaw === 'Otro' ? typeRaw : 'Otro';
    const name = String(doc.name ?? doc.nombre ?? 'documento.pdf');
    const date = String(doc.date ?? doc.fecha ?? new Date().toLocaleString('es-AR'));
    const uploadedBy = String(doc.uploadedBy ?? (doc.source === 'chofer' ? 'chofer' : 'admin'));
    return {
      id,
      tripId,
      name,
      type,
      url: String(doc.url ?? `local://${id}`),
      date,
      uploadedBy,
      tipo: type,
      nombre: name,
      fecha: date,
      source: uploadedBy === 'chofer' ? 'chofer' : 'admin',
    };
  });
}

function mapTripToSync(trip: Trip): SyncTrip {
  const routeStops =
    trip.routeStops && trip.routeStops.length >= 2 ? trip.routeStops : [trip.origen, trip.destino].filter(Boolean);
  return {
    id: trip.id,
    zoneId: trip.zoneId,
    driverId: trip.driverId,
    driver: trip.driver,
    vehiclePlate: trip.vehiclePlate,
    origin: trip.origen,
    destination: trip.destino,
    routeStops,
    routePath: trip.routePath,
    progress: trip.progress,
    status:
      trip.estado === 'sin-chofer'
        ? 'Sin chofer'
        : trip.estado === 'asignado'
          ? 'Asignado'
          : trip.estado === 'aceptado'
            ? 'Aceptado'
            : trip.estado === 'en-ruta'
              ? 'En ruta'
              : trip.estado === 'completado'
                ? 'Entregado'
                : trip.estado === 'cancelado'
                  ? 'Cancelado'
                  : 'En planta',
    cargo: trip.carga,
    plan: trip.plan,
    scheduledAt: trip.fechaProgramada,
    clientCompany: trip.clientCompany?.trim() || undefined,
    remitoNumber: trip.remitoNumber?.trim() || undefined,
    timeline: trip.timeline,
    evidencias: normalizeTripDocs(trip.id, trip.evidencias)
  };
}

function mapSyncToMobileTrip(syncTrip: SyncTrip): Trip {
  const normalizedStatus = normalizeIncomingSyncStatus(syncTrip.status as unknown as string);
  const stops =
    syncTrip.routeStops && syncTrip.routeStops.length >= 2
      ? syncTrip.routeStops.map((s) => String(s).trim()).filter(Boolean)
      : [syncTrip.origin, syncTrip.destination].filter(Boolean);
  const origen = stops[0] ?? syncTrip.origin;
  const destino = stops[stops.length - 1] ?? syncTrip.destination;
  return {
    id: syncTrip.id,
    driverId: syncTrip.driverId,
    driver: syncTrip.driver,
    zoneId: syncTrip.zoneId,
    stage: normalizedStatus === 'En ruta' ? 'en-ruta' : normalizedStatus === 'Entregado' ? 'llegada' : 'aceptado',
    vehiclePlate: syncTrip.vehiclePlate,
    fechaProgramada: syncTrip.scheduledAt,
    origen,
    destino,
    routeStops: stops.length >= 2 ? stops : undefined,
    carga: syncTrip.cargo,
    distancia: `${Math.max(50, Math.round((syncTrip.routePath.length || 2) * 90))} km`,
    eta: "3h 30m",
    plan: syncTrip.plan,
    estado:
      normalizedStatus === 'Sin chofer'
        ? 'sin-chofer'
        : normalizedStatus === 'Asignado' || normalizedStatus === 'Reprogramado'
          ? 'asignado'
          : normalizedStatus === 'Aceptado'
            ? 'aceptado'
            : normalizedStatus === 'En ruta'
              ? 'en-ruta'
              : normalizedStatus === 'Entregado'
                ? 'completado'
                : normalizedStatus === 'Cancelado'
                  ? 'cancelado'
                  : 'en-planta',
    clientCompany: syncTrip.clientCompany?.trim() || 'Cliente general',
    remitoNumber: syncTrip.remitoNumber?.trim() || `REM-${syncTrip.id}`,
    timeline: syncTrip.timeline && syncTrip.timeline.length ? syncTrip.timeline : [{ timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), descripcion: 'Viaje sincronizado desde panel.' }],
    alertas: [],
    routePath: syncTrip.routePath,
    progress: syncTrip.progress,
    evidencias: normalizeTripDocs(syncTrip.id, syncTrip.evidencias)
  };
}

function normalizePlate(plate: string) {
  return plate.replace(/-/g, '').toUpperCase();
}

function parseTripScheduleToMs(value: string) {
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate.getTime();
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (match) {
    const [, dd, mm, yyyy, hh, min] = match;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return parsed.getTime();
  }
  return Number.MAX_SAFE_INTEGER;
}

const initialMobileTrips: Trip[] = [
  {
    id: 'VJ-2026-001234',
    driver: 'Juan Pérez',
    zoneId: 'zona-argentina',
    stage: 'aceptado',
    vehiclePlate: 'AB-123-CD',
    fechaProgramada: '30/04/2026 12:00',
    origen: 'Planta Central - Buenos Aires',
    destino: 'Rosario, Santa Fe',
    carga: 'Maquinaria Agrícola - 24 Ton',
    distancia: '305 km',
    eta: '4h 15m',
    plan: 'Carga en balanza A, salida por acceso norte, entrega en depósito 2.',
    estado: 'asignado',
    timeline: [{ timestamp: '11:00', descripcion: 'Viaje asignado desde panel ERP.' }],
    alertas: [],
    routePath: [
      [-34.6037, -58.3816],
      [-34.68, -59.2],
      [-33.9, -60.5],
      [-32.9468, -60.6393]
    ],
    progress: 0,
    evidencias: []
  },
  {
    id: 'VJ-2026-001235',
    driver: 'Juan Pérez',
    zoneId: 'zona-argentina',
    stage: 'aceptado',
    vehiclePlate: 'AC-987-ZT',
    fechaProgramada: '30/04/2026 16:00',
    origen: 'Planta Norte - San Nicolás',
    destino: 'Venado Tuerto, Santa Fe',
    carga: 'Insumos industriales - 18 Ton',
    distancia: '198 km',
    eta: '3h 10m',
    plan: 'Esperar liberación de playa, validar remito y mantener contacto con tráfico.',
    estado: 'asignado',
    timeline: [{ timestamp: '11:05', descripcion: 'Viaje asignado desde panel ERP.' }],
    alertas: [],
    routePath: [
      [-33.3358, -60.225],
      [-33.4, -60.7],
      [-33.55, -61.5],
      [-33.7456, -61.9688]
    ],
    progress: 0,
    evidencias: []
  }
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState('juan.perez@transportefighera.com');
  const [loginPassword, setLoginPassword] = useState('123456');
  const [currentDriverId, setCurrentDriverId] = useState('driver-juan');
  const [currentDriverName, setCurrentDriverName] = useState('Juan Pérez');
  const previousTripIdsRef = useRef<string[]>([]);
  const [activeScreen, setActiveScreen] = useState<Screen>('ruta');
  const [isOnline, setIsOnline] = useState(true);
  const [showMapScreen, setShowMapScreen] = useState(false);
  const [expandedTripIds, setExpandedTripIds] = useState<string[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hasHydratedTripsFromSync, setHasHydratedTripsFromSync] = useState(false);
  const [canWriteTripsToSync, setCanWriteTripsToSync] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [photoType, setPhotoType] = useState<'remito-inicial' | 'remito-final'>('remito-inicial');
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('peajes');
  const [expenseTicketRawKb, setExpenseTicketRawKb] = useState<number | null>(null);
  const [expenseTicketFinalKb, setExpenseTicketFinalKb] = useState<number | null>(null);
  const [remitoRawKb, setRemitoRawKb] = useState<number | null>(null);
  const [remitoFinalKb, setRemitoFinalKb] = useState<number | null>(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState<string | null>(null);
  const [tripDocModalTripId, setTripDocModalTripId] = useState<string | null>(null);
  const [tripDocForm, setTripDocForm] = useState<{ type: TripDocType; name: string; url: string }>({ type: 'Remito', name: '', url: '' });
  const [tripDocUploading, setTripDocUploading] = useState(false);
  const [tripDocMockAttachment, setTripDocMockAttachment] = useState<string | null>(null);
  const [selectedEvidenceUpdate, setSelectedEvidenceUpdate] = useState<{ tripId: string; evidenceId: string } | null>(null);
  const [eventDescription, setEventDescription] = useState('');
  const [selectedRouteEventType, setSelectedRouteEventType] = useState<RouteEventType | null>(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([]);
  const [showVehicleDocsModal, setShowVehicleDocsModal] = useState(false);
  const [routePushReminder, setRoutePushReminder] = useState<RoutePushReminder | null>(null);
  const lastPushReminderKeyRef = useRef<string | null>(null);
  const lastRouteEventReportAtRef = useRef<Record<string, number>>({});
  const [fallbackVehicleDocuments] = useState<VehicleDocument[]>([
    { id: 'VD-001', vehiclePlate: 'AB-123-CD', documentType: 'VTV', fileName: 'vtv_ab123cd.pdf', status: 'vigente', expiresAt: '2026-12-10' },
    { id: 'VD-002', vehiclePlate: 'AB-123-CD', documentType: 'Seguro del Vehículo', fileName: 'seguro_ab123cd.pdf', status: 'proximo', expiresAt: '2026-05-20' },
    { id: 'VD-003', vehiclePlate: 'AB-123-CD', documentType: 'Habilitación', fileName: 'habilitacion_ab123cd.pdf', status: 'vigente', expiresAt: '2026-10-01' },
    { id: 'VD-004', vehiclePlate: 'AB-123-CD', documentType: 'Póliza de Carga', fileName: 'poliza_carga_ab123cd.pdf', status: 'vigente', expiresAt: '2026-09-14' },
    { id: 'VD-005', vehiclePlate: 'AC-987-ZT', documentType: 'VTV', fileName: 'vtv_ac987zt.pdf', status: 'vigente', expiresAt: '2026-11-01' },
    { id: 'VD-006', vehiclePlate: 'AC-987-ZT', documentType: 'Seguro del Vehículo', fileName: 'seguro_ac987zt.pdf', status: 'vigente', expiresAt: '2026-08-30' },
    { id: 'VD-007', vehiclePlate: 'AC-987-ZT', documentType: 'Habilitación', fileName: 'habilitacion_ac987zt.pdf', status: 'proximo', expiresAt: '2026-06-05' },
    { id: 'VD-008', vehiclePlate: 'AC-987-ZT', documentType: 'Póliza de Carga', fileName: 'poliza_carga_ac987zt.pdf', status: 'vigente', expiresAt: '2026-10-22' }
  ]);
  const [syncedVehicleRecords, setSyncedVehicleRecords] = useState<Array<{ id: string; plate: string }>>([]);
  const [syncedDocumentRecords, setSyncedDocumentRecords] = useState<Array<{ entityType: string; entityId: string; documentType: string; fileName: string; expiresAt: string; status?: string }>>([]);
  const [syncedUserRecords, setSyncedUserRecords] = useState<SyncedUserRecord[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const documents: Document[] = [
    {
      id: 'lic',
      tipo: 'Licencia de Conducir',
      vencimiento: new Date('2026-12-15'),
      estado: 'verde'
    },
    {
      id: 'psico',
      tipo: 'Psicofísico',
      vencimiento: new Date('2026-05-20'),
      estado: 'amarillo'
    },
    {
      id: 'seguro',
      tipo: 'Seguro del Camión',
      vencimiento: new Date('2026-04-15'),
      estado: 'rojo'
    },
  ];

  const [receipts, setReceipts] = useState<Receipt[]>([
    { id: 'rec-04', mes: 'Abril 2026', fecha: '30/04/2026', firmado: false },
    { id: 'rec-03', mes: 'Marzo 2026', fecha: '31/03/2026', firmado: true },
    { id: 'rec-02', mes: 'Febrero 2026', fecha: '28/02/2026', firmado: true },
  ]);

  const driverProfiles = useMemo(
    () => {
      const syncedDrivers = syncedUserRecords
        .filter((user) => user.role === 'Chofer' && user.status === 'Activo')
        .map((user) => ({ id: user.id, email: user.email.toLowerCase(), driverName: user.name }));
      if (syncedDrivers.length) return syncedDrivers;
      return [{ id: 'driver-juan', email: 'juan.perez@transportefighera.com', driverName: 'Juan Pérez' }];
    },
    [syncedUserRecords]
  );

  const activeDriverProfile = useMemo(
    () => driverProfiles.find((profile) => profile.driverName === currentDriverName) ?? null,
    [currentDriverName, driverProfiles]
  );
  const driverInitials = useMemo(
    () =>
      currentDriverName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'CH',
    [currentDriverName]
  );

  const vehicleDocuments = useMemo<VehicleDocument[]>(() => {
    if (!syncedVehicleRecords.length || !syncedDocumentRecords.length) return fallbackVehicleDocuments;
    const docs = syncedDocumentRecords
      .filter((doc) => doc.entityType === 'vehicle')
      .map((doc, index) => {
        const vehicle = syncedVehicleRecords.find((item) => item.id === doc.entityId);
        if (!vehicle) return null;
        return {
          id: `SYNC-VD-${index}`,
          vehiclePlate: vehicle.plate,
          documentType: (doc.documentType as VehicleDocument['documentType']) ?? 'VTV',
          fileName: doc.fileName,
          status:
            doc.status === 'Vencido' ? 'vencido' : doc.status === 'Próximo a vencer' ? 'proximo' : 'vigente',
          expiresAt: doc.expiresAt
        } as VehicleDocument;
      })
      .filter(Boolean) as VehicleDocument[];
    return docs.length ? docs : fallbackVehicleDocuments;
  }, [fallbackVehicleDocuments, syncedDocumentRecords, syncedVehicleRecords]);

  const isTripForCurrentDriver = (trip: Trip) => {
    const matchById = Boolean(trip.driverId) && trip.driverId === currentDriverId;
    const matchByName = normalizeDriverName(trip.driver) === normalizeDriverName(currentDriverName);
    return matchById || matchByName;
  };

  const tripHistory = useMemo(
    () =>
      trips
        .filter(
          (trip) =>
            isTripForCurrentDriver(trip) &&
            (trip.estado === 'completado' || trip.estado === 'cancelado')
        )
        .map((trip) => ({
          id: trip.id,
          fecha: trip.fechaProgramada,
          ruta: formatTripRouteStops(trip.routeStops, trip.origen, trip.destino),
          estado: trip.estado === 'completado' ? 'Completado' : 'Cancelado'
        })),
    [currentDriverId, currentDriverName, trips]
  );

  const openHistorialPrintSheet = () => {
    const esc = (s: string) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const list = trips.filter(
      (trip) => isTripForCurrentDriver(trip) && (trip.estado === 'completado' || trip.estado === 'cancelado')
    );
    const rows = list
      .map(
        (trip) =>
          `<tr><td>${esc(trip.id)}</td><td>${esc(trip.fechaProgramada)}</td><td>${esc(trip.clientCompany ?? '')}</td><td class="mono">${esc(
            trip.remitoNumber ?? ''
          )}</td><td>${esc(trip.vehiclePlate)}</td><td>${esc(
            formatTripRouteStops(trip.routeStops, trip.origen, trip.destino)
          )}</td><td>${esc(trip.estado === 'completado' ? 'Entregado' : 'Cancelado')}</td></tr>`
      )
      .join('');
    const table = list.length
      ? `<table><thead><tr><th>ID</th><th>Fecha</th><th>Cliente</th><th>Nº plan</th><th>Camión</th><th>Ruta</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p>Sin viajes en historial.</p>';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Historial viajes</title><style>body{font:12px system-ui;color:#000;padding:16px}.mono{font-family:ui-monospace,monospace}table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:6px;text-align:left}</style></head><body><h2>Transportes Fighera — Historial</h2><p>Chofer: ${esc(
      currentDriverName
    )}</p>${table}<script>addEventListener('load',function(){setTimeout(function(){print();},300);});</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('No se pudo abrir la ventana de impresión. Revisá el bloqueo de popups.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  useEffect(() => {
    const synced = getSyncTrips();
    setSyncedUserRecords(getSyncUsers<SyncedUserRecord>());
    setSyncedVehicleRecords(getSyncVehicles<{ id: string; plate: string }>());
    setSyncedDocumentRecords(
      getSyncDocuments<{ entityType: string; entityId: string; documentType: string; fileName: string; expiresAt: string; status?: string }>()
    );
    if (synced.length) {
      setTrips(synced.map(mapSyncToMobileTrip));
      setCanWriteTripsToSync(true);
    } else {
      setTrips([]);
      setCanWriteTripsToSync(false);
    }
    setHasHydratedTripsFromSync(true);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== TRIPS_KEY) return;
      const synced = getSyncTrips();
      if (synced.length) {
        setTrips(synced.map(mapSyncToMobileTrip));
        setCanWriteTripsToSync(true);
      }
    };
    const onStorageCollections = (event: StorageEvent) => {
      if (!event.key || event.key === 'tf_sync_vehicles_v1') {
        setSyncedVehicleRecords(getSyncVehicles<{ id: string; plate: string }>());
      }
      if (!event.key || event.key === 'tf_sync_users_v1') {
        setSyncedUserRecords(getSyncUsers<SyncedUserRecord>());
      }
      if (!event.key || event.key === 'tf_sync_documents_v1') {
        setSyncedDocumentRecords(
          getSyncDocuments<{ entityType: string; entityId: string; documentType: string; fileName: string; expiresAt: string; status?: string }>()
        );
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('storage', onStorageCollections);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('storage', onStorageCollections);
    };
  }, []);

  useEffect(() => {
    const currentLogin = loginEmail.trim().toLowerCase();
    const profile = driverProfiles.find((item) => item.email === currentLogin);
    if (profile && profile.driverName !== currentDriverName) {
      setCurrentDriverName(profile.driverName);
      setCurrentDriverId(profile.id);
    }
  }, [currentDriverName, driverProfiles, loginEmail]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, [showSignatureModal]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const compressMockFile = (rawKb: number) => {
    if (rawKb <= 500) return { rawKb, finalKb: rawKb, compressed: false };
    return { rawKb, finalKb: 500, compressed: true };
  };

  const saveSignature = () => {
    if (selectedReceipt) {
      setReceipts((prev) => prev.map((receipt) => (receipt.id === selectedReceipt ? { ...receipt, firmado: true } : receipt)));
    }
    toast.success('Firma guardada correctamente');
    setShowSignatureModal(false);
    setSelectedReceipt(null);
  };

  const activeTrip = useMemo(
    () => trips.find((trip) => trip.id === activeTripId && trip.estado !== 'completado' && trip.estado !== 'cancelado') ?? null,
    [activeTripId, trips]
  );
  const activeTripStops = useMemo(
    () => (activeTrip ? getTripStops(activeTrip) : []),
    [activeTrip]
  );
  const activeTripStopPoints = useMemo(() => {
    if (!activeTrip || !activeTripStops.length) return [] as LatLngExpression[];
    if (!Array.isArray(activeTrip.routePath) || activeTrip.routePath.length < 2) return activeTrip.routePath;
    return buildPathForStopCount(activeTrip.routePath, Math.max(2, activeTripStops.length));
  }, [activeTrip, activeTripStops]);
  const activeTripCurrentStopIndex = useMemo(() => {
    if (!activeTripStops.length) return 0;
    const idx = Math.round((Math.max(0, Math.min(activeTrip?.progress ?? 0, 100)) / 100) * (activeTripStops.length - 1));
    return Math.max(0, Math.min(activeTripStops.length - 1, idx));
  }, [activeTrip?.progress, activeTripStops]);
  const activeTripCurrentStageIndex = useMemo(
    () => STAGE_FLOW.findIndex((step) => step.id === activeTrip?.stage),
    [activeTrip?.stage]
  );
  const activeTripNextStage = useMemo(
    () => (activeTripCurrentStageIndex >= 0 ? STAGE_FLOW[activeTripCurrentStageIndex + 1] ?? null : null),
    [activeTripCurrentStageIndex]
  );

  const pendingTrips = useMemo(
    () =>
      trips.filter(
        (trip) =>
          isTripForCurrentDriver(trip) &&
          trip.estado !== 'completado' &&
          trip.estado !== 'cancelado'
      )
      .sort((a, b) => {
        const aInProgress = a.estado === 'en-ruta' ? 1 : 0;
        const bInProgress = b.estado === 'en-ruta' ? 1 : 0;
        if (aInProgress !== bInProgress) return bInProgress - aInProgress;
        return parseTripScheduleToMs(a.fechaProgramada) - parseTripScheduleToMs(b.fechaProgramada);
      }),
    [currentDriverId, currentDriverName, trips]
  );

  const hasTripInProgress = useMemo(() => pendingTrips.some((trip) => trip.estado === 'en-ruta'), [pendingTrips]);
  const operationalStates: TripStatus[] = ['aceptado', 'en-planta', 'en-ruta'];
  const hasOperationalTrip = useMemo(() => pendingTrips.some((trip) => operationalStates.includes(trip.estado)), [pendingTrips]);

  useEffect(() => {
    if (!activeTripId && pendingTrips.length > 0) {
      setActiveTripId(pendingTrips[0].id);
    }
  }, [activeTripId, pendingTrips]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const currentIds = pendingTrips.map((trip) => trip.id);
    const previousIds = previousTripIdsRef.current;
    const newTrips = pendingTrips.filter((trip) => !previousIds.includes(trip.id));
    if (newTrips.length) {
      newTrips.forEach((trip) => {
        toast.info(`Nuevo viaje asignado: ${trip.id}`, {
          description: `${formatTripRouteStops(trip.routeStops, trip.origen, trip.destino)} · Camión ${trip.vehiclePlate}`
        });
      });
    }
    previousTripIdsRef.current = currentIds;
  }, [isAuthenticated, pendingTrips]);

  useEffect(() => {
    if (!activeTripId) return;
    const selected = trips.find((trip) => trip.id === activeTripId);
    if (!selected || selected.estado !== 'en-ruta') return;

    const timer = window.setInterval(() => {
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === activeTripId && trip.estado === 'en-ruta'
            ? { ...trip, progress: Math.min(trip.progress + 3, 92) }
            : trip
        )
      );
    }, 5000);

    return () => window.clearInterval(timer);
  }, [activeTripId, trips]);

  useEffect(() => {
    const selected = trips.find((trip) => trip.id === activeTripId);
    if (!selected || selected.estado !== 'en-ruta') {
      setRoutePushReminder(null);
      return;
    }
    const lastReportAt = lastRouteEventReportAtRef.current[selected.id] ?? 0;
    if (Date.now() - lastReportAt < 4000) {
      return;
    }
    const hasReportedDeviation = selected.alertas.some((alerta) => alerta.tipo === 'desvio');
    const hasReportedStop = selected.alertas.some((alerta) => alerta.tipo === 'parada');

    const nextReminder: RoutePushReminder | null =
      selected.progress >= 30 && !hasReportedStop
        ? {
            tripId: selected.id,
            type: 'parada',
            title: 'Hemos detectado una parada extendida',
            description: 'Si la detención no estaba planificada, reporta Parada para informar a operaciones.',
          }
        : selected.progress >= 12 && !hasReportedDeviation
          ? {
              tripId: selected.id,
              type: 'desvio',
              title: 'Hemos detectado un desvío de tu ruta',
              description: 'Reporta Desvío para actualizar a operaciones en tiempo real.',
            }
          : null;

    setRoutePushReminder(nextReminder);

    if (nextReminder) {
      const reminderKey = `${nextReminder.tripId}-${nextReminder.type}`;
      if (lastPushReminderKeyRef.current !== reminderKey) {
        lastPushReminderKeyRef.current = reminderKey;
        toast.warning(nextReminder.title, {
          description: nextReminder.description,
        });
      }
    } else {
      lastPushReminderKeyRef.current = null;
    }
  }, [activeTripId, trips]);

  useEffect(() => {
    if (!hasHydratedTripsFromSync || !canWriteTripsToSync) return;
    const next = trips.map(mapTripToSync);
    const current = getSyncTrips();
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    setSyncTrips(next);
  }, [canWriteTripsToSync, hasHydratedTripsFromSync, trips]);

  const updateTrip = (tripId: string, recipe: (trip: Trip) => Trip) => {
    setTrips((prev) => prev.map((trip) => (trip.id === tripId ? recipe(trip) : trip)));
  };

  const appendTimeline = (trip: Trip, descripcion: string) => ({
    ...trip,
    timeline: [...trip.timeline, { timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), descripcion }]
  });

  const handleAcceptTrip = (tripId: string) => {
    const tripToAccept = trips.find((trip) => trip.id === tripId);
    if (!tripToAccept) return;
    if (tripToAccept.estado !== 'asignado') {
      toast.info('Este viaje ya fue aceptado o no está pendiente de aceptación.');
      return;
    }
    updateTrip(tripId, (trip) => appendTimeline({ ...trip, estado: 'aceptado', stage: 'aceptado' }, 'Chofer aceptó el viaje.'));
    setActiveTripId(tripId);
    toast.success('Viaje aceptado. Revisa la ruta y presiona iniciar.');
  };

  const canStartTrip = (tripId: string) => {
    const trip = pendingTrips.find((item) => item.id === tripId);
    if (!trip) return false;
    if (trip.estado !== 'aceptado' && trip.estado !== 'en-planta') return false;
    return !pendingTrips.some((item) => item.id !== tripId && operationalStates.includes(item.estado));
  };

  const handleStartTrip = (tripId: string) => {
    if (!canStartTrip(tripId)) {
      toast.error('Debes finalizar tu viaje actual en curso antes de iniciar uno nuevo.');
      return;
    }
    updateTrip(tripId, (trip) =>
      appendTimeline({ ...trip, estado: 'en-ruta', stage: 'en-ruta', progress: Math.max(trip.progress, 15) }, 'Viaje iniciado. GPS activo.')
    );
    setActiveTripId(tripId);
    setShowMapScreen(true);
    toast.success('Viaje en curso. Se activó monitoreo GPS.');
  };

  const handlePhotoCapture = (tripId: string | null) => {
    if (!tripId) return;
    toast.success('Foto capturada correctamente');
    setShowPhotoModal(false);
    const rawSize = Math.floor(Math.random() * 900) + 250;
    const compressed = compressMockFile(rawSize);
    setRemitoRawKb(compressed.rawKb);
    setRemitoFinalKb(compressed.finalKb);
    if (compressed.compressed) {
      toast.info(`Remito comprimido de ${compressed.rawKb}kb a ${compressed.finalKb}kb`);
    }

    if (photoType === 'remito-inicial') {
      updateTrip(tripId, (trip) =>
        appendTimeline(
          {
            ...trip,
            estado: 'en-ruta',
            progress: Math.max(trip.progress, 20),
            evidencias: [
              ...trip.evidencias,
              {
                id: `TD-${trip.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
                tripId: trip.id,
                type: 'Remito',
                name: `remito-inicial-${trip.id}.jpg`,
                url: `local://remito-inicial/${trip.id}`,
                date: new Date().toLocaleString('es-AR'),
                uploadedBy: 'chofer',
                tipo: 'Remito',
                nombre: `remito-inicial-${trip.id}.jpg`,
                fecha: new Date().toLocaleString('es-AR'),
                source: 'chofer',
              }
            ]
          },
          'Remito inicial cargado y salida registrada.'
        )
      );
      toast.info('Salida registrada. GPS activo y viaje en progreso.');
    } else {
      updateTrip(tripId, (trip) =>
        appendTimeline(
          {
            ...trip,
            estado: 'completado',
            progress: 100,
            evidencias: [
              ...trip.evidencias,
              {
                id: `TD-${trip.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
                tripId: trip.id,
                type: 'Remito',
                name: `remito-final-${trip.id}.jpg`,
                url: `local://remito-final/${trip.id}`,
                date: new Date().toLocaleString('es-AR'),
                uploadedBy: 'chofer',
                tipo: 'Remito',
                nombre: `remito-final-${trip.id}.jpg`,
                fecha: new Date().toLocaleString('es-AR'),
                source: 'chofer',
              }
            ]
          },
          'Entrega finalizada con evidencia.'
        )
      );
      if (activeTripId === tripId) {
        setShowMapScreen(false);
      }
      toast.success('¡Viaje completado exitosamente!');
    }
  };

  const handleClosePhotoModal = () => {
    if (photoType === 'remito-final') {
      toast.error('La foto del remito conformado es obligatoria para finalizar el viaje.');
      return;
    }
    setShowPhotoModal(false);
  };

  const handleArrival = (tripId: string) => {
    updateTrip(tripId, (trip) => appendTimeline({ ...trip, progress: 95 }, 'Llegada a destino confirmada.'));
    setPhotoType('remito-final');
    setShowPhotoModal(true);
  };

  const handleRouteEvent = (tripId: string | null, type: RouteEventType) => {
    if (!tripId) return;
    if (eventDescription.trim().length < 8) {
      toast.error('Agrega un detalle breve (mínimo 8 caracteres).');
      return;
    }
    const messages = {
      incidente: 'Incidente reportado al panel operativo.',
      retraso: 'Retraso registrado con notificación a tráfico.',
      desvio: 'Desvío informado y compartido con operaciones.',
      parada: 'Parada reportada para seguimiento operativo.',
    };

    updateTrip(tripId, (trip) => ({
      ...appendTimeline(trip, `${type.toUpperCase()}: ${eventDescription}`),
      alertas: [
        ...trip.alertas,
        {
          tipo: type,
          descripcion: eventDescription,
          timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        }
      ]
    }));

    toast.warning(messages[type]);
    const trip = trips.find((item) => item.id === tripId);
    if (trip) {
      appendCriticalAlert({
        message: `${type.toUpperCase()} · ${trip.id} · ${eventDescription}`,
        tripId: trip.id,
        vehiclePlate: trip.vehiclePlate,
      });
    }
    if (type === 'desvio' || type === 'parada') {
      if (tripId) {
        lastRouteEventReportAtRef.current[tripId] = Date.now();
      }
      setRoutePushReminder((prev) => {
        if (!prev || prev.tripId !== tripId || prev.type !== type) return prev;
        return null;
      });
      lastPushReminderKeyRef.current = null;
    }
    setShowIncidentModal(false);
    setEventDescription('');
    setSelectedRouteEventType(null);

    if (!isOnline) {
      toast.info('Sin conexión. Se sincronizará cuando vuelvas online.');
    }
  };

  const handleAdvanceStage = (tripId: string, nextStage: TripStage) => {
    updateTrip(tripId, (trip) => {
      const stateByStage: Record<TripStage, TripStatus> = {
        aceptado: 'aceptado',
        balanza: 'en-planta',
        'inicio-carga': 'en-planta',
        'fin-carga': 'en-planta',
        'en-ruta': 'en-ruta',
        llegada: 'en-ruta',
      };
      const progressByStage: Record<TripStage, number> = {
        aceptado: 10,
        balanza: 20,
        'inicio-carga': 35,
        'fin-carga': 50,
        'en-ruta': 65,
        llegada: 95,
      };
      return appendTimeline(
        {
          ...trip,
          stage: nextStage,
          estado: stateByStage[nextStage],
          progress: Math.max(trip.progress, progressByStage[nextStage]),
        },
        `Paso operativo registrado: ${nextStage}`
      );
    });
  };

  const handleExpense = () => {
    if (!activeTripId) {
      toast.error('Selecciona un viaje activo para registrar gasto');
      return;
    }
    if (!expenseAmount) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (!expenseTicketFinalKb) {
      toast.error('Captura el ticket antes de guardar');
      return;
    }

    updateTrip(activeTripId, (trip) =>
      appendTimeline(trip, `Gasto registrado: ${expenseCategoryLabels[expenseCategory]} por $${expenseAmount}`)
    );
    toast.success(`Gasto de $${expenseAmount} registrado en ${expenseCategoryLabels[expenseCategory]}`);
    setShowExpenseModal(false);
    setExpenseAmount('');
    setExpenseTicketRawKb(null);
    setExpenseTicketFinalKb(null);

    if (!isOnline) {
      toast.info('Sin conexión. Se sincronizará cuando vuelvas online.');
    }
  };

  const handleExpenseTicketCapture = () => {
    const rawSize = Math.floor(Math.random() * 900) + 300;
    const compressed = compressMockFile(rawSize);
    setExpenseTicketRawKb(compressed.rawKb);
    setExpenseTicketFinalKb(compressed.finalKb);
    if (compressed.compressed) {
      toast.info(`Ticket comprimido automáticamente a ${compressed.finalKb}kb`);
    } else {
      toast.success('Ticket válido (<500kb)');
    }
  };

  const handleDocumentUpload = () => {
    toast.success('Documento cargado correctamente');
    setShowDocumentUpload(null);
  };

  const openTripDocModal = (tripId: string) => {
    setTripDocModalTripId(tripId);
    setTripDocForm({ type: 'Remito', name: '', url: '' });
    setTripDocMockAttachment(null);
  };

  const simulateTripDocumentCapture = (mode: 'camara' | 'galeria') => {
    if (!tripDocModalTripId) return;
    const extension = tripDocForm.type === 'Gasto' ? 'pdf' : 'jpg';
    const generatedName = `${tripDocForm.type.toLowerCase()}-${mode}-${tripDocModalTripId}-${Date.now().toString(36)}.${extension}`;
    setTripDocMockAttachment(generatedName);
    setTripDocForm((prev) => ({
      ...prev,
      name: generatedName,
      url: `local://simulated/${mode}/${tripDocModalTripId}/${Date.now().toString(36)}`,
    }));
    toast.success(`Archivo simulado desde ${mode === 'camara' ? 'cámara' : 'galería'} listo para subir.`);
  };

  const submitTripDocument = async () => {
    if (!tripDocModalTripId) return;
    if (!tripDocMockAttachment) {
      toast.error('Primero simula captura o adjunto del documento.');
      return;
    }
    setTripDocUploading(true);
    await new Promise((resolve) => window.setTimeout(resolve, 800));
    updateTrip(tripDocModalTripId, (trip) =>
      appendTimeline(
        {
          ...trip,
          evidencias: [
            ...trip.evidencias,
            {
              id: `TD-${trip.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
              tripId: trip.id,
              type: tripDocForm.type,
              name: tripDocForm.name.trim(),
              url: tripDocForm.url.trim() || `local://doc/${trip.id}/${Date.now()}`,
              date: new Date().toLocaleString('es-AR'),
              uploadedBy: 'chofer',
              tipo: tripDocForm.type,
              nombre: tripDocForm.name.trim(),
              fecha: new Date().toLocaleString('es-AR'),
              source: 'chofer',
            },
          ],
        },
        `Documento cargado: ${tripDocForm.type} (${tripDocForm.name.trim()})`
      )
    );
    setTripDocUploading(false);
    setTripDocModalTripId(null);
    setTripDocMockAttachment(null);
    toast.success('Documento subido con éxito');
  };

  const removeTripEvidence = (tripId: string, evidenceId: string) => {
    updateTrip(tripId, (trip) => {
      const target = trip.evidencias.find((item) => item.id === evidenceId);
      if (!target) return trip;
      return appendTimeline(
        {
          ...trip,
          evidencias: trip.evidencias.filter((item) => item.id !== evidenceId),
        },
        `Documento eliminado: ${target.nombre}`
      );
    });
    toast.success('Documento eliminado');
  };

  const handleTripEvidenceUpdate = () => {
    if (!selectedEvidenceUpdate) return;
    const { tripId, evidenceId } = selectedEvidenceUpdate;
    updateTrip(tripId, (trip) => {
      const targetIndex = trip.evidencias.findIndex((item) => item.id === evidenceId);
      const targetEvidence = targetIndex >= 0 ? trip.evidencias[targetIndex] : null;
      if (!targetEvidence) return trip;
      const nextEvidence = [...trip.evidencias];
      nextEvidence[targetIndex] = {
        ...targetEvidence,
        nombre: `${targetEvidence.tipo}-actualizado-${trip.id}.jpg`,
        name: `${targetEvidence.tipo}-actualizado-${trip.id}.jpg`,
        date: new Date().toLocaleString('es-AR'),
        fecha: new Date().toLocaleString('es-AR'),
      };
      return appendTimeline(
        {
          ...trip,
          evidencias: nextEvidence
        },
        `Documento actualizado: ${targetEvidence.tipo}`
      );
    });
    toast.success('Remito actualizado correctamente');
    setSelectedEvidenceUpdate(null);
  };

  const handleProfileDocumentDownload = (doc: Document) => {
    toast.success(`${doc.tipo} descargado`);
  };

  const getDocumentStatusColor = (estado: string) => {
    return estado === 'verde' ? 'bg-blue-500' : estado === 'amarillo' ? 'bg-slate-500' : 'bg-slate-700';
  };

  const toggleTripExpanded = (tripId: string) => {
    setExpandedTripIds((prev) => (prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]));
  };

  const handleDownloadVehicleDocument = (tripId: string, document: VehicleDocument) => {
    updateTrip(tripId, (trip) => appendTimeline(trip, `Documento descargado: ${document.documentType} (${document.fileName})`));
    toast.success(`${document.documentType} descargado`);
  };

  const openIncidentModal = (preselectedType: RouteEventType = 'incidente') => {
    setSelectedRouteEventType(preselectedType);
    setShowIncidentModal(true);
  };

  const handleResetDemoMobile = () => {
    requestGlobalDemoReset();
    setTrips([]);
    setCanWriteTripsToSync(false);
    setCurrentDriverId('driver-juan');
    setCurrentDriverName('Juan Pérez');
    setActiveTripId(null);
    setShowMapScreen(false);
    setExpandedTripIds([]);
    setExpandedHistoryIds([]);
    setEventDescription('');
    setExpenseAmount('');
    setExpenseTicketRawKb(null);
    setExpenseTicketFinalKb(null);
    setRemitoRawKb(null);
    setRemitoFinalKb(null);
    previousTripIdsRef.current = [];
    toast.success('Reset global solicitado');
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto h-[100dvh] bg-slate-900 text-white flex flex-col justify-center p-6">
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Transporte Fighera</h1>
            <p className="text-sm text-slate-300 mt-1">Acceso de choferes y control de ruta</p>
          </div>

          <label className="text-xs text-slate-300">Email</label>
          <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full mt-1 mb-4 rounded-xl px-3 py-3 bg-slate-700 border border-slate-600 focus:outline-none focus:border-blue-400" />
          <label className="text-xs text-slate-300">Contraseña</label>
          <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full mt-1 rounded-xl px-3 py-3 bg-slate-700 border border-slate-600 focus:outline-none focus:border-blue-400" />

          <button
            onClick={() => {
              if (!loginEmail.trim() || !loginPassword.trim()) {
                toast.error('Completa credenciales para ingresar');
                return;
              }
              const profile = driverProfiles.find((item) => item.email === loginEmail.trim().toLowerCase());
              if (!profile) {
                toast.error('Chofer no registrado en la app');
                return;
              }
              setCurrentDriverName(profile.driverName);
              setCurrentDriverId(profile.id);
              previousTripIdsRef.current = trips
                .filter(
                  (trip) =>
                    ((Boolean(trip.driverId) && trip.driverId === profile.id) ||
                    normalizeDriverName(trip.driver) === normalizeDriverName(profile.driverName)) &&
                    trip.estado !== 'completado' &&
                    trip.estado !== 'cancelado'
                )
                .map((trip) => trip.id);
              setIsAuthenticated(true);
              toast.success(`Sesión iniciada · ${profile.driverName}`);
            }}
            className="w-full mt-6 bg-blue-500 hover:bg-blue-600 rounded-xl py-3 font-semibold"
          >
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-[100dvh] relative overflow-hidden bg-gray-50 shadow-2xl flex flex-col">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Truck className="w-6 h-6" />
          <div>
            <div className="font-bold text-sm">Transporte Fighera</div>
            <div className="text-xs opacity-90">App Chofer · Operación en curso</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="flex items-center gap-1"
          >
            <Navigation className={`w-4 h-4 ${activeTrip?.estado === 'en-ruta' ? 'text-blue-200' : 'text-slate-300'}`} />
            <span className="text-xs">{activeTrip?.estado === 'en-ruta' ? 'GPS ON' : 'GPS STBY'}</span>
          </motion.div>

          <button
            onClick={() => setIsOnline(!isOnline)}
            className="flex items-center gap-1"
          >
            {isOnline ? (
              <Wifi className="w-5 h-5" />
            ) : (
              <WifiOff className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={handleResetDemoMobile}
            className="rounded bg-white/20 px-2 py-1 text-[10px] font-semibold hover:bg-white/30"
          >
            Reset demo
          </button>
        </div>
      </div>

      {/* Offline Banner */}
      {!isOnline && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-slate-200 text-slate-700 px-4 py-2 text-sm font-medium text-center"
        >
          ⚠️ Sin conexión. Guardando datos localmente...
        </motion.div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        <AnimatePresence mode="wait">
          {activeScreen === 'ruta' && (
            <motion.div
              key="ruta"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-4"
            >
              <h2 className="text-2xl font-bold mb-1 text-gray-800">{showMapScreen ? 'Ruta en Curso' : 'Rutas Asignadas'}</h2>
              <p className="text-sm text-gray-600 mb-4">
                {showMapScreen
                  ? 'Visualiza solo la ruta activa, registra eventos y completa la entrega con evidencia.'
                  : 'Acepta y gestiona tus viajes pendientes. Cada tarjeta incluye camión, plan y acciones rápidas.'}
              </p>
              {!showMapScreen && hasOperationalTrip ? (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Debes finalizar tu viaje actual en curso antes de iniciar uno nuevo.
                </div>
              ) : null}

              {!showMapScreen && pendingTrips.map((trip) => {
                const isExpanded = expandedTripIds.includes(trip.id);
                const isInProgress = trip.estado === 'en-ruta';
                const canStartNow = canStartTrip(trip.id);
                const isBlockedByAnotherOperationalTrip =
                  (trip.estado === 'aceptado' || trip.estado === 'en-planta') &&
                  !canStartNow;
                return (
                  <div key={trip.id} className="bg-white rounded-xl shadow-lg mb-3 overflow-hidden">
                    <button onClick={() => toggleTripExpanded(trip.id)} className="w-full p-4 text-left flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900">{trip.id}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {trip.fechaProgramada}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{trip.estado.toUpperCase()}</span>
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="px-4 pb-4">
                          <div className="text-sm text-gray-700 space-y-2 mb-4">
                            <p><span className="font-semibold">Camión:</span> {trip.vehiclePlate}</p>
                            <p><span className="font-semibold">Ruta:</span> {formatTripRouteStops(trip.routeStops, trip.origen, trip.destino)}</p>
                            <p><span className="font-semibold">Cliente:</span> {trip.clientCompany ?? '—'}</p>
                            <p>
                              <span className="font-semibold">Nº plan:</span>{' '}
                              <span className="font-mono text-xs">{trip.remitoNumber ?? '—'}</span>
                            </p>
                            <p><span className="font-semibold">Carga:</span> {trip.carga}</p>
                            <p><span className="font-semibold">Distancia:</span> {trip.distancia} · ETA {trip.eta}</p>
                            <p><span className="font-semibold">Plan:</span> {trip.plan}</p>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
                              La gestión de documentos está disponible en la pantalla <span className="font-semibold">Ruta en Curso</span>.
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            <button
                              onClick={() => { setActiveTripId(trip.id); setShowMapScreen(true); }}
                              className="py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-blue-100"
                            >
                              <Map className="w-4 h-4" /> Mapa
                            </button>
                            {!isInProgress && trip.estado === 'asignado' && (
                              <button
                                onClick={() => handleAcceptTrip(trip.id)}
                                className="py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                              >
                                Aceptar viaje
                              </button>
                            )}
                            {!isInProgress && trip.estado !== 'asignado' && trip.estado !== 'sin-chofer' && (
                              <button
                                onClick={() => handleStartTrip(trip.id)}
                                disabled={!canStartNow}
                                className="py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:bg-gray-300"
                              >
                                Iniciar viaje ahora
                              </button>
                            )}
                            {isBlockedByAnotherOperationalTrip ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                                Debes finalizar tu viaje actual en curso antes de iniciar uno nuevo.
                              </div>
                            ) : null}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {showMapScreen && activeTrip && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden mb-4">
                    <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{activeTrip.id}</h3>
                          <p className="text-xs text-slate-500 mt-1">Camion {activeTrip.vehiclePlate}</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                          {activeTrip.estado === 'en-ruta' ? 'EN CURSO' : activeTrip.estado.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-3">
                        {formatTripRouteStops(activeTrip.routeStops, activeTrip.origen, activeTrip.destino)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {activeTrip.distancia} · ETA {activeTrip.eta} · Progreso {Math.round(activeTrip.progress)}%
                      </p>
                    </div>

                    <div className="h-[46dvh] min-h-[320px] max-h-[480px] overflow-hidden border-y border-slate-200 relative z-0">
                      <MapContainer center={activeTrip.routePath[0]} zoom={7} className="h-full w-full" scrollWheelZoom>
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
                          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        />
                        <RouteBoundsController points={activeTrip.routePath} />
                        <Polyline positions={activeTrip.routePath} pathOptions={{ color: '#0f172a', weight: 8, opacity: 0.22 }} />
                        <Polyline positions={activeTrip.routePath} pathOptions={{ color: '#1d4ed8', weight: 5, opacity: 0.9 }} />
                        {activeTripStopPoints.map((point, index) => {
                          const kind = index === 0 ? 'start' : index === activeTripStopPoints.length - 1 ? 'end' : 'mid';
                          return (
                            <Marker
                              key={`${activeTrip.id}-stop-${index}`}
                              position={point}
                              icon={routeStopIcon(kind, index + 1)}
                            />
                          );
                        })}
                        <Marker position={getPositionByProgress(activeTrip.routePath, activeTrip.progress)} icon={tripIcon(activeTrip.vehiclePlate)} />
                      </MapContainer>
                    </div>

                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                      <div className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-slate-800">Planificación del viaje</h4>
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                            Parada {activeTripCurrentStopIndex + 1} / {Math.max(2, activeTripStops.length)}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {activeTripStops.map((stop, index) => {
                            const isCurrent = index === activeTripCurrentStopIndex;
                            const isDone = index < activeTripCurrentStopIndex;
                            const markerTone = index === 0 ? 'bg-blue-600' : index === activeTripStops.length - 1 ? 'bg-emerald-600' : 'bg-slate-700';
                            return (
                              <div key={`${activeTrip.id}-stop-plan-${index}`} className="flex items-start gap-2">
                                <div className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${isDone ? 'bg-blue-600' : markerTone}`}>
                                  {index + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-xs ${isCurrent ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{stop}</p>
                                  <p className="text-[11px] text-slate-500">
                                    {index === 0
                                      ? 'Origen'
                                      : index === activeTripStops.length - 1
                                        ? 'Destino'
                                        : 'Parada intermedia'}
                                  </p>
                                </div>
                                {isCurrent ? (
                                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                    Actual
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                        {activeTripNextStage ? (
                          <button
                            type="button"
                            onClick={() => handleAdvanceStage(activeTrip.id, activeTripNextStage.id)}
                            className="mt-3 w-full rounded-lg bg-blue-500 py-2 text-xs font-semibold text-white hover:bg-blue-600"
                          >
                            Registrar: {activeTripNextStage.label}
                          </button>
                        ) : null}
                      </div>
                      <div className="mb-2 rounded-lg border border-slate-200 bg-white p-2">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">Documentos del Viaje ({activeTrip.evidencias.length})</p>
                          <button
                            type="button"
                            onClick={() => openTripDocModal(activeTrip.id)}
                            className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"
                          >
                            Subir
                          </button>
                        </div>
                        {activeTrip.evidencias.length === 0 ? (
                          <p className="text-[11px] text-slate-500">Sin documentos en este viaje.</p>
                        ) : (
                          <div className="space-y-1">
                            {activeTrip.evidencias.map((doc, idx) => (
                              <div key={doc.id || `${doc.nombre}-${idx}`} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                                <span className="truncate">
                                  [{doc.source === 'admin' ? 'Admin' : 'Chofer'}] {doc.tipo} · {doc.nombre}
                                </span>
                                <div className="flex shrink-0 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => doc.id && setSelectedEvidenceUpdate({ tripId: activeTrip.id, evidenceId: doc.id })}
                                    className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                                  >
                                    Actualizar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => doc.id && removeTripEvidence(activeTrip.id, doc.id)}
                                    className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2">
                        Consejo operativo: confirma cada hito apenas ocurra para mantener el seguimiento en tiempo real.
                      </p>
                      {activeTrip.estado === 'asignado' ? (
                        <button onClick={() => handleAcceptTrip(activeTrip.id)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl text-sm font-semibold transition-colors">
                          Aceptar viaje
                        </button>
                      ) : activeTrip.estado === 'sin-chofer' ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Este viaje aún no tiene chofer asignado. Coordiná con operaciones desde el panel administrativo.
                        </p>
                      ) : activeTrip.estado !== 'en-ruta' && activeTrip.estado !== 'completado' ? (
                        <>
                          <button onClick={() => handleStartTrip(activeTrip.id)} disabled={!canStartTrip(activeTrip.id)} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3.5 rounded-xl text-sm font-semibold transition-colors">
                            Iniciar viaje ahora
                          </button>
                          {!canStartTrip(activeTrip.id) ? (
                            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                              Debes finalizar tu viaje actual en curso antes de iniciar uno nuevo.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <button
                          onClick={() => handleArrival(activeTrip.id)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-semibold transition-colors"
                        >
                          Confirmar llegada y cargar evidencia
                        </button>
                      )}

                      {routePushReminder?.tripId === activeTrip.id && (
                        <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 shadow-sm">
                          <p className="font-semibold">Notificación de seguridad</p>
                          <p className="mt-1">{routePushReminder.title}.</p>
                          <p className="mt-1">{routePushReminder.description}</p>
                          <button
                            onClick={() => openIncidentModal(routePushReminder.type)}
                            className="mt-2 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                          >
                            Reportar {routeEventMeta[routePushReminder.type].label.toLowerCase()} ahora
                          </button>
                        </div>
                      )}

                      <button
                        onClick={() => openIncidentModal(routePushReminder?.type ?? 'incidente')}
                        className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700"
                      >
                        Reportar evento de ruta
                      </button>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <button
                          onClick={() => setShowVehicleDocsModal(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Ver documentos
                        </button>
                        <button
                          onClick={() => setShowExpenseModal(true)}
                          className="border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 py-3 rounded-xl text-sm font-semibold transition-colors"
                        >
                          Registrar gasto
                        </button>
                      </div>

                    </div>
                  </div>

                </motion.div>
              )}
            </motion.div>
          )}

          {activeScreen === 'historial' && (
            <motion.div
              key="historial"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-4"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-2xl font-bold text-gray-800">Historial de Viajes</h2>
                <button
                  type="button"
                  onClick={openHistorialPrintSheet}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
                >
                  Tabla imprimible / PDF
                </button>
              </div>

              {tripHistory.length === 0 ? (
                <div className="bg-white rounded-xl shadow p-4 text-sm text-gray-600">
                  Aún no hay viajes finalizados. Cuando completes una ruta aparecerá aquí automáticamente.
                </div>
              ) : (
                <div className="space-y-3">
                  {trips
                    .filter((trip) => isTripForCurrentDriver(trip) && (trip.estado === 'completado' || trip.estado === 'cancelado'))
                    .map((trip) => {
                      const isExpanded = expandedHistoryIds.includes(trip.id);
                      return (
                        <div key={trip.id} className="bg-white rounded-xl shadow">
                          <button
                            onClick={() =>
                              setExpandedHistoryIds((prev) =>
                                prev.includes(trip.id) ? prev.filter((id) => id !== trip.id) : [...prev, trip.id]
                              )
                            }
                            className="w-full p-4 text-left flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold text-gray-800">{trip.id}</div>
                              <div className="text-sm text-gray-600">{formatTripRouteStops(trip.routeStops, trip.origen, trip.destino)}</div>
                              <div className="text-xs text-gray-500 mt-1">📅 {trip.fechaProgramada} · 🚚 {trip.vehiclePlate}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${trip.estado === 'completado' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'}`}>
                                {trip.estado === 'completado' ? 'Completado' : 'Cancelado'}
                              </span>
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                            </div>
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="px-4 pb-4">
                                <div className="h-44 rounded-xl overflow-hidden border border-slate-200 mb-3 relative z-0">
                                  <MapContainer center={trip.routePath[0]} zoom={7} className="h-full w-full" scrollWheelZoom>
                                    <TileLayer
                                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
                                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                    />
                                    <RouteBoundsController points={trip.routePath} />
                                    <Polyline positions={trip.routePath} pathOptions={{ color: '#0f172a', weight: 7, opacity: 0.22 }} />
                                    <Polyline positions={trip.routePath} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.9 }} />
                                    {buildPathForStopCount(trip.routePath, Math.max(2, getTripStops(trip).length)).map((point, index, arr) => (
                                      <Marker
                                        key={`${trip.id}-history-stop-${index}`}
                                        position={point}
                                        icon={routeStopIcon(index === 0 ? 'start' : index === arr.length - 1 ? 'end' : 'mid', index + 1)}
                                      />
                                    ))}
                                    <Marker position={getPositionByProgress(trip.routePath, trip.progress)} icon={tripIcon(trip.vehiclePlate)} />
                                  </MapContainer>
                                </div>

                                <div className="mb-3">
                                  <h4 className="text-sm font-semibold text-gray-800 mb-1">Trazabilidad</h4>
                                  <div className="space-y-1">
                                    {trip.timeline.map((item, idx) => (
                                      <div key={`${item.timestamp}-${idx}`} className="text-xs text-gray-700 border-l-2 border-blue-200 pl-2">
                                        <span className="text-gray-500 mr-1">{item.timestamp}</span>{item.descripcion}
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <h4 className="text-sm font-semibold text-gray-800 mb-1">Documentos y evidencias</h4>
                                  <div className="mb-2">
                                    <button
                                      type="button"
                                      onClick={() => openTripDocModal(trip.id)}
                                      className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"
                                    >
                                      Subir documento
                                    </button>
                                  </div>
                                  {trip.evidencias.length === 0 ? (
                                    <p className="text-xs text-gray-500">Sin documentos cargados en este viaje.</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {trip.evidencias.map((doc, idx) => (
                                        <div key={`${doc.nombre}-${idx}`} className="flex items-center justify-between gap-2 text-xs text-gray-700 bg-slate-50 rounded px-2 py-1">
                                          <span className="truncate">
                                            {doc.tipo} · {doc.nombre} · {doc.fecha}
                                          </span>
                                          <div className="flex shrink-0 gap-1">
                                            <button
                                              onClick={() => doc.id && setSelectedEvidenceUpdate({ tripId: trip.id, evidenceId: doc.id })}
                                              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                                            >
                                              Actualizar
                                            </button>
                                            <button
                                              onClick={() => doc.id && removeTripEvidence(trip.id, doc.id)}
                                              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                                            >
                                              Eliminar
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                </div>
              )}
            </motion.div>
          )}

          {activeScreen === 'rrhh' && (
            <motion.div
              key="rrhh"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-4"
            >
              <h2 className="text-2xl font-bold mb-4 text-gray-800">Recibos</h2>

              <div className="space-y-3">
                {receipts.map((receipt) => (
                  <div key={receipt.id} className="bg-white rounded-xl shadow p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-semibold text-gray-800">{receipt.mes}</div>
                        <div className="text-sm text-gray-600">Fecha: {receipt.fecha}</div>
                      </div>
                      <FileBadge className={`w-8 h-8 ${receipt.firmado ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>

                    <div className="flex gap-2">
                      <button className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                        <Download className="w-4 h-4" />
                        Descargar PDF
                      </button>

                      {!receipt.firmado && (
                        <button
                          onClick={() => {
                            setSelectedReceipt(receipt.id);
                            setShowSignatureModal(true);
                          }}
                          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                        >
                          <PenTool className="w-4 h-4" />
                          Firmar
                        </button>
                      )}

                      {receipt.firmado && (
                        <div className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                          <Check className="w-4 h-4" />
                          Firmado
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeScreen === 'perfil' && (
            <motion.div
              key="perfil"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-4"
            >
              <div className="bg-white rounded-xl shadow-lg p-6 mb-4">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                    {driverInitials}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{currentDriverName}</h2>
                    <p className="text-sm text-gray-600">
                      Chofer · {activeDriverProfile?.email ?? loginEmail.trim().toLowerCase()}
                    </p>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-bold mb-3 text-gray-800">Documentación</h3>

              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="bg-white rounded-xl shadow p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-3">
                        <div className={`w-3 h-3 rounded-full mt-1.5 ${getDocumentStatusColor(doc.estado)}`}></div>
                        <div>
                          <div className="font-semibold text-gray-800">{doc.tipo}</div>
                          <div className="text-sm text-gray-600">
                            Vence: {doc.vencimiento.toLocaleDateString('es-AR')}
                          </div>
                        </div>
                      </div>

                      {doc.estado !== 'verde' && (
                        <button
                          onClick={() => setShowDocumentUpload(doc.id)}
                          className="px-3 py-1 bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                        >
                          <Upload className="w-3 h-3" />
                          Renovar
                        </button>
                      )}
                    </div>

                    {doc.estado === 'rojo' && (
                      <div className="mt-2 px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-xs text-slate-700">
                        ⚠️ Documento vencido. Actualiza urgente.
                      </div>
                    )}

                    {doc.estado === 'amarillo' && (
                      <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                        ⏰ Vence pronto. Considera renovar.
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleProfileDocumentDownload(doc)}
                        className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Descargar
                      </button>
                      <button
                        onClick={() => setShowDocumentUpload(doc.id)}
                        className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                      >
                        Ver / Actualizar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 shadow-2xl">
        <div className="grid grid-cols-4 gap-1">
          {[
            { id: 'ruta' as Screen, icon: Route, label: 'Ruta' },
            { id: 'historial' as Screen, icon: Clock, label: 'Historial' },
            { id: 'rrhh' as Screen, icon: FileText, label: 'Recibos' },
            { id: 'perfil' as Screen, icon: User, label: 'Perfil' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveScreen(item.id);
                if (item.id === 'ruta') {
                  setShowMapScreen(false);
                }
              }}
              className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
                activeScreen === item.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <item.icon className="w-6 h-6 mb-1" />
              <span className="text-xs font-semibold">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modal: Incidencias */}
      <AnimatePresence>
        {showVehicleDocsModal && activeTrip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-[1000] flex items-end"
            onClick={() => setShowVehicleDocsModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl w-full p-6 max-h-[75vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-5"></div>
              <h3 className="text-xl font-bold text-gray-800">Documentos del vehículo</h3>
              <p className="text-sm text-gray-600 mb-4">
                Camión {activeTrip.vehiclePlate}. Documentación asociada al viaje seleccionado.
              </p>
              <div className="space-y-2">
                {vehicleDocuments
                  .filter((doc) => normalizePlate(doc.vehiclePlate) === normalizePlate(activeTrip.vehiclePlate))
                  .map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{doc.documentType}</div>
                        <div className="text-xs text-slate-500">
                          {doc.fileName} · Vence {new Date(doc.expiresAt).toLocaleDateString('es-AR')}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownloadVehicleDocument(activeTrip.id, doc)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md text-xs font-semibold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Descargar
                      </button>
                    </div>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Incidencias */}
      <AnimatePresence>
        {showIncidentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-[1000] flex items-end"
            onClick={() => setShowIncidentModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl w-full p-6"
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6"></div>

              <h3 className="text-xl font-bold mb-2 text-gray-800">Reporte de evento en ruta</h3>
              <p className="text-sm text-slate-600 mb-3">
                Selecciona el tipo de evento y registra un detalle breve para activar soporte operativo.
              </p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {(['incidente', 'retraso', 'desvio', 'parada'] as RouteEventType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedRouteEventType(type)}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      selectedRouteEventType === type
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">{routeEventMeta[type].label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{routeEventMeta[type].helper}</p>
                  </button>
                ))}
              </div>

              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  onClick={() => setEventDescription('Desvío preventivo por corte de ruta.')}
                  className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-700"
                >
                  Cargar texto rápido: desvío
                </button>
                <button
                  onClick={() => setEventDescription('Parada técnica por revisión de unidad.')}
                  className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-700"
                >
                  Cargar texto rápido: parada
                </button>
              </div>

              <textarea
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                placeholder="Describe brevemente lo ocurrido..."
                className="w-full border border-gray-300 rounded-xl p-3 mb-4 text-sm"
              />

              <div className="space-y-2">
                <button
                  onClick={() => {
                    if (!selectedRouteEventType) {
                      toast.error('Selecciona el tipo de evento a reportar.');
                      return;
                    }
                    handleRouteEvent(activeTripId, selectedRouteEventType);
                  }}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 text-base transition-colors"
                >
                  <AlertTriangle className="w-5 h-5" />
                  Enviar reporte de evento
                </button>
                <button
                  onClick={() => {
                    setShowIncidentModal(false);
                    setSelectedRouteEventType(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Gastos */}
      <AnimatePresence>
        {showExpenseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-[1000] flex items-end"
            onClick={() => setShowExpenseModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl w-full p-6"
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6"></div>

              <h3 className="text-xl font-bold mb-4 text-gray-800">Registrar Gasto</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'peajes' as ExpenseCategory, icon: Car, label: 'Peajes' },
                      { id: 'combustible' as ExpenseCategory, icon: Fuel, label: 'Combustible' },
                      { id: 'gomeria' as ExpenseCategory, icon: Wrench, label: 'Gomería' },
                      { id: 'fitosanitario' as ExpenseCategory, icon: FlaskConical, label: 'Fitosanitario' },
                      { id: 'otros' as ExpenseCategory, icon: Coffee, label: 'Otros' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setExpenseCategory(cat.id)}
                        className={`py-3 rounded-lg flex flex-col items-center gap-1 border-2 transition-colors ${
                          expenseCategory === cat.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        <cat.icon className="w-5 h-5" />
                        <span className="text-xs font-semibold">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Monto</label>
                  <input
                    type="number"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-semibold focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleExpenseTicketCapture}
                  className="w-full bg-blue-500 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-blue-600"
                >
                  <Camera className="w-5 h-5" />
                  Capturar Ticket (máx. 500kb)
                </button>
                {expenseTicketRawKb && expenseTicketFinalKb && (
                  <div className="text-xs rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
                    Tamaño original: {expenseTicketRawKb}kb · Tamaño final: {expenseTicketFinalKb}kb
                  </div>
                )}
                {!expenseTicketFinalKb && (
                  <div className="text-xs rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700">
                    Debes cargar el ticket/comprobante para habilitar el guardado.
                  </div>
                )}

                <button
                  onClick={handleExpense}
                  disabled={!expenseTicketFinalKb}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
                >
                  Guardar Gasto
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Foto */}
      <AnimatePresence>
        {showPhotoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-90 z-[1000] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6"
            >
              <h3 className="text-xl font-bold mb-4 text-gray-800 text-center">
                {photoType === 'remito-inicial' ? 'Foto del Remito Inicial' : 'Foto del Remito Conformado'}
              </h3>

              <div className="bg-gray-100 rounded-xl h-64 flex items-center justify-center mb-6">
                <div className="text-center">
                  <Camera className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">Simular captura de foto</p>
                  {remitoRawKb && remitoFinalKb && (
                    <p className="text-xs text-gray-500 mt-2">
                      Última compresión: {remitoRawKb}kb {"->"} {remitoFinalKb}kb
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleClosePhotoModal}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold disabled:bg-gray-100 disabled:text-gray-400"
                  disabled={photoType === 'remito-final'}
                >
                  {photoType === 'remito-final' ? 'Obligatorio' : 'Cancelar'}
                </button>
                <button
                  onClick={() => handlePhotoCapture(activeTripId)}
                  className="px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-600"
                >
                  <Camera className="w-5 h-5" />
                  Capturar
                </button>
              </div>
              {photoType === 'remito-final' && (
                <p className="mt-3 text-center text-xs text-slate-600">
                  Debes capturar el remito conformado para finalizar el viaje.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Firma */}
      <AnimatePresence>
        {showSignatureModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-90 z-[1000] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6"
            >
              <h3 className="text-xl font-bold mb-4 text-gray-800 text-center">
                Firmar Conformidad
              </h3>

              <p className="text-sm text-gray-600 text-center mb-4">
                Dibuja tu firma con el dedo o mouse
              </p>

              <div className="border-2 border-gray-300 rounded-xl mb-4 bg-white">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-48 touch-none cursor-crosshair"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setShowSignatureModal(false)}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancelar
                </button>

                <button
                  onClick={clearSignature}
                  className="px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpiar
                </button>

                <button
                  onClick={saveSignature}
                  className="px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-600"
                >
                  <Check className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Upload Documento */}
      <AnimatePresence>
        {showDocumentUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-90 z-[1000] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6"
            >
              <h3 className="text-xl font-bold mb-4 text-gray-800 text-center">
                Renovar Documento
              </h3>

              <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-xl h-48 flex items-center justify-center mb-6 cursor-pointer hover:bg-blue-100 transition-colors">
                <div className="text-center">
                  <Upload className="w-16 h-16 text-blue-500 mx-auto mb-3" />
                  <p className="text-sm text-gray-700 font-semibold">Toca para seleccionar archivo</p>
                  <p className="text-xs text-gray-500 mt-1">PDF, JPG o PNG</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowDocumentUpload(null)}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDocumentUpload}
                  className="px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold"
                >
                  Subir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Documentos del viaje */}
      <AnimatePresence>
        {tripDocModalTripId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-90 z-[1000] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6"
            >
              <h3 className="text-xl font-bold mb-3 text-gray-800 text-center">Subir documento del viaje</h3>
              <p className="text-xs text-gray-500 text-center mb-3">
                Carga simulada: no se suben archivos reales.
              </p>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Tipo</label>
                  <select
                    value={tripDocForm.type}
                    onChange={(event) => setTripDocForm((prev) => ({ ...prev, type: event.target.value as TripDocType }))}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    {(['Remito', 'Ticket', 'Gasto', 'Otro'] as TripDocType[]).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Simular origen del archivo</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => simulateTripDocumentCapture('camara')}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Capturar
                    </button>
                    <button
                      type="button"
                      onClick={() => simulateTripDocumentCapture('galeria')}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Adjuntar
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-medium text-slate-700">Archivo simulado</p>
                  <p className="text-[11px] text-slate-500">
                    {tripDocMockAttachment ?? 'Aún no se simuló captura/adjunto.'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTripDocModalTripId(null)}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold"
                  disabled={tripDocUploading}
                >
                  Cancelar
                </button>
                <button
                  onClick={submitTripDocument}
                  className="px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 disabled:bg-gray-300"
                  disabled={tripDocUploading}
                >
                  {tripDocUploading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Subiendo...
                    </span>
                  ) : (
                    'Guardar'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Actualizar documento en historial */}
      <AnimatePresence>
        {selectedEvidenceUpdate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-90 z-[1000] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6"
            >
              <h3 className="text-xl font-bold mb-3 text-gray-800 text-center">
                Actualizar documento
              </h3>
              <p className="text-sm text-gray-600 text-center mb-4">
                Reemplaza el documento adjunto de este viaje en historial.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-xl h-40 flex items-center justify-center mb-6">
                <div className="text-center">
                  <Upload className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-blue-700 font-semibold">Simular selección de archivo</p>
                  <p className="text-xs text-slate-500 mt-1">JPG o PDF</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedEvidenceUpdate(null)}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleTripEvidenceUpdate}
                  className="px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600"
                >
                  Guardar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
