import { FormEvent, useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { geoJSON } from "leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { useOperationsData } from "../../lib/operations-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { FileCheck, Edit, Save, Calendar, MapPin, Pencil, Search, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  boundingbox?: [string, string, string, string];
  geojson?: GeoJSON.Geometry;
};

type PhotonProperties = {
  name?: string;
  street?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  type?: string;
  postcode?: string;
  extent?: [number, number, number, number];
};

type PhotonGeoJsonPayload = GeoJSON.FeatureCollection & {
  features: Array<{ type: "Feature"; geometry: GeoJSON.Point; properties: PhotonProperties }>;
};

const PHOTON_BIAS: Record<MapCountryScope, { lat?: number; lon?: number }> = {
  all: { lat: -34.6, lon: -58.4 },
  ar: { lat: -34.6, lon: -58.4 },
  uy: { lat: -32.5, lon: -55.75 },
  cl: { lat: -33.45, lon: -70.65 },
  py: { lat: -25.3, lon: -57.6 },
  bo: { lat: -17.85, lon: -63.95 },
  br: { lat: -15.8, lon: -47.9 },
};

const PHOTON_PLACE_WEIGHT: Record<string, number> = {
  administrative: 50,
  state: 45,
  city: 40,
  town: 38,
  village: 32,
  county: 34,
  district: 33,
  country: 20,
};

type MapCountryScope = "all" | "ar" | "uy" | "cl" | "py" | "bo" | "br";

function sanitizeJsonResponse(text: string) {
  const t = text.trim();
  const cand = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  if (!cand.length) return null;
  const slice = t.slice(Math.min(...cand));
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    return null;
  }
}

