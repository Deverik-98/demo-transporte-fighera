# Reporte de Auditoría Técnica — Fase 0

**Proyecto:** Prototipo Transportes Fighera  
**Alcance:** Panel Web (`Panel Administrativo ERP`) + App Móvil (`Prototipo App Choferes Transporte`)  
**Fecha de auditoría:** 2026-05-15  
**Tipo:** Inspección estática del código fuente (sin propuestas comerciales)

---

## Metadatos del prototipo

| Atributo | Valor |
|---|---|
| Stack | React 18.3, Vite 6.3, TypeScript/TSX, Tailwind 4, Radix UI, Leaflet 1.9 + react-leaflet 4.2, Sonner, Motion |
| Persistencia Fase 0 | `localStorage` compartido (mismo origen) |
| Servidor unificado demo | `serve-unified-prototypes.js` — puerto **5180** (`/admin/`, `/mobile/`) |
| Backend productivo | **No implementado** |
| SQL de referencia futura | `Panel Administrativo ERP/init_schema.sql` (PostgreSQL, sin wiring en runtime) |
| Archivos fuente `.ts`/`.tsx` (ambos `src/`) | ~6.135 |

---

## 1. MAPA DE COMPONENTES CRÍTICOS

### 1.1 Panel Web

| Componente | Archivo | LOC aprox. | Descripción técnica |
|---|---|---:|---|
| **Gestión de Viajes** (Planilla + Kanban + edición) | `src/app/components/modules/trips.tsx` | **1.312** | Tabs «Planilla Operativa» / «Tablero Kanban»; filtros (`trip-operations-filters-panel.tsx`); edición multi-parada con mapa Leaflet; geocodificación; OSRM para preview; leyenda de colores por incidentes; impresión de planilla; integración alertas por viaje |
| **Creador de viajes multi-parada** | `trip-assignment-modal.tsx` | **671** | Modal con `stopLabels[]` (≥2 paradas); mapa interactivo (clic origen/destino); `geocodePlaceName` / `reverseGeocodePlaceName`; `fetchRoadPolyline` (OSRM); validación clientes SIDERSA/Acindar/CIPLAR y plan de carga |
| **Centro de Operaciones (mapa unificado)** | `dashboard.tsx` | **582** | Mapa 560px con GeoJSON de zonas, polilíneas por viaje, camión interpolado por `progress`, OSRM por viaje visible, `TripAssignmentModal`, `TripImportModal`, panel de alertas |
| **Configuraciones (zonas + vencimientos)** | `expiration-config.tsx` | **1.058** | Editor `ZoneConfig`; búsqueda de polígonos (Photon + Nominatim + Georef AR); mapa de preview |
| **Capa de datos / negocio** | `lib/operations-data.tsx` | **~1.937** | `OperationsDataProvider`: CRUD viajes, usuarios, vehículos, documentos, facturas, zonas; motor de asignación; normalización; sync LS |
| **Soporte mapa/rutas** | `trip-route-map-support.tsx` | **162** | Photon reverse/search, Nominatim reverse, OSRM polyline, iconos paradas |
| **Filtros operativos** | `trip-operations-filters.ts` + panel | — | Estados Kanban, zona, flota Propio/Fletero, búsqueda texto |
| **Documentación** | `documents.tsx` | — | Tabs vehículo / chofer / viaje / nómina; evidencias anidadas en viajes |
| **Importación CSV** | `trip-import-modal.tsx` | — | Alta masiva con origen/destino mínimos |
| **TV Mode** | `tv-mode-dashboard.tsx` | — | Vista simplificada operativa |
| **RBAC simulado** | `RbacGuard.tsx` + selector rol en `App.tsx` | — | `canAccess()` por rol de menú |

**Tablero Kanban:** columnas por `TRIP_KANBAN_AND_FILTER_STAGES` (`Sin chofer`, `Asignado`, `Aceptado`, `En planta`, `En ruta`, `Entregado`, `Cancelado`, `Reprogramado`). **Sin drag-and-drop** (`react-dnd` está en `package.json` pero no se usa en viajes). Cambio de estado vía edición/acciones.

**Planilla operativa:** tabla con coloreado por incidentes, badges de alertas, acciones mapa / docs / editar / cancelar.

