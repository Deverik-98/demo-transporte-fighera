import { useEffect, useMemo, useState } from "react";
import { Badge } from "../ui/badge";
import { useOperationsData, ZoneId } from "../../lib/operations-data";
import { Dashboard } from "./dashboard";

const ROTATION_MS = 10000;

export function TVModeDashboard() {
  const { zones } = useOperationsData();
  const [selectedZone, setSelectedZone] = useState<ZoneId>("zona-argentina");
  const [isPaused, setIsPaused] = useState(false);

  const zoneIds = useMemo(() => zones.map((zone) => zone.id), [zones]);

  useEffect(() => {
    if (isPaused || zoneIds.length <= 1) return;
    const timer = window.setInterval(() => {
      setSelectedZone((prev) => {
        const current = zoneIds.indexOf(prev);
        const next = (current + 1) % zoneIds.length;
        return zoneIds[next];
      });
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, zoneIds]);

  useEffect(() => {
    const event = new CustomEvent("tf-select-zone", { detail: { zoneId: selectedZone } });
    window.dispatchEvent(event);
  }, [selectedZone]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
        <div>
          <h1 className="text-2xl">TV Mode · Centro de Operaciones</h1>
          <p className="text-sm text-muted-foreground">Rotación automática entre zonas para monitoreo continuo.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">Zona: {zones.find((zone) => zone.id === selectedZone)?.name ?? selectedZone}</Badge>
          <button
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setIsPaused((prev) => !prev)}
          >
            {isPaused ? "Reanudar rotación" : "Pausar rotación"}
          </button>
        </div>
      </div>
      <Dashboard />
    </div>
  );
}
