import { CheckCircle2, Circle } from "lucide-react";

export type TripStage = "aceptado" | "balanza" | "inicio-carga" | "fin-carga" | "en-ruta" | "llegada";

const FLOW: { id: TripStage; label: string }[] = [
  { id: "aceptado", label: "Aceptar viaje" },
  { id: "balanza", label: "Llegada a balanza" },
  { id: "inicio-carga", label: "Inicio de carga" },
  { id: "fin-carga", label: "Fin de carga" },
  { id: "en-ruta", label: "En ruta" },
  { id: "llegada", label: "Llegada a destino" },
];

export function TripStageStepper({
  currentStage,
  onAdvance,
}: {
  currentStage: TripStage;
  onAdvance: (next: TripStage) => void;
}) {
  const currentIndex = FLOW.findIndex((step) => step.id === currentStage);
  const next = FLOW[currentIndex + 1];

  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <h4 className="mb-2 text-sm font-semibold text-slate-800">Flujo guiado de viaje</h4>
      <div className="space-y-1.5">
        {FLOW.map((step, idx) => {
          const done = idx <= currentIndex;
          return (
            <div key={step.id} className="flex items-center gap-2 text-xs">
              {done ? <CheckCircle2 className="h-4 w-4 text-blue-500" /> : <Circle className="h-4 w-4 text-slate-300" />}
              <span className={done ? "text-slate-800" : "text-slate-500"}>{step.label}</span>
            </div>
          );
        })}
      </div>
      {next && (
        <button
          onClick={() => onAdvance(next.id)}
          className="mt-3 w-full rounded-lg bg-blue-500 py-2 text-xs font-semibold text-white hover:bg-blue-600"
        >
          Registrar: {next.label}
        </button>
      )}
    </div>
  );
}
