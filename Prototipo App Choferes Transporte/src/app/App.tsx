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
  Wifi,
  WifiOff,
  X,
  ChevronDown,
  ChevronRight,
  Download,
  Trash2
} from 'lucide-react';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import { LatLngExpression, divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { TripStage, TripStageStepper } from './components/modules/TripStageStepper';
import { appendCriticalAlert, getSyncDocuments, getSyncTrips, getSyncVehicles, requestGlobalDemoReset, setSyncTrips, SyncTrip } from './lib/sync-store';

type TripStatus = 'asignado' | 'aceptado' | 'en-planta' | 'en-ruta' | 'completado' | 'cancelado';
type Screen = 'ruta' | 'historial' | 'rrhh' | 'perfil';
type RouteEventType = 'incidente' | 'retraso' | 'desvio';
type ExpenseCategory = 'peaje' | 'combustible' | 'viatico';

interface Trip {
  id: string;
  driver: string;
  zoneId: 'zona-argentina' | 'zona-uruguay';
  stage: TripStage;
  vehiclePlate: string;
  fechaProgramada: string;
  origen: string;
  destino: string;
  carga: string;
  distancia: string;
  eta: string;
  plan: string;
  estado: TripStatus;
  timeline: Array<{ timestamp: string; descripcion: string }>;
  alertas: Array<{ tipo: RouteEventType; descripcion: string; timestamp: string }>;
  routePath: LatLngExpression[];
  progress: number;
  evidencias: Array<{ tipo: string; nombre: string; fecha: string }>;
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

function mapTripToSync(trip: Trip): SyncTrip {
  return {
    id: trip.id,
    zoneId: trip.zoneId,
    driver: trip.driver,
    vehiclePlate: trip.vehiclePlate,
    origin: trip.origen,
    destination: trip.destino,
    routePath: trip.routePath,
    progress: trip.progress,
    status:
      trip.estado === 'asignado'
        ? 'Pendiente de aceptación'
        : trip.estado === 'aceptado'
          ? 'Asignado'
          : trip.estado === 'en-ruta'
            ? 'En Ruta'
            : trip.estado === 'completado'
              ? 'Entregado'
              : trip.estado === 'cancelado'
                ? 'Cancelado'
                : 'En Planta',
    cargo: trip.carga,
    plan: trip.plan,
    scheduledAt: trip.fechaProgramada,
    timeline: trip.timeline,
    evidencias: trip.evidencias
  };
}

function mapSyncToMobileTrip(syncTrip: SyncTrip): Trip {
  return {
    id: syncTrip.id,
    driver: syncTrip.driver,
    zoneId: syncTrip.zoneId,
    stage: syncTrip.status === 'En Ruta' ? 'en-ruta' : syncTrip.status === 'Entregado' ? 'llegada' : 'aceptado',
    vehiclePlate: syncTrip.vehiclePlate,
    fechaProgramada: syncTrip.scheduledAt,
    origen: syncTrip.origin,
    destino: syncTrip.destination,
    carga: syncTrip.cargo,
    distancia: `${Math.max(50, Math.round((syncTrip.routePath.length || 2) * 90))} km`,
    eta: "3h 30m",
    plan: syncTrip.plan,
    estado:
      syncTrip.status === 'Pendiente de aceptación'
        ? 'asignado'
        : syncTrip.status === 'Asignado'
          ? 'aceptado'
          : syncTrip.status === 'En Ruta'
            ? 'en-ruta'
            : syncTrip.status === 'Entregado'
              ? 'completado'
              : syncTrip.status === 'Cancelado'
                ? 'cancelado'
                : 'en-planta',
    timeline: [{ timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), descripcion: 'Viaje sincronizado desde panel.' }],
    alertas: [],
    routePath: syncTrip.routePath,
    progress: syncTrip.progress,
    evidencias: syncTrip.evidencias ?? []
  };
}

function normalizePlate(plate: string) {
  return plate.replace(/-/g, '').toUpperCase();
}

const initialMobileTrips: Trip[] = [
  {
    id: 'VJ-2026-001234',
    driver: 'Juan Martínez',
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
    driver: 'Juan Martínez',
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
  const [loginEmail, setLoginEmail] = useState('chofer@fighera.com');
  const [loginPassword, setLoginPassword] = useState('123456');
  const [currentDriverName, setCurrentDriverName] = useState('Juan Pérez');
  const previousTripIdsRef = useRef<string[]>([]);
  const [activeScreen, setActiveScreen] = useState<Screen>('ruta');
  const [isOnline, setIsOnline] = useState(true);
  const [showMapScreen, setShowMapScreen] = useState(false);
  const [expandedTripIds, setExpandedTripIds] = useState<string[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>(initialMobileTrips);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [photoType, setPhotoType] = useState<'remito-inicial' | 'remito-final'>('remito-inicial');
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('peaje');
  const [expenseTicketRawKb, setExpenseTicketRawKb] = useState<number | null>(null);
  const [expenseTicketFinalKb, setExpenseTicketFinalKb] = useState<number | null>(null);
  const [remitoRawKb, setRemitoRawKb] = useState<number | null>(null);
  const [remitoFinalKb, setRemitoFinalKb] = useState<number | null>(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState<string | null>(null);
  const [eventDescription, setEventDescription] = useState('');
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([]);
  const [showVehicleDocsModal, setShowVehicleDocsModal] = useState(false);
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

  const driverProfiles = [
    { email: 'chofer@fighera.com', driverName: 'Juan Pérez' },
    { email: 'maria.gonzalez@transportefighera.com', driverName: 'María González' },
    { email: 'carlos.rodriguez@transportefighera.com', driverName: 'Carlos Rodríguez' },
    { email: 'diego.fernandez@transportefighera.com', driverName: 'Diego Fernández' }
  ];

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

  const tripHistory = useMemo(
    () =>
      trips
        .filter((trip) => trip.estado === 'completado' || trip.estado === 'cancelado')
        .map((trip) => ({
          id: trip.id,
          fecha: trip.fechaProgramada,
          ruta: `${trip.origen} → ${trip.destino}`,
          estado: trip.estado === 'completado' ? 'Completado' : 'Cancelado'
        })),
    [trips]
  );

  useEffect(() => {
    const synced = getSyncTrips();
    if (!synced.length) return;
    setTrips(synced.map(mapSyncToMobileTrip));
    setSyncedVehicleRecords(getSyncVehicles<{ id: string; plate: string }>());
    setSyncedDocumentRecords(
      getSyncDocuments<{ entityType: string; entityId: string; documentType: string; fileName: string; expiresAt: string; status?: string }>()
    );
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'tf_sync_trips_v1') return;
      const synced = getSyncTrips();
      if (synced.length) setTrips(synced.map(mapSyncToMobileTrip));
    };
    const onStorageCollections = (event: StorageEvent) => {
      if (event.key === 'tf_sync_vehicles_v1') {
        setSyncedVehicleRecords(getSyncVehicles<{ id: string; plate: string }>());
      }
      if (event.key === 'tf_sync_documents_v1') {
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

  const pendingTrips = useMemo(
    () =>
      trips.filter(
        (trip) =>
          trip.driver === currentDriverName &&
          trip.estado !== 'completado' &&
          trip.estado !== 'cancelado'
      ),
    [currentDriverName, trips]
  );

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
          description: `${trip.origen} -> ${trip.destino} · Camión ${trip.vehiclePlate}`
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
    setSyncTrips(trips.map(mapTripToSync));
  }, [trips]);

  const updateTrip = (tripId: string, recipe: (trip: Trip) => Trip) => {
    setTrips((prev) => prev.map((trip) => (trip.id === tripId ? recipe(trip) : trip)));
  };

  const appendTimeline = (trip: Trip, descripcion: string) => ({
    ...trip,
    timeline: [...trip.timeline, { timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), descripcion }]
  });

  const handleAcceptTrip = (tripId: string) => {
    updateTrip(tripId, (trip) => appendTimeline({ ...trip, estado: 'aceptado', stage: 'aceptado' }, 'Chofer aceptó el viaje.'));
    setActiveTripId(tripId);
    toast.success('Viaje aceptado. Revisa la ruta y presiona iniciar.');
  };

  const handleStartTrip = (tripId: string) => {
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
              { tipo: 'remito-inicial', nombre: `remito-inicial-${trip.id}.jpg`, fecha: new Date().toLocaleString('es-AR') }
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
              { tipo: 'remito-final', nombre: `remito-final-${trip.id}.jpg`, fecha: new Date().toLocaleString('es-AR') }
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

  const handleArrival = (tripId: string) => {
    updateTrip(tripId, (trip) => appendTimeline({ ...trip, progress: 95 }, 'Llegada a destino confirmada.'));
    setPhotoType('remito-final');
    setShowPhotoModal(true);
  };

  const handleRouteEvent = (tripId: string | null, type: RouteEventType) => {
    if (!tripId) return;
    if (!eventDescription.trim()) {
      toast.error('Agrega un detalle breve del evento');
      return;
    }
    const messages = {
      incidente: 'Incidente reportado al panel operativo.',
      retraso: 'Retraso registrado con notificación a tráfico.',
      desvio: 'Desvío informado y compartido con operaciones.'
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
    setShowIncidentModal(false);
    setEventDescription('');

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
      appendTimeline(trip, `Gasto registrado: ${expenseCategory} por $${expenseAmount}`)
    );
    toast.success(`Gasto de $${expenseAmount} registrado en ${expenseCategory}`);
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

  const handleProfileDocumentDownload = (doc: Document) => {
    toast.success(`${doc.tipo} descargado`);
  };

  const getDocumentStatusColor = (estado: string) => {
    return estado === 'verde' ? 'bg-green-500' : estado === 'amarillo' ? 'bg-yellow-500' : 'bg-red-500';
  };

  const toggleTripExpanded = (tripId: string) => {
    setExpandedTripIds((prev) => (prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]));
  };

  const handleDownloadVehicleDocument = (tripId: string, document: VehicleDocument) => {
    updateTrip(tripId, (trip) => appendTimeline(trip, `Documento descargado: ${document.documentType} (${document.fileName})`));
    toast.success(`${document.documentType} descargado`);
  };

  const handleResetDemoMobile = () => {
    requestGlobalDemoReset();
    setTrips(initialMobileTrips);
    setActiveTripId(initialMobileTrips[0]?.id ?? null);
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
              previousTripIdsRef.current = trips
                .filter((trip) => trip.driver === profile.driverName && trip.estado !== 'completado' && trip.estado !== 'cancelado')
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
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between shadow-lg">
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
            <Navigation className={`w-4 h-4 ${activeTrip?.estado === 'en-ruta' ? 'text-green-300' : 'text-slate-300'}`} />
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
          className="bg-yellow-500 text-black px-4 py-2 text-sm font-medium text-center"
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

              {!showMapScreen && pendingTrips.map((trip) => {
                const isExpanded = expandedTripIds.includes(trip.id);
                const isInProgress = trip.estado === 'en-ruta';
                const canStart = trip.estado === 'aceptado';
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
                            <p><span className="font-semibold">Origen:</span> {trip.origen}</p>
                            <p><span className="font-semibold">Destino:</span> {trip.destino}</p>
                            <p><span className="font-semibold">Carga:</span> {trip.carga}</p>
                            <p><span className="font-semibold">Distancia:</span> {trip.distancia} · ETA {trip.eta}</p>
                            <p><span className="font-semibold">Plan:</span> {trip.plan}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => { setActiveTripId(trip.id); setShowMapScreen(true); }} className="py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1"><Map className="w-4 h-4" /> Mapa</button>
                            <button onClick={() => handleAcceptTrip(trip.id)} disabled={trip.estado !== 'asignado'} className="py-2 rounded-lg bg-blue-500 text-white text-xs font-semibold disabled:bg-gray-300">Aceptar</button>
                            <button onClick={() => handleStartTrip(trip.id)} disabled={!canStart && !isInProgress} className="py-2 rounded-lg bg-green-500 text-white text-xs font-semibold disabled:bg-gray-300">Iniciar</button>
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
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          {activeTrip.estado === 'en-ruta' ? 'EN CURSO' : activeTrip.estado.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-3">
                        {activeTrip.origen} <span className="text-slate-400">→</span> {activeTrip.destino}
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
                        <Polyline positions={activeTrip.routePath} pathOptions={{ color: '#1d4ed8', weight: 5, opacity: 0.85 }} />
                        <Marker position={getPositionByProgress(activeTrip.routePath, activeTrip.progress)} icon={tripIcon(activeTrip.vehiclePlate)} />
                      </MapContainer>
                    </div>

                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                      <TripStageStepper
                        currentStage={activeTrip.stage}
                        onAdvance={(nextStage) => handleAdvanceStage(activeTrip.id, nextStage)}
                      />
                      <p className="text-[11px] text-slate-500 mb-2">
                        Consejo operativo: confirma cada hito apenas ocurra para mantener el seguimiento en tiempo real.
                      </p>
                      {activeTrip.estado !== 'en-ruta' && activeTrip.estado !== 'completado' ? (
                        <button onClick={() => handleStartTrip(activeTrip.id)} className="w-full bg-green-700 hover:bg-green-800 text-white py-3.5 rounded-xl text-sm font-semibold transition-colors">
                          Iniciar viaje ahora
                        </button>
                      ) : (
                        <button
                          onClick={() => handleArrival(activeTrip.id)}
                          className="w-full bg-blue-700 hover:bg-blue-800 text-white py-3.5 rounded-xl text-sm font-semibold transition-colors"
                        >
                          Confirmar llegada y cargar evidencia
                        </button>
                      )}

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <button
                          onClick={() => setShowVehicleDocsModal(true)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Ver documentos
                        </button>
                        <button
                          onClick={() => setShowMapScreen(false)}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl text-sm font-semibold transition-colors"
                        >
                          Volver a rutas
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <button
                          onClick={() => setShowExpenseModal(true)}
                          className="bg-slate-700 hover:bg-slate-800 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
                        >
                          Registrar gasto
                        </button>
                        <button
                          onClick={() => setShowIncidentModal(true)}
                          className="bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
                        >
                          Reportar evento
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow p-4">
                    <h4 className="font-semibold text-gray-800 mb-2">Timeline operativo</h4>
                    <div className="space-y-2">
                      {activeTrip.timeline.slice().reverse().map((item, idx) => (
                        <div key={`${item.timestamp}-${idx}`} className="text-sm text-gray-700 border-l-2 border-blue-200 pl-3">
                          <div className="text-xs text-gray-500">{item.timestamp}</div>
                          <div>{item.descripcion}</div>
                        </div>
                      ))}
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
              <h2 className="text-2xl font-bold mb-4 text-gray-800">Historial de Viajes</h2>

              {tripHistory.length === 0 ? (
                <div className="bg-white rounded-xl shadow p-4 text-sm text-gray-600">
                  Aún no hay viajes finalizados. Cuando completes una ruta aparecerá aquí automáticamente.
                </div>
              ) : (
                <div className="space-y-3">
                  {trips
                    .filter((trip) => trip.estado === 'completado' || trip.estado === 'cancelado')
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
                              <div className="text-sm text-gray-600">{trip.origen} → {trip.destino}</div>
                              <div className="text-xs text-gray-500 mt-1">📅 {trip.fechaProgramada} · 🚚 {trip.vehiclePlate}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${trip.estado === 'completado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
                                    <Polyline positions={trip.routePath} pathOptions={{ color: '#22d3ee', weight: 4, opacity: 0.9 }} />
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
                                  {trip.evidencias.length === 0 ? (
                                    <p className="text-xs text-gray-500">Sin documentos cargados en este viaje.</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {trip.evidencias.map((doc, idx) => (
                                        <div key={`${doc.nombre}-${idx}`} className="text-xs text-gray-700 bg-slate-50 rounded px-2 py-1">
                                          {doc.tipo} · {doc.nombre} · {doc.fecha}
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
                      <FileBadge className={`w-8 h-8 ${receipt.firmado ? 'text-green-500' : 'text-gray-400'}`} />
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
                          className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                        >
                          <PenTool className="w-4 h-4" />
                          Firmar
                        </button>
                      )}

                      {receipt.firmado && (
                        <div className="flex-1 px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
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
                    JM
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Juan Martínez</h2>
                    <p className="text-sm text-gray-600">Chofer Profesional · Legajo CH-1029</p>
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
                      <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                        ⚠️ Documento vencido. Actualiza urgente.
                      </div>
                    )}

                    {doc.estado === 'amarillo' && (
                      <div className="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
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
              onClick={() => setActiveScreen(item.id)}
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

              <h3 className="text-xl font-bold mb-4 text-gray-800">Evento de Ruta</h3>
              <p className="text-sm text-slate-600 mb-3">
                Registra solo informacion necesaria para que trafico actue de inmediato.
              </p>

              <textarea
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                placeholder="Describe brevemente lo ocurrido..."
                className="w-full border border-gray-300 rounded-xl p-3 mb-4 text-sm"
              />

              <div className="space-y-3">
                <button
                  onClick={() => handleRouteEvent(activeTripId, 'incidente')}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 text-lg transition-colors"
                >
                  <AlertTriangle className="w-6 h-6" />
                  Incidente
                </button>

                <button
                  onClick={() => handleRouteEvent(activeTripId, 'retraso')}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 text-lg transition-colors"
                >
                  <Clock className="w-6 h-6" />
                  Retraso
                </button>

                <button
                  onClick={() => handleRouteEvent(activeTripId, 'desvio')}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 text-lg transition-colors"
                >
                  <Route className="w-6 h-6" />
                  Desvío
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
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'peaje' as ExpenseCategory, icon: Car, label: 'Peaje' },
                      { id: 'combustible' as ExpenseCategory, icon: Fuel, label: 'Combustible' },
                      { id: 'viatico' as ExpenseCategory, icon: Coffee, label: 'Viático' },
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
                  className="w-full bg-purple-500 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3"
                >
                  <Camera className="w-5 h-5" />
                  Capturar Ticket (máx. 500kb)
                </button>
                {expenseTicketRawKb && expenseTicketFinalKb && (
                  <div className="text-xs rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-purple-700">
                    Tamaño original: {expenseTicketRawKb}kb · Tamaño final: {expenseTicketFinalKb}kb
                  </div>
                )}

                <button
                  onClick={handleExpense}
                  className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg"
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
                  onClick={() => setShowPhotoModal(false)}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handlePhotoCapture(activeTripId)}
                  className="px-4 py-3 bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  Capturar
                </button>
              </div>
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
                  className="px-4 py-3 bg-red-100 text-red-700 rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpiar
                </button>

                <button
                  onClick={saveSignature}
                  className="px-4 py-3 bg-green-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
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
    </div>
  );
}