**Vistas de menú (`App.tsx`):** dashboard, trips, vehicles, documents, costs, configurations, security, tvmode, alerts.

---

### 1.2 App Móvil

| Vista / flujo | Ubicación | LOC aprox. | Descripción técnica |
|---|---|---:|---|
| **Monolito principal** | `src/app/App.tsx` | **2.512** | Auth, sync LS, mapa, stepper, gastos, remitos, historial, RRHH, perfil |
| **Stepper de estados** | `TripStageStepper.tsx` + `STAGE_FLOW` en `App.tsx` | 48 + inline | aceptado → balanza → inicio-carga → fin-carga → en-ruta → llegada |
| **Pantalla Ruta** | `activeScreen === 'ruta'` | — | Lista viajes del chofer, mapa fullscreen, «GPS» simulado, recordatorios desvío/parada |
| **Carga de gastos** | Modal `showExpenseModal` | — | Categorías (peajes, combustible, etc.), monto, ticket simulado con compresión 500 KB |
| **Subida de remitos** | Modal `showPhotoModal` | — | remito-inicial / remito-final; metadatos en `evidencias[]` |
| **Documentos de viaje** | Modal `tripDocModal` | — | Simulación cámara/galería; tipos Remito / Ticket / Gasto / Otro |
| **Historial** | `activeScreen === 'historial'` | — | Acordeones, timeline, impresión HTML |
| **RRHH** | `activeScreen === 'rrhh'` | — | Recibos mock, canvas de firma |
| **Perfil** | `activeScreen === 'perfil'` | — | Docs personales + lectura `tf_sync_documents_v1` |

**Pantallas:** `Screen = 'ruta' | 'historial' | 'rrhh' | 'perfil'`.

---

## 2. MODELO DE DATOS SIMULADO (MOCK SCHEMA)

### 2.1 Claves `localStorage`

| Clave | Versión | Contenido |
|---|---|---|
| `tf_sync_trips_v2` | v2 | `SyncTrip[]` |
| `tf_sync_alerts_v3` | v3 | `SyncAlert[]` |
| `tf_sync_zones_v3` | v3 | `ZoneConfig[]` |
| `tf_sync_documents_v1` | v1 | `DocumentRecord[]` (entidad chofer/vehículo; **no** evidencias de viaje) |
| `tf_sync_users_v1` | v1 | `AppUser[]` |
| `tf_sync_vehicles_v1` | v1 | `Vehicle[]` |
| `tf_sync_settings_v1` | v1 | `ExpirationRule[]` |
| `tf_sync_reset_request_v1` | — | `{ requestedAt: number }` |
| `tf_trip_create_assign_next` | Panel only | Alterna `"assign"` / `"sin"` en creación automática |

Definición canónica: `Panel Administrativo ERP/src/app/lib/sync-store.ts` (espejo en móvil con subset de helpers).

---

### 2.2 `Trips` — `tf_sync_trips_v2`

```typescript
type SyncTripStatus =
  | "Sin chofer" | "Asignado" | "Aceptado" | "En planta"
  | "En ruta" | "Entregado" | "Cancelado" | "Reprogramado";

type SyncTrip = {
  id: string;                      // ej. "VJ-1013"
  zoneId: string;                  // ej. "zona-bsas"
  driver: string;
  driverId?: string;
  vehiclePlate: string;
  origin: string;                  // redundante: = routeStops[0]
  destination: string;             // redundante: = routeStops[last]
  routeStops?: string[];           // ≥2 paradas ordenadas (origen → … → destino)
  routePath: [number, number][];   // LatLng Leaflet (polilínea base)
  progress: number;                // 0–100
  status: SyncTripStatus;
  cargo: string;
  plan: string;
  scheduledAt: string;
  clientCompany?: string;
  remitoNumber?: string;           // manual alfanumérico o "AUTO-0001001"
  timeline?: { timestamp: string; descripcion: string }[];
  evidencias?: TripEvidence[];
};

type TripEvidence = {
  id: string;
  tripId?: string;
  name?: string;
  type?: "Remito" | "Ticket" | "Gasto" | "Otro";
  url?: string;                    // ej. "local://remito-inicial/VJ-1001"
  date?: string;
  uploadedBy?: string;
  tipo?: string; nombre?: string; fecha?: string;
  source?: "admin" | "chofer";
};
```

