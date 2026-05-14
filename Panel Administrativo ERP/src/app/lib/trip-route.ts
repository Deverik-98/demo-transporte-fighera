import type { LatLngExpression } from "leaflet";

/** Texto compacto de paradas (estilo resumen de ruta). */
export function formatTripRouteStops(
  stops: string[] | undefined | null,
  origin: string,
  destination: string,
): string {
  const raw = Array.isArray(stops) ? stops.map((s) => String(s).trim()).filter(Boolean) : [];
  const list = raw.length >= 2 ? raw : [origin.trim(), destination.trim()].filter(Boolean);
  if (list.length >= 2) return list.join(" · ");
  return `${origin} → ${destination}`;
}

/** Reparte puntos a lo largo de la polilínea base para alinear geometría con cantidad de paradas. */
export function buildPathForStopCount(basePath: LatLngExpression[], stopCount: number): LatLngExpression[] {
  const pts = basePath.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) as [number, number][];
  if (pts.length < 2 || stopCount < 2) return pts;
  if (stopCount === 2) return [pts[0], pts[pts.length - 1]];

  const segLens: number[] = [];
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segLens.push(d);
    sum += d;
  }

  if (sum < 1e-9) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    return Array.from({ length: stopCount }, (_, i) => {
      const t = i / (stopCount - 1);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as LatLngExpression;
    });
  }

  const walkToDistance = (target: number): LatLngExpression => {
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      const L = segLens[i];
      if (acc + L >= target - 1e-12) {
        const local = L > 0 ? (target - acc) / L : 0;
        const p0 = pts[i];
        const p1 = pts[i + 1];
        return [p0[0] + (p1[0] - p0[0]) * local, p0[1] + (p1[1] - p0[1]) * local];
      }
      acc += L;
    }
    return pts[pts.length - 1];
  };

  const out: LatLngExpression[] = [];
  for (let i = 0; i < stopCount; i++) {
    const t = (i / (stopCount - 1)) * sum;
    out.push(walkToDistance(t));
  }
  return out;
}