/** Photon `extent`: [minLon, maxLat, maxLon, minLat]. */
function polygonFromPhotonExtent(extent: [number, number, number, number]): GeoJSON.Polygon {
  let [west, north, east, south] = extent;
  let latSpan = Math.abs(north - south);
  let lngSpan = Math.abs(east - west);
  const minDeg = 0.03;
  if (latSpan < minDeg || lngSpan < minDeg) {
    const lonMid = (west + east) / 2;
    const latMid = (south + north) / 2;
    return bboxPolygonAroundPoint(lonMid, latMid, Math.max(minDeg, lngSpan / 2 + 0.02), Math.max(minDeg, latSpan / 2 + 0.015));
  }
  return {
    type: "Polygon",
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

function bboxPolygonAroundPoint(lon: number, lat: number, halfLngDeg: number, halfLatDeg: number): GeoJSON.Polygon {
  const west = lon - halfLngDeg;
  const east = lon + halfLngDeg;
  const south = lat - halfLatDeg;
  const north = lat + halfLatDeg;
  return {
    type: "Polygon",
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

/** Centro aproximado para Point o para polígono Photon (primer anillo exterior). */
function lonLatCenterFromPhotonGeometry(g: GeoJSON.Geometry | undefined): [number, number] | null {
  if (!g) return null;
  if (g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [lon, lat] = g.coordinates;
    return Number.isFinite(Number(lon)) && Number.isFinite(Number(lat)) ? [Number(lon), Number(lat)] : null;
  }
  if (g.type === "Polygon" && Array.isArray(g.coordinates?.[0]) && g.coordinates[0].length) {
    const ring = g.coordinates[0] as number[][];
    let sumLon = 0;
    let sumLat = 0;
    let n = 0;
    for (const pt of ring) {
      if (Array.isArray(pt) && pt.length >= 2) {
        sumLon += Number(pt[0]);
        sumLat += Number(pt[1]);
        n += 1;
      }
    }
    if (!n) return null;
    return [sumLon / n, sumLat / n];
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates?.[0]?.[0]) && g.coordinates[0][0].length) {
    const ring = g.coordinates[0][0] as number[][];
    let sumLon = 0;
    let sumLat = 0;
    let n = 0;
    for (const pt of ring) {
      if (Array.isArray(pt) && pt.length >= 2) {
        sumLon += Number(pt[0]);
        sumLat += Number(pt[1]);
        n += 1;
      }
    }
    if (!n) return null;
    return [sumLon / n, sumLat / n];
  }
  return null;
}

function photonFeatureToNominatimResult(f: GeoJSON.Feature, scope: MapCountryScope): NominatimResult | null {
  const p = (f.properties ?? {}) as PhotonProperties;
  if (scope !== "all") {
    const cc = String(p.countrycode ?? "").toLowerCase();
    if (cc && cc !== scope) return null;
  }
  const g = f.geometry;
  let geojson: GeoJSON.Geometry;
  if (g?.type === "Polygon" || g?.type === "MultiPolygon") {
    geojson = g;
  } else {
    const center = lonLatCenterFromPhotonGeometry(g);
    if (!center) return null;
    const [lon, lat] = center;
    if (p.extent?.length === 4) geojson = polygonFromPhotonExtent(p.extent);
    else geojson = bboxPolygonAroundPoint(lon, lat, 0.12, 0.09);
  }

  const centerForMeta = lonLatCenterFromPhotonGeometry(g) ?? lonLatCenterFromPhotonGeometry(geojson);
  if (!centerForMeta) return null;
  const [lon, lat] = centerForMeta;

  const name = [p.name, p.city, p.state, p.country].filter(Boolean).join(", ");
  const displayName = name || `Lon ${lon.toFixed(4)}, Lat ${lat.toFixed(4)}`;

  let boundingbox: [string, string, string, string] | undefined;
  if (p.extent?.length === 4) {
    const [w, nn, ee, ss] = p.extent;
    boundingbox = [String(ss), String(nn), String(w), String(ee)];
  }

  const placeType =
    typeof p.type === "string" && /^[A-Za-z_]+$/.test(p.type)
      ? p.type
      : "place";

  return {
    lat: String(lat),
    lon: String(lon),
    display_name: displayName,
    type: placeType,
    boundingbox,
    geojson,
  };
}

function scorePhotonFeature(f: GeoJSON.Feature) {
  const p = (f.properties ?? {}) as PhotonProperties;
  const t = String(p.type ?? "").toLowerCase();
  let w = PHOTON_PLACE_WEIGHT[t] ?? 10;
  if (["house", "building", "apartment"].includes(t)) w = Math.min(w, 2);
  if (Array.isArray(p.extent) && p.extent.length === 4) w += 5;
  const name = `${p.name ?? ""} ${p.city ?? ""}`.trim().length;
  if (name > 24) w += 2;
  return w;
}

async function fetchPhotonCandidates(query: string, scope: MapCountryScope): Promise<NominatimResult[]> {
  try {
    const bias = PHOTON_BIAS[scope] ?? PHOTON_BIAS.all;
    const biasQs =
      bias.lat != null && bias.lon != null ? `&lat=${bias.lat}&lon=${bias.lon}&location_bias_scale=3` : "";
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=14&lang=es${biasQs}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const rawText = await response.text();
    const parsed = sanitizeJsonResponse(rawText) as PhotonGeoJsonPayload | null;
    if (!parsed?.features?.length) return [];
    const feats = [...parsed.features] as GeoJSON.Feature[];
    feats.sort((a, b) => scorePhotonFeature(b) - scorePhotonFeature(a));

    const out: NominatimResult[] = [];
    for (const ft of feats) {
      const res = photonFeatureToNominatimResult(ft, scope);
      if (res) out.push(res);
    }

    const seen = new Set<string>();
    return out.filter((r) => {
      const k = `${r.lat.slice(0, 8)},${r.lon.slice(0, 8)},${r.display_name.slice(0, 40)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch {
    return [];
  }
}

async function fetchNominatimCandidates(query: string, countryScopeInner: MapCountryScope): Promise<NominatimResult[]> {
  try {
    const countryParam = countryScopeInner === "all" ? "" : `&countrycodes=${countryScopeInner}`;
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&polygon_threshold=0.03&addressdetails=1&limit=10${countryParam}&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Language": "es-AR,es",
        },
        referrerPolicy: "strict-origin-when-cross-origin",
      },
    );
    if (!response.ok) return [];
    const rawText = await response.text();
    const payload = sanitizeJsonResponse(rawText) as NominatimResult[] | null;
    if (!Array.isArray(payload)) return [];
    return payload.filter((item) => item && typeof item.lat === "string");
  } catch {
    return [];
  }
}

type LocalAreaSeed = {
  label: string;
  country: "ar" | "uy" | "cl" | "py" | "bo" | "br";
  lat: number;
  lon: number;
  zoom: number;
  geojson: GeoJSON.Geometry;
};

function isAreaGeometry(geometry?: GeoJSON.Geometry | null) {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

const GEOREF_AR_PROVINCIAS_URL = "https://infra.datos.gob.ar/georef/provincias.geojson";

/** Cache en memoria (sesión): límites oficiales IGN de las 23 provincias + CABA. */
let georefArProvinciasFeatures: GeoJSON.Feature[] | null = null;

function normalizeSearchDiacritics(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadGeorefArProvincias(): Promise<GeoJSON.Feature[]> {
  if (georefArProvinciasFeatures?.length) return georefArProvinciasFeatures;
  try {
    const res = await fetch(GEOREF_AR_PROVINCIAS_URL);
    if (!res.ok) return [];
    const fc = (await res.json()) as GeoJSON.FeatureCollection;
    georefArProvinciasFeatures = Array.isArray(fc.features) ? fc.features : [];
  } catch {
    georefArProvinciasFeatures = [];
  }
  return georefArProvinciasFeatures;
}

/**
 * Intenta casar la búsqueda con una jurisdicción de la capa provincial Argentina (IGN / datos.gob.ar).
 * Evita rectángulos artefacto para nombres de provincia (p. ej. Mendoza).
 */
async function fetchArgentinaProvinciaResult(query: string): Promise<NominatimResult | null> {
  const q = normalizeSearchDiacritics(query);
  if (q.length < 3) return null;
  const feats = await loadGeorefArProvincias();
  if (!feats.length) return null;

  const wantsCaba =
    q.includes("caba") || q.includes("capital federal") || q.includes("ciudad autonoma") || q.includes("autonoma de buenos aires");
  const wantsProvBa = q.includes("provincia de buenos aires") || q.includes("pba") || q.includes("provincia buenos aires");

  type Scored = { f: GeoJSON.Feature; score: number };
  const scored: Scored[] = [];

  for (const f of feats) {
    const p = f.properties as { nombre?: string; nombre_completo?: string; categoria?: string } | null;
    const nombre = normalizeSearchDiacritics(String(p?.nombre ?? ""));
    const completo = normalizeSearchDiacritics(String(p?.nombre_completo ?? ""));
    const cat = String(p?.categoria ?? "");
    const catN = normalizeSearchDiacritics(cat);
    if (!nombre) continue;

    let score = 0;
    if (q === nombre) score += 110;
    else if (q.startsWith(nombre) || nombre.startsWith(q)) score += 95;
    else if (q.includes(nombre) || nombre.includes(q)) score += 75;
    else {
      const words = q.split(" ").filter((w) => w.length >= 3);
      if (words.some((w) => w.length >= 4 && nombre.includes(w))) score += 55;
      else if (words.length >= 2 && words.every((w) => completo.includes(w) || nombre.includes(w))) score += 50;
      else continue;
    }

    if (cat === "Provincia") score += 30;
    if (catN.includes("autonoma")) {
      score += wantsCaba ? 45 : -22;
      if (completo.includes(q)) score += 28;
    }
    if (nombre === "buenos aires" && wantsProvBa) score += 45;
    if (nombre === "buenos aires" && wantsCaba) score += 20;

    scored.push({ f, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 52) return null;

  const g = best.f.geometry;
  if (!isAreaGeometry(g)) return null;
  const center = lonLatCenterFromPhotonGeometry(g);
  if (!center) return null;
  const [lon, lat] = center;
  const nom = String(
    (best.f.properties as { nombre_completo?: string; nombre?: string })?.nombre_completo ??
      (best.f.properties as { nombre?: string })?.nombre ??
      "Provincia",
  );
  return {
    lat: String(lat),
    lon: String(lon),
    display_name: nom,
    type: "administrative",
    geojson: g,
  };
}

/** Si OSM solo devolvió punto + boundingbox, arma un rectángulo (solo fuera de Argentina; all también evita caja si podés usar georef). */
function nominatimWithFallbackPolygon(row: NominatimResult, scope: MapCountryScope): NominatimResult | null {
  if (!row || typeof row.lat !== "string" || typeof row.lon !== "string") return null;
  if (isAreaGeometry(row.geojson)) return row;
  if (scope === "ar") return null;
  if (row.boundingbox?.length !== 4) return null;
  const [southStr, northStr, westStr, eastStr] = row.boundingbox;
  const south = Number(southStr);
  const north = Number(northStr);
  const west = Number(westStr);
  const east = Number(eastStr);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  let w = west;
  let e = east;
  let sou = south;
  let nor = north;
  if (Math.abs(nor - sou) < 0.02 || Math.abs(e - w) < 0.02) {
    const cLat = Number(row.lat);
    const cLon = Number(row.lon);
    if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) return null;
    w = cLon - 0.06;
    e = cLon + 0.06;
    sou = cLat - 0.05;
    nor = cLat + 0.05;
  }
  return {
    ...row,
    geojson: {
      type: "Polygon",
      coordinates: [[[w, sou], [e, sou], [e, nor], [w, nor], [w, sou]]],
    },
  };
}

/** Une resultados favoreciendo Nominatim (polígonos OSM / admin) antes que Photon. */
function mergePolygonCandidates(primary: NominatimResult[], secondary: NominatimResult[]): NominatimResult[] {
  const picked: NominatimResult[] = [];
  const seen = new Set<string>();
  const pushUnique = (r: NominatimResult) => {
    const la = Number(r.lat);
    const lo = Number(r.lon);
    if (!isAreaGeometry(r.geojson) || !Number.isFinite(la) || !Number.isFinite(lo)) return;
    const k = `${la.toFixed(2)},${lo.toFixed(2)}`;
    if (seen.has(k)) return;
    seen.add(k);
    picked.push(r);
  };
  primary.forEach(pushUnique);
  secondary.forEach(pushUnique);
  return picked.slice(0, 14);
}

const localAreaSeeds: LocalAreaSeed[] = [
  {
    label: "Santiago de Chile, Chile",
    country: "cl",
    lat: -33.4489,
    lon: -70.6693,
    zoom: 8,
    geojson: {
      type: "Polygon",
      coordinates: [[
        [-71.05, -33.15],
        [-70.25, -33.15],
        [-70.25, -33.85],
        [-71.05, -33.85],
        [-71.05, -33.15],
      ]],
    },
  },
  {
    label: "Montevideo, Uruguay",
    country: "uy",
    lat: -34.9011,
    lon: -56.1645,
    zoom: 9,
    geojson: {
      type: "Polygon",
      coordinates: [[
        [-56.55, -34.68],
        [-55.95, -34.68],
        [-55.95, -35.2],
        [-56.55, -35.2],
        [-56.55, -34.68],
      ]],
    },
  },
  {
    label: "Asunción, Paraguay",
    country: "py",
    lat: -25.2637,
    lon: -57.5759,
    zoom: 9,
    geojson: {
      type: "Polygon",
      coordinates: [[
        [-57.9, -25.0],
        [-57.3, -25.0],
        [-57.3, -25.6],
        [-57.9, -25.6],
        [-57.9, -25.0],
      ]],
    },
  },
];

function FitGeoJsonBounds({ geoJson }: { geoJson?: GeoJSON.Feature | GeoJSON.FeatureCollection | null }) {
  const map = useMap();
  useEffect(() => {
    if (!geoJson) return;
    const layer = geoJSON(geoJson as any);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [geoJson, map]);
  return null;
}

export function ExpirationConfig() {
  const { expirationRules, setExpirationRules, zones, addZone, updateZone, removeZone } = useOperationsData();
  const [configs, setConfigs] = useState(expirationRules);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({
    name: "",
    colorClass: "bg-blue-500",
    lat: "-34.6037",
    lng: "-58.3816",
    zoom: "5",
  });
  const [mapQuery, setMapQuery] = useState("");
  const [isSearchingArea, setIsSearchingArea] = useState(false);
  const [countryScope, setCountryScope] = useState<MapCountryScope>("all");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [selectedAreaGeoJson, setSelectedAreaGeoJson] = useState<GeoJSON.Feature | GeoJSON.FeatureCollection | null>(null);
  const [selectedAreaLabel, setSelectedAreaLabel] = useState("");

  const safeMapCenter = (() => {
    const lat = Number(zoneForm.lat);
    const lng = Number(zoneForm.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [-34.6037, -58.3816] as [number, number];
    return [lat, lng] as [number, number];
  })();

  const safeMapZoom = (() => {
    const zoom = Number(zoneForm.zoom);
    if (!Number.isFinite(zoom)) return 6;
    return Math.max(3, Math.min(15, Math.round(zoom)));
  })();

  const formatZoneCenter = (zone: { mapCenter: [number, number]; zoom: number }) => {
    const lat = Number(zone.mapCenter?.[0]);
    const lng = Number(zone.mapCenter?.[1]);
    const zoom = Number(zone.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) {
      return "Centro no definido";
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)} · z${zoom}`;
  };

  useEffect(() => {
    setConfigs(expirationRules);
  }, [expirationRules]);

  const colorOptions = useMemo(
    () => ["bg-blue-500", "bg-teal-500", "bg-orange-500", "bg-purple-500", "bg-indigo-500", "bg-pink-500"],
    [],
  );

  const toggleEnabled = (id: number) => {
    setConfigs((prev) => {
      const next = prev.map((config) => (config.id === id ? { ...config, enabled: !config.enabled } : config));
      setExpirationRules(next);
      return next;
    });
  };

  const getFrequencyBadge = (frequency: string) => {
    const colors: Record<string, any> = {
      "Anual": "secondary",
      "Semestral": "outline",
      "Trimestral": "warning",
      "Mensual": "destructive",
    };
    return colors[frequency] || "default";
  };

  const openCreateZone = () => {
    setEditingZoneId(null);
    setZoneForm({
      name: "",
      colorClass: "bg-blue-500",
      lat: "-34.6037",
      lng: "-58.3816",
      zoom: "5",
    });
    setMapQuery("");
    setSearchResults([]);
    setSelectedAreaGeoJson(null);
    setSelectedAreaLabel("");
    setIsZoneModalOpen(true);
  };

  const openEditZone = (zoneId: string) => {
    const zone = zones.find((item) => item.id === zoneId);
    if (!zone) return;
    const lat = Number(zone.mapCenter?.[0]);
    const lng = Number(zone.mapCenter?.[1]);
    const zoom = Number(zone.zoom);
    setEditingZoneId(zoneId);
    setZoneForm({
      name: zone.name,
      colorClass: zone.colorClass,
      lat: String(Number.isFinite(lat) ? lat : -34.6037),
      lng: String(Number.isFinite(lng) ? lng : -58.3816),
      zoom: String(Number.isFinite(zoom) ? zoom : 6),
    });
    setSelectedAreaGeoJson(zone.areaGeoJson ?? null);
    setSelectedAreaLabel(zone.name);
    setMapQuery(zone.name);
    setSearchResults([]);
    setIsZoneModalOpen(true);
  };

  const applySearchResult = (result: NominatimResult) => {
    if (!isAreaGeometry(result.geojson)) {
      toast.error("El resultado seleccionado no tiene un área poligonal válida.");
      return;
    }
    const feature: GeoJSON.Feature = {
      type: "Feature",
      properties: { display_name: result.display_name },
      geometry: result.geojson,
    };
    setSelectedAreaGeoJson(feature);
    setSelectedAreaLabel(result.display_name);
    const centerLat = Number(result.lat);
    const centerLng = Number(result.lon);
    if (!Number.isNaN(centerLat) && !Number.isNaN(centerLng)) {
      setZoneForm((prev) => ({ ...prev, lat: String(centerLat), lng: String(centerLng) }));
    }
    if (result.boundingbox?.length === 4) {
      const [south, north, west, east] = result.boundingbox.map(Number);
      const latSpan = Math.abs(north - south);
      const lngSpan = Math.abs(east - west);
      const maxSpan = Math.max(latSpan, lngSpan);
      const suggestedZoom =
        maxSpan > 25 ? 4 :
        maxSpan > 10 ? 5 :
        maxSpan > 5 ? 6 :
        maxSpan > 2 ? 7 :
        maxSpan > 1 ? 8 : 10;
      setZoneForm((prev) => ({ ...prev, zoom: String(suggestedZoom) }));
    }
  };

  const applyLocalSeed = (seed: LocalAreaSeed) => {
    const feature: GeoJSON.Feature = {
      type: "Feature",
      properties: { display_name: seed.label },
      geometry: seed.geojson,
    };
    setSelectedAreaGeoJson(feature);
    setSelectedAreaLabel(seed.label);
    setZoneForm((prev) => ({
      ...prev,
      lat: String(seed.lat),
      lng: String(seed.lon),
      zoom: String(seed.zoom),
    }));
  };

  const applyLocalFallback = (queryNorm: string) => {
    const tokens = queryNorm.split(/[\s,]+/).filter((t) => t.length >= 3);
    const localMatches = localAreaSeeds.filter((seed) => {
      const countryMatch = countryScope === "all" ? true : seed.country === countryScope;
      const labelLo = seed.label.toLowerCase();
      const textMatch =
        labelLo.includes(queryNorm) ||
        tokens.some((t) => t.length >= 4 && labelLo.includes(t)) ||
        (tokens.length >= 2 && tokens.every((t) => labelLo.includes(t)));
      return countryMatch && textMatch;
    });
    if (localMatches.length) {
      applyLocalSeed(localMatches[0]);
      setSearchResults([]);
      toast.info("Área cargada desde catálogo local de demo (sin conexión a servicios remotos).");
      return true;
    }
    return false;
  };

  const searchAreaOnMap = async () => {
    const query = mapQuery.trim();
    if (!query) return;
    const queryNorm = query.toLowerCase();
    setIsSearchingArea(true);
    try {
      const provinciaArg =
        countryScope === "ar" || countryScope === "all"
          ? await fetchArgentinaProvinciaResult(query)
          : null;
      const [fromNom, fromPhoton] = await Promise.all([
        fetchNominatimCandidates(query, countryScope).then((rows) =>
          rows.map((item) => nominatimWithFallbackPolygon(item, countryScope)).filter((item): item is NominatimResult => !!item && isAreaGeometry(item.geojson)),
        ),
        fetchPhotonCandidates(query, countryScope).then((rows) => rows.filter((item) => isAreaGeometry(item.geojson))),
      ]);
      const withProvinciaFirst = mergePolygonCandidates(provinciaArg ? [provinciaArg] : [], fromNom);
      const candidates = mergePolygonCandidates(withProvinciaFirst, fromPhoton);
      setSearchResults(candidates);

      if (candidates.length === 1) {
        applySearchResult(candidates[0]);
        toast.success("Área localizada.");
      } else if (candidates.length > 1) {
        toast.message("Varios lugares coinciden: elegí uno de la lista.");
      } else if (!applyLocalFallback(queryNorm)) {
        toast.error("No se encontraron resultados. Probá otro nombre, país o una región más amplia.");
      }
    } catch {
      if (!applyLocalFallback(queryNorm)) {
        toast.error("Ocurrió un error inesperado al buscar. Reintentá o usá un catálogo local (p. ej. «Rosario»).");
      }
    } finally {
      setIsSearchingArea(false);
    }
  };

  const submitZone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lat = Number(zoneForm.lat);
    const lng = Number(zoneForm.lng);
    const zoom = Number(zoneForm.zoom);
    if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(zoom)) {
      toast.error("Latitud, longitud y zoom deben ser valores numéricos válidos.");
      return;
    }
    const geometry =
      selectedAreaGeoJson?.type === "FeatureCollection"
        ? selectedAreaGeoJson.features?.[0]?.geometry
        : selectedAreaGeoJson?.geometry;
    if (!isAreaGeometry(geometry ?? null)) {
      toast.error("Debes seleccionar un área válida en el mapa para guardar la zona.");
      return;
    }
    const payload = {
      name: zoneForm.name,
      colorClass: zoneForm.colorClass,
      mapCenter: [lat, lng] as [number, number],
      zoom,
      areaGeoJson: selectedAreaGeoJson,
    };
    if (editingZoneId) {
      updateZone(editingZoneId, payload);
    } else {
      addZone(payload);
    }
    setIsZoneModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Configuraciones del Sistema</h1>
          <p className="text-sm text-muted-foreground">Centraliza reglas operativas y parametrización de zonas en un único módulo.</p>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          <Settings className="h-4 w-4 mr-2" />
          Configuración centralizada
        </Badge>
      </div>

      <Tabs defaultValue="zones" className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="zones">Zonas operativas</TabsTrigger>
          <TabsTrigger value="expiration">Reglas de vencimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Zonas dinámicas y configurables
                </CardTitle>
                <Button onClick={openCreateZone}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Nueva zona
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3">Zona</th>
                      <th className="text-left p-3">Color</th>
                      <th className="text-left p-3">Área asignada</th>
                      <th className="text-left p-3">Centro mapa</th>
                      <th className="text-left p-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map((zone) => (
                      <tr key={zone.id} className="border-b border-border hover:bg-muted/50">
                        <td className="p-3">
                          <div className="space-y-1">
                            <p>{zone.name}</p>
                            <p className="text-xs text-muted-foreground">{zone.id}</p>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex h-3 w-3 rounded-full ${zone.colorClass}`} />
                        </td>
                        <td className="p-3 text-sm">{zone.areaGeoJson ? "Definida en mapa" : "Sin área definida"}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {formatZoneCenter(zone)}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEditZone(zone.id)}>
                              <Pencil className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => removeZone(zone.id)}>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Eliminar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Las zonas aquí definidas alimentan automáticamente dashboard, filtros y tablas.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiration" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button>
              <Calendar className="h-4 w-4 mr-2" />
              Nueva Regla
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Reglas de Documentación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3">Tipo de Documento</th>
                      <th className="text-left p-3">Frecuencia de Renovación</th>
                      <th className="text-left p-3">Días de Pre-aviso</th>
                      <th className="text-left p-3">Estado</th>
                      <th className="text-left p-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((config) => (
                      <tr key={config.id} className="border-b border-border hover:bg-muted/50">
                        <td className="p-3">{config.docType}</td>
                        <td className="p-3">
                          <Badge variant={getFrequencyBadge(config.frequency)}>
                            {config.frequency}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {editingId === config.id ? (
                            <input
                              type="number"
                              defaultValue={config.prealertDays}
                              className="w-20 px-2 py-1 border border-border rounded bg-background"
                            />
                          ) : (
                            <span>{config.prealertDays} días</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Switch
                            checked={config.enabled}
                            onCheckedChange={() => toggleEnabled(config.id)}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            {editingId === config.id ? (
                              <Button
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                <Save className="h-4 w-4 mr-1" />
                                Guardar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingId(config.id)}
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Editar
                              </Button>
                            )}
                          </div>
                        </td>
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
                <CardTitle>Reglas Activas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl text-green-600">
                  {configs.filter(c => c.enabled).length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Reglas Inactivas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl text-muted-foreground">
                  {configs.filter(c => !c.enabled).length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Total de Reglas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl">{configs.length}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isZoneModalOpen} onOpenChange={setIsZoneModalOpen}>
        <DialogContent className="h-[90vh] w-[96vw] max-w-4xl overflow-y-auto p-0">
          <DialogHeader>
            <DialogTitle className="px-6 pt-6">{editingZoneId ? "Editar zona" : "Crear nueva zona"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 px-6 pb-6" onSubmit={submitZone}>
            <div className="space-y-2">
              <Label>Nombre visible de zona</Label>
              <Input
                placeholder="Ej: Centro-Norte"
                value={zoneForm.name}
                onChange={(event) => setZoneForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Color operativo</Label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((color) => (
                  <button
                    type="button"
                    key={color}
                    onClick={() => setZoneForm((prev) => ({ ...prev, colorClass: color }))}
                    className={`h-8 w-8 rounded-full border-2 ${color} ${zoneForm.colorClass === color ? "border-foreground" : "border-transparent"}`}
                    aria-label={`Seleccionar ${color}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Buscar área en el mapa</Label>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr_auto]">
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={countryScope}
                  onChange={(event) => setCountryScope(event.target.value as MapCountryScope)}
                >
                  <option value="all">Todos los países</option>
                  <option value="ar">Argentina</option>
                  <option value="uy">Uruguay</option>
                  <option value="cl">Chile</option>
                  <option value="py">Paraguay</option>
                  <option value="bo">Bolivia</option>
                  <option value="br">Brasil</option>
                </select>
                <Input
                  placeholder="Ej: Santiago de Chile"
                  value={mapQuery}
                  onChange={(event) => setMapQuery(event.target.value)}
                />
                <Button type="button" variant="outline" onClick={searchAreaOnMap} disabled={isSearchingArea}>
                  <Search className="h-4 w-4 mr-2" />
                  {isSearchingArea ? "Buscando..." : "Buscar"}
                </Button>
              </div>
              {selectedAreaLabel ? (
                <p className="text-xs text-muted-foreground">Área seleccionada: {selectedAreaLabel}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Busca una ciudad o región para sombrear y asignar el área de la zona.</p>
              )}
            </div>

            {searchResults.length > 1 ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-2 text-xs text-muted-foreground">Resultados encontrados: selecciona la ubicación exacta</p>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {searchResults.map((result, idx) => (
                    <button
                      key={`${result.display_name}-${idx}`}
                      type="button"
                      onClick={() => applySearchResult(result)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      {result.display_name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-border">
              <MapContainer center={safeMapCenter} zoom={safeMapZoom} className="h-[300px] w-full md:h-[380px]" scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />
                {selectedAreaGeoJson ? (
                  <>
                    <GeoJSON data={selectedAreaGeoJson as any} style={{ color: "#2563eb", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.25 }} />
                    <FitGeoJsonBounds geoJson={selectedAreaGeoJson} />
                  </>
                ) : null}
              </MapContainer>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Latitud centro</Label>
                <Input value={zoneForm.lat} onChange={(event) => setZoneForm((prev) => ({ ...prev, lat: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Longitud centro</Label>
                <Input value={zoneForm.lng} onChange={(event) => setZoneForm((prev) => ({ ...prev, lng: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Zoom</Label>
                <Input type="number" min={3} max={15} value={zoneForm.zoom} onChange={(event) => setZoneForm((prev) => ({ ...prev, zoom: event.target.value }))} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsZoneModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!selectedAreaGeoJson}>
                {editingZoneId ? "Guardar cambios" : "Crear zona"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