**Ejemplo multi-parada (seed en código):**

```json
{
  "id": "VJ-1001",
  "zoneId": "zona-bsas",
  "driver": "Juan Pérez",
  "driverId": "driver-juan",
  "vehiclePlate": "AB123CD",
  "origin": "Buenos Aires",
  "destination": "Córdoba",
  "routeStops": ["Buenos Aires", "Zárate", "Rosario", "Villa María", "Córdoba"],
  "routePath": [[-34.6037, -58.3816], [-34.098, -59.028], [-32.944, -60.65], [-32.408, -63.24], [-31.42, -64.19]],
  "progress": 42,
  "status": "En ruta",
  "cargo": "Granel",
  "plan": "Entrega directa",
  "scheduledAt": "2026-05-16T08:00",
  "clientCompany": "SIDERSA",
  "remitoNumber": "ABC1234",
  "timeline": [],
  "evidencias": []
}
```

**Reglas al persistir:**

- `origin` / `destination` derivados de `routeStops[0]` y `routeStops[n-1]`.
- `routePath` recalculado con `buildPathForStopCount(basePath, routeStops.length)` (`lib/trip-route.ts`).
- `remitoNumber`: ver sección 3.2 (planes de carga).

---

### 2.3 `Zones` — `tf_sync_zones_v3`

```typescript
type ZoneConfig = {
  id: string;           // "zona-bsas" | "zona-santafe" | "zona-sanjuan" | "zona-tucuman" | "zona-cordoba"
  name: string;
  colorClass: string;   // "bg-blue-500"
  colorHex: string;     // "#3B82F6"
  mapCenter: [number, number];
  zoom: number;
  radiusKm: number;
  areaGeoJson?: GeoJSON.Feature | GeoJSON.FeatureCollection | null;
};
```

Geometrías por defecto embebidas en `lib/embedded-operational-zone-geometries.ts`. Complemento opcional vía Nominatim al boot (`operations-data.tsx`).

---

### 2.4 `Documents` — `tf_sync_documents_v1`

Documentación de **entidad** (chofer o vehículo). Las evidencias de viaje viven dentro de cada `SyncTrip.evidencias`.

```typescript
type DocumentRecord = {
  id: string;
  entityType: "user" | "vehicle";
  entityId: string;
  documentType: string;
  expiresAt: string;             // "YYYY-MM-DD"
  status: "Vigente" | "Próximo a vencer" | "Vencido";
  notes: string;
  fileName: string;
  fileType: string;              // "image/jpeg", "application/pdf"
  fileSizeKb: number;
  uploadedAt: string;            // "YYYY-MM-DDTHH:mm"
};
```

**No se persisten bytes** del archivo; solo metadatos.

---

### 2.5 `Alerts` — `tf_sync_alerts_v3`

```typescript
type SyncAlertKind =
  | "vehicle_documentation"
  | "operational"
  | "driver_documentation";

type SyncAlert = {
  id: string;
  time: string;
  message: string;
  severity: "Alta" | "Media";
  source: "mobile" | "web";
  status: "Activa" | "Resuelta";
  tripId?: string;
  vehiclePlate?: string;
  alertKind?: SyncAlertKind;
  resolvedAt?: string;
};
```

**Creación desde móvil:** `appendCriticalAlert()` en `Prototipo App Choferes Transporte/src/app/lib/sync-store.ts` (incidentes en ruta).

**Resolución:** `resolveSyncAlertsByTrip(tripId, vehiclePlate)` al marcar viaje `Entregado` en panel.

---

## 3. LÓGICA DE NEGOCIO Y ESTADO

### 3.1 Sincronización entre ventanas (LocalStorage)

**Escritura** — `writeJson(key, value)` en `sync-store.ts`:

1. `localStorage.setItem(key, JSON.stringify(value))`
2. `window.dispatchEvent(new CustomEvent("tf-sync-store-updated", { detail: { key } }))` → misma pestaña
3. `window.dispatchEvent(new StorageEvent("storage", { key, newValue, ... }))` sintético → fallback misma pestaña  
   *(El evento nativo `storage` no dispara en el documento que escribió.)*

