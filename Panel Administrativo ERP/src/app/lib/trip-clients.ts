/** Empresas con plan de carga manual (alfanumérico, longitud fija). */
export const PRINCIPAL_CLIENT_COMPANIES = ["Sidersa", "Acindar", "Sipar"] as const;

export type PrincipalClientCompany = (typeof PRINCIPAL_CLIENT_COMPANIES)[number];

const LEGACY_CLIENT_ALIASES: Record<string, PrincipalClientCompany> = {
  sidersa: "Sidersa",
  acindar: "Acindar",
  ciplar: "Sipar",
  sipar: "Sipar",
};

/** Normaliza nombres legacy (Sidersa, Sipar, etc.) al formato acordado con el cliente. */
export function normalizeClientCompanyDisplay(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const canonical = LEGACY_CLIENT_ALIASES[trimmed.toLowerCase()];
  return canonical ?? trimmed;
}

export function isPrincipalClientCompany(name: string): boolean {
  const t = name.trim().toLowerCase();
  return PRINCIPAL_CLIENT_COMPANIES.some((c) => c.toLowerCase() === t);
}

/** Longitud máxima del plan de carga (caracteres) para clientes con nomenclatura; `null` si no aplica. */
export function getPrincipalLoadPlanMaxLength(clientCompany: string): 7 | 8 | null {
  const t = normalizeClientCompanyDisplay(clientCompany).toLowerCase();
  if (t === "sidersa") return 7;
  if (t === "acindar" || t === "sipar") return 8;
  return null;
}

/** Solo letras y números, recortado a la longitud máxima del cliente. */
export function normalizePrincipalLoadPlanValue(raw: string, maxLen: number): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, maxLen);
}

export function isValidPrincipalLoadPlan(clientCompany: string, value: string): boolean {
  const len = getPrincipalLoadPlanMaxLength(clientCompany);
  if (len === null) return false;
  if (value.length !== len) return false;
  return /^[A-Za-z0-9]+$/.test(value);
}

export function loadPlanValidationMessage(clientCompany: string): string {
  const len = getPrincipalLoadPlanMaxLength(clientCompany);
  if (len === 7) return "Ingresá exactamente 7 caracteres alfanuméricos (Sidersa).";
  if (len === 8) return "Ingresá exactamente 8 caracteres alfanuméricos (Acindar / Sipar).";
  return "Plan de carga inválido para este cliente.";
}

/** ID correlativo alfanumérico cuando el cliente no tiene plan manual (mock / sync). */
export function generateAutoLoadPlanReference(sequence: number): string {
  return `AUTO-${String(sequence).padStart(7, "0")}`;
}

/** @deprecated Usar `generateAutoLoadPlanReference`; se mantiene por datos históricos SYS-* en mocks. */
export function generateSystemRemitoReference(sequence: number): string {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `SYS-${String(sequence).padStart(5, "0")}-${suffix}`;
}
