import { useEffect } from "react";
import L from "leaflet";
import type { LatLngExpression } from "leaflet";
import { useMap } from "react-leaflet";

/** Evita sprites rotos del ícono por defecto en Vite (markers con DivIcon claros). */
export const tripManualOriginIcon = L.divIcon({
  className: "!border-0 !bg-transparent focus:outline-none",
  html:
    '<div style="display:flex;width:28px;height:28px;margin:-14px -14px;align-items:center;justify-content:center"><span style="width:18px;height:18px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"><span></span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const tripManualDestIcon = L.divIcon({
  className: "!border-0 !bg-transparent focus:outline-none",
  html:
    '<div style="display:flex;width:28px;height:28px;margin:-14px -14px;align-items:center;justify-content:center"><span style="width:18px;height:18px;background:#059669;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"><span></span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const tripManualMidIcon = L.divIcon({
  className: "!border-0 !bg-transparent focus:outline-none",
  html:
    '<div style="display:flex;width:22px;height:22px;margin:-11px -11px;align-items:center;justify-content:center"><span style="width:10px;height:10px;background:#111827;border-radius:999px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const PLACE_TYPE_PHOTON_SCORE: Record<string, number> = {
  city: 90,
  town: 82,
  village: 74,
  hamlet: 68,
  suburb: 62,
  district: 56,
  county: 50,
};

function sanitizeJsonSnippet(text: string) {
  const t = text.trim();
  const i = Math.min(...[t.indexOf("{"), t.indexOf("[")].filter((x) => x >= 0));
  if (!Number.isFinite(i) || i < 0) return null;
  try {
    return JSON.parse(t.slice(i));
  } catch {
    return null;
  }
}

function pickPhotonReverseLabel(fc: { features?: Array<{ properties?: Record<string, unknown> }> }) {
  const list = fc.features ?? [];
  let best: string | null = null;
  let score = -1;
  for (const f of list) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const t = String(p.type ?? p.osm_value ?? "").toLowerCase();
    let s = PLACE_TYPE_PHOTON_SCORE[t] ?? 35;
    if (t === "other" || t === "street" || t === "building" || p.osm_value === "dam") s -= 35;
    if (typeof p.name === "string" && p.name.trim()) s += 25;
    if (typeof p.state === "string" && p.state) s += 10;
    if (typeof p.country === "string") s += 2;
    if (s < 25) continue;
    const locality = typeof p.city === "string" ? p.city : typeof p.town === "string" ? p.town : typeof p.name === "string" ? p.name : null;
    const state = typeof p.state === "string" ? p.state : null;
    const country = typeof p.country === "string" ? p.country : "";
    const parts = [locality, state === locality ? null : state, country !== "Argentina" ? country : null].filter(Boolean) as string[];
    const label = parts.length ? parts.join(", ") : typeof p.name === "string" && p.name ? p.name : null;
    if (!label) continue;
    if (s > score) {
      score = s;
      best = label;
    }
  }
  return best;
}

export async function reverseGeocodePlaceName(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
    if (!r.ok) throw new Error("photon");
    const fc = sanitizeJsonSnippet(await r.text()) as { features?: Array<{ properties?: Record<string, unknown> }> };
    const fromPhoton = fc && typeof fc === "object" ? pickPhotonReverseLabel(fc) : null;
    if (fromPhoton) return fromPhoton;
  } catch {
    /* continuar nominatim */
  }
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json", "Accept-Language": "es-AR,es" } },
    );
    if (!r.ok) throw new Error("nominatim");
    const raw = await r.text();
    const j = sanitizeJsonSnippet(raw) as {
      display_name?: string;
      address?: { city?: string; town?: string; village?: string; suburb?: string; state?: string; county?: string; country?: string };
    };
    const a = j?.address ?? {};
    const head =
      [a.city, a.town, a.village, a.suburb, a.county].find((x) => typeof x === "string" && x.trim()) ?? "";
    const state = typeof a.state === "string" ? a.state : "";
    if (head)
      return [head, state && head !== state ? state : null, (a.country as string | undefined)?.includes("Argentina") ? null : (a.country as string)]
        .filter(Boolean)
        .join(", ");
    if (j?.display_name) return String(j.display_name).split(",").slice(0, 3).join(",").trim();
  } catch {
    /* último recurso corto sin coordenadas largas */
  }
  return "Ubicación en mapa";
}

export async function geocodePlaceName(query: string): Promise<[number, number] | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(`${q}, Argentina`)}&limit=1`);
    if (!r.ok) throw new Error("photon-search");
    const raw = await r.text();
    const j = sanitizeJsonSnippet(raw) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
    const coords = j?.features?.[0]?.geometry?.coordinates;
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
    return [coords[1], coords[0]];
  } catch {
    return null;
  }
}

export async function fetchRoadPolyline(points: [number, number][]): Promise<LatLngExpression[]> {
  if (points.length < 2) return points;
  try {
    const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("osrm");
    const j = (await r.json()) as {
      routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
    };
    const line = j.routes?.[0]?.geometry?.coordinates ?? [];
    if (!line.length) throw new Error("osrm-empty");
    return line.map(([lng, lat]) => [lat, lng]);
  } catch {
    return points;
  }
}

export function AutoFitMapBounds({ path }: { path: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (!path.length) return;
    if (path.length === 1) {
      map.setView(path[0], 12, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(path as [number, number][]);
    map.fitBounds(bounds, { padding: [26, 26], maxZoom: 11, animate: true });
  }, [map, path]);
  return null;
}