**Consumidores:**

| Componente | Eventos | Keys |
|---|---|---|
| `OperationsDataProvider` | `storage` + `tf-sync-store-updated` | trips, users, vehicles, documents, settings, zones, reset |
| `useSyncAlerts` | idem | `tf_sync_alerts_v3` |
| App móvil `App.tsx` | `storage` | principalmente `tf_sync_trips_v2`; también users, vehicles, documents |

**Flujo panel ↔ móvil:**

- Panel escribe viajes con `setSyncTrips` → móvil escucha y ejecuta `mapSyncToMobileTrip`.
- Móvil escribe con `setSyncTrips(trips.map(mapTripToSync))` si `canWriteTripsToSync === true` (hay seed en LS al hidratar).
- Si LS de viajes está vacío al abrir móvil: `canWriteTripsToSync = false` (no pisa seed del panel).

**Requisito de despliegue para sync:** mismo **origin** (ej. `http://localhost:5180`).

---

### 3.2 Motor de sugerencia / asignación automática de choferes

**Ubicación:** `addTrip()` en `operations-data.tsx` (~L1443–1521).

**No es scoring por distancia ni ETA.** Es asignación determinística por disponibilidad:

```
1. activeTrips = viajes con status ∉ { Entregado, Cancelado }
2. occupiedDriverIds = Set(driverId de activeTrips)
3. occupiedDriverNames = Set(normalizeComparableName(driver))
4. occupiedVehiclePlates = Set(patentes activas, excl. "SIN ASIGNAR", "PATENTE N/D")
5. wantsAutomaticDriver = sin driverId ni vehicleId en input manual
6. prefersAutoAssign = wantsAutomaticDriver AND consumeTripCreateAssignPreference()
   → alterna en LS tf_trip_create_assign_next: una creación asigna, la siguiente "sin chofer"
7. Si prefersAutoAssign:
   a. activeChoferes = users con role "Chofer" y status "Activo"
   b. availableChoferes = no ocupados (id ni nombre normalizado)
   c. zoneAvailableChoferes = available ∩ zoneId === input.zoneId
   d. autoDriver = zoneAvailableChoferes[0]   // primer elemento del array, sin ranking
   e. Si vacío: crear "Chofer Auto {N}" + documentos seed automáticos
8. Vehículo (si hay asignación):
   autoVehicle = availableZoneCamiones[0] ?? availableAnyCamion[0]
                 ?? primer camión de zona ?? activeCamiones[0]
9. status = hasAssignment ? "Asignado" : "Sin chofer"
```

**Algoritmo geométrico de rutas (no de choferes):** `buildPathForStopCount()` reparte N puntos sobre la polilínea por distancia euclidiana acumulada en coordenadas lat/lng.

---

### 3.3 Validación de planes de carga (7 vs 8 caracteres)

**Ubicación:** `lib/trip-clients.ts` + `addTrip()` / formularios en `trip-assignment-modal.tsx` y `trips.tsx`.

| Cliente | Longitud exigida | Regla |
|---|---|---|
| **SIDERSA** | **7** | Exactamente 7 caracteres `[A-Za-z0-9]` |
| **Acindar** | **8** | Exactamente 8 caracteres alfanuméricos |
| **CIPLAR** | **8** | Exactamente 8 caracteres alfanuméricos |
| **Otros clientes** | N/A (ignora input manual) | `generateAutoLoadPlanReference(sequence)` → `AUTO-{7 dígitos}` |

**Funciones:**

- `isPrincipalClientCompany(name)` → bool
- `getPrincipalLoadPlanMaxLength(client)` → `7 | 8 | null`
- `normalizePrincipalLoadPlanValue(raw, maxLen)` → strip no-alfanuméricos + `slice(0, maxLen)`
- `isValidPrincipalLoadPlan(client, value)` → `value.length === len && /^[A-Za-z0-9]+$/.test(value)`
- En `addTrip`: si cliente principal y plan inválido → `return null` (viaje no creado)

---

### 3.4 Restricción «un viaje operativo a la vez» (app móvil)

```typescript
const operationalStates: TripStatus[] = ['aceptado', 'en-planta', 'en-ruta'];

function canStartTrip(tripId: string): boolean {
  // Viaje debe estar en 'aceptado' o 'en-planta'
  // Y ningún OTRO viaje del chofer en operationalStates
}
```

- `handleStartTrip`: bloquea con toast si otro viaje está en estados operativos.
- Varios viajes en `asignado` pueden coexistir; la restricción aplica al **iniciar ruta** (`en-ruta`).
- `activeTripId`: un viaje focal; auto-selección del primer `pendingTrips[0]`.
- Progreso simulado: `setInterval` 5 s, `progress += 3` hasta 92 cuando `en-ruta`.

---

## 4. VOLUMEN DE ARCHIVOS BINARIOS (SIMULACIÓN)

### 4.1 App móvil

| Flujo | Función / UI | Mecanismo | Validación 500 KB | Validación tipo |
|---|---|---|---|---|
| Remito inicial/final | `handlePhotoCapture()` | Botón «Capturar»; **sin** `<input type="file">`; tamaño `random*900+250` KB | `compressMockFile()` cap 500 KB | Siempre metadato `.jpg` |
| Ticket de gasto | `handleExpenseTicketCapture()` | Idem; `random*900+300` KB | Misma función | Ninguna MIME |
| Doc. de viaje | `simulateTripDocumentCapture()` | Nombre generado; `.pdf` si tipo Gasto | No | Por tipo lógico |
| Perfil chofer | `handleDocumentUpload()` | Solo toast | No | No |

```typescript
function compressMockFile(rawKb: number) {
  if (rawKb <= 500) return { rawKb, finalKb: rawKb, compressed: false };
  return { rawKb, finalKb: 500, compressed: true };
}
```

- Sin `FileReader`, `Blob` ni base64 en LS.
- URLs: esquema `local://...`
- Gasto: requiere `expenseTicketFinalKb`; **no** agrega evidencia `Ticket` al array (solo timeline).

---

### 4.2 Panel Web

| Módulo | Handler | `accept` | MIME | Límite 500 KB |
|---|---|---|---|---|
| `documents.tsx` | `handleFileUpload` | `image/*,.pdf` | Rechaza si no image/pdf | **No** (solo `fileSizeKb`) |
| `documents.tsx` nómina | `handlePayrollFileUpload` | `application/pdf,image/*` | Por accept | No |
| `vehicles.tsx` | `onDraftFileChange` | `image/*,.pdf` | No validado | No |
| `security.tsx` | `onDriverDocFileChange` | `image/*,.pdf` | No validado | No |
| `invoices-hr.tsx` | `handleFileUpload` | `application/pdf,image/*` | No validado | No |
| Docs de viaje (tab trip) | `addTripDocument()` | Sin file input | — | — |

---

## 5. CONSUMO DE MAPAS Y GEOLOCALIZACIÓN (CRÍTICO PARA COTIZAR TERCEROS)

### 5.1 Resumen ejecutivo — APIs de Google

| Servicio Google Maps Platform | ¿Lo requiere el prototipo Fase 0? |
|---|---|
| **Places API** (Autocomplete) | **No** |
| **Maps JavaScript API** (mapa interactivo) | **No** — usa **Leaflet** |
| **Geocoding API** | **No** — usa **Photon** + **Nominatim** (solo panel) |
| **Directions API** | **No** — equivalente parcial vía **OSRM público** (solo panel) |
| **Distance Matrix API** | **No** — no hay matriz distancia/tiempo entre paradas |
| **Geolocation en background (móvil)** | **No** — posición **simulada** sobre polilínea |

---

### 5.2 Panel Web — mapas y servicios externos

#### Renderizado de mapas

| Ubicación | Librería | Tiles (basemap) |
|---|---|---|
| `dashboard.tsx` | react-leaflet `MapContainer` | CARTO CDN: `basemaps.cartocdn.com/light_all` / `dark_all` |
| `trip-assignment-modal.tsx` | idem | CARTO light |
| `trips.tsx` (edición) | idem | CARTO light |
| `expiration-config.tsx` | idem + `GeoJSON` zonas | CARTO light |

**Atribución en UI:** OpenStreetMap + CARTO.  
**No hay** script de Google Maps ni API key de Google en el repositorio.

#### Geocodificación / «autocompletado» de direcciones

| Función | Archivo | Proveedor | Endpoint |
|---|---|---|---|
| Búsqueda lugar → coordenadas | `geocodePlaceName()` | **Photon (Komoot)** | `GET https://photon.komoot.io/api/?q={query}, Argentina&limit=1` |
| Coordenadas → etiqueta | `reverseGeocodePlaceName()` | Photon → fallback **Nominatim** | `photon.komoot.io/reverse` / `nominatim.openstreetmap.org/reverse` |
| Búsqueda polígonos zonas | `expiration-config.tsx` | Photon + Nominatim + **Georef AR** | `photon.komoot.io/api` (limit 14), `nominatim.../search`, `infra.datos.gob.ar/georef/provincias.geojson` |
| Boot geometría zona | `operations-data.tsx` | Nominatim | `nominatim.../search?polygon_geojson=1&countrycodes=...` |

**Paradas de viaje (crear/editar):**

- Inputs de texto libre (`stopLabels`, `editForm.routeStops`) con `autoComplete="off"`.
- Al cambiar etiquetas se llama `geocodePlaceName(label)` (debounce vía efectos).
- **No** hay widget Places Autocomplete ni dropdown de sugerencias por carácter en paradas (salvo selector de rutas template precargadas).
- Alternativa: **clic en mapa** → `reverseGeocodePlaceName` rellena origen/destino.

**Scoring Photon (lugares, no choferes):** `scorePhotonFeature()` en `expiration-config.tsx` pondera `type` (city, town, …), `extent`, longitud de nombre.

#### Routing / distancias / tiempos

| Función | Archivo | Proveedor | Uso |
|---|---|---|---|
| `fetchRoadPolyline()` | `trip-route-map-support.tsx` | **OSRM público** | `GET https://router.project-osrm.org/route/v1/driving/{lng,lat;...}?overview=full&geometries=geojson` |
| `fetchRoadRoute()` | `dashboard.tsx` | OSRM (duplicado inline) | Una petición OSRM por viaje visible en mapa unificado |
| Preview creación/edición | `trip-assignment-modal.tsx`, `trips.tsx` | OSRM vía `fetchRoadPolyline` | Tras resolver coordenadas de paradas |

**Multi-parada en routing OSRM:** se envían **todos** los puntos resueltos en una sola petición `route/v1/driving` (waypoints en orden). No hay optimización de orden de paradas (TSP).

**Distance Matrix / ETA:** **no implementado.** El móvil muestra `eta: "3h 30m"` hardcodeado y `distancia` derivada de `routePath.length * 90` km en `mapSyncToMobileTrip`.

#### Datos embebidos (sin red)

- Polígonos de zonas: `embedded-operational-zone-geometries.ts`
- Templates de ruta: estado en `operations-data.tsx` (`RouteTemplate[]`)

---

### 5.3 App Móvil — mapas y «GPS»

#### Renderizado

| Ubicación | Detalle |
|---|---|
| `App.tsx` mapa viaje activo | `MapContainer` + CARTO `light_all` |
| `App.tsx` historial (expandido) | Idem por viaje |

**Sin llamadas** a Photon, Nominatim ni OSRM desde la app móvil.

#### Origen de la ruta en móvil

- `routePath` y `routeStops` llegan por **sync** desde panel (`tf_sync_trips_v2`).
- `buildPathForStopCount()` solo reajusta puntos sobre la polilínea ya guardada para marcadores de parada.

#### Simulación de posición / GPS

| Elemento | Implementación real |
|---|---|
| Etiqueta header «GPS ON / GPS STBY» | UI según `trip.estado === 'en-ruta'` |
| Posición del camión en mapa | `getPositionByProgress(routePath, progress)` — interpolación lineal sobre segmentos de la polilínea |
| Avance del viaje | `useEffect` + `setInterval(5000)`: `progress += 3` (máx. 92) en viaje activo `en-ruta` |
| `navigator.geolocation` | **No usado** en el codebase |
| `watchPosition` / background tracking | **No existe** |
| Envío de punto GPS a servidor | **No existe** (sin backend) |
| Recordatorios desvío/parada | Heurística sobre `progress` (≥12% desvío, ≥30% parada), no coordenadas GPS reales |

**Conclusión móvil:** el prototipo **simula** monitoreo GPS en UI; **no** implementa tracking en background ni permisos de ubicación del dispositivo.

---

### 5.4 Matriz de equivalencia para cotización de terceros

Si se migrara a **Google Maps Platform**, el alcance funcional observado equivaldría aproximadamente a:

| Necesidad funcional Fase 0 | Equivalente Google | Uso actual Fase 0 | Dónde |
|---|---|---|---|
| Mapa interactivo web/móvil | Maps JavaScript API / Maps SDK | Leaflet + CARTO tiles | Panel + móvil |
| Buscar dirección / parada | Places Autocomplete + Place Details | Texto libre + Photon geocode | Panel (crear/editar viaje) |
| Click mapa → dirección | Geocoding API (reverse) | Photon + Nominatim reverse | Panel |
| Dibujar ruta por calles | Directions API | OSRM público | Panel (dashboard, modal, edición) |
| ETA / distancia entre N paradas | Distance Matrix / Directions legs | No (valores mock en móvil) | — |
| Polígonos administrativos zonas | Geocoding + Data Layers o GeoJSON propio | Georef AR + Nominatim + embebido | `expiration-config` |
| Tracking chofer en ruta | Roads API / custom backend + Geolocation | Interpolación `progress` | Solo móvil (simulado) |

**Servicios gratuitos/OSM en uso hoy (costo directo $0 en prototipo, con límites de uso público):**

- `photon.komoot.io`
- `nominatim.openstreetmap.org`
- `router.project-osrm.org`
- `basemaps.cartocdn.com`
- `infra.datos.gob.ar/georef/...`

**Riesgo operativo:** OSRM/Photon/Nominatim públicos no están pensados para producción sin instancia propia o contrato; Nominatim exige política de uso (User-Agent, rate limits).

---

### 5.5 Inventario de archivos con lógica geoespacial

| Archivo | Rol |
|---|---|
| `Panel Administrativo ERP/src/app/lib/trip-route.ts` | `formatTripRouteStops`, `buildPathForStopCount` |
| `Panel Administrativo ERP/src/app/components/modules/trip-route-map-support.tsx` | Geocode, reverse, OSRM, bounds |
| `Panel Administrativo ERP/src/app/components/modules/dashboard.tsx` | Mapa operativo, OSRM por viaje, GeoJSON zonas |
| `Panel Administrativo ERP/src/app/components/modules/trip-assignment-modal.tsx` | Creación multi-parada + mapa |
| `Panel Administrativo ERP/src/app/components/modules/trips.tsx` | Edición multi-parada + mapa |
| `Panel Administrativo ERP/src/app/components/modules/expiration-config.tsx` | Editor zonas + búsqueda polígonos |
| `Panel Administrativo ERP/src/app/lib/embedded-operational-zone-geometries.ts` | GeoJSON estático |
| `Prototipo App Choferes Transporte/src/app/lib/trip-route.ts` | Copia de helpers de ruta |
| `Prototipo App Choferes Transporte/src/app/App.tsx` | Mapa lectura + interpolación progress |

---

## Anexo A — Arquitectura de sync

```
┌─────────────────────┐     writeJson()      ┌──────────────────────┐
│  Panel (React)      │ ──────────────────► │  localStorage        │
│  OperationsData     │ ◄── storage event ──│  tf_sync_*           │
└─────────────────────┘                     └──────────┬───────────┘
┌─────────────────────┐                               │
│  App Choferes       │ ◄─────────────────────────────┘
│  mapTripToSync      │
└─────────────────────┘
         mismo origin (ej. localhost:5180)
```

## Anexo B — Mapeo de estados panel ↔ móvil

| Panel `SyncTripStatus` | Móvil `estado` / `stage` |
|---|---|
| Sin chofer | sin-chofer |
| Asignado / Reprogramado | asignado |
| Aceptado | aceptado |
| En planta | en-planta (+ stages balanza / carga) |
| En ruta | en-ruta |
| Entregado | completado / llegada |
| Cancelado | cancelado |

---

*Documento generado por auditoría estática del repositorio. Fase 0 = prototipo front-end con persistencia local simulada; no constituye especificación de producción.*
