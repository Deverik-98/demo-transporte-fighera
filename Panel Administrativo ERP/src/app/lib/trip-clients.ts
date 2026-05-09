/** Empresas para las que el operador debe cargar el número de remito manualmente. */
export const PRINCIPAL_CLIENT_COMPANIES = ["SIDERSA", "Acindar", "CIPLAR"] as const;

export type PrincipalClientCompany = (typeof PRINCIPAL_CLIENT_COMPANIES)[number];

export function isPrincipalClientCompany(name: string): boolean {
  const t = name.trim().toLowerCase();
  return PRINCIPAL_CLIENT_COMPANIES.some((c) => c.toLowerCase() === t);
}

/** Referencia única generada por el sistema cuando el cliente no es SIDERSA / Acindar / CIPLAR. */
export function generateSystemRemitoReference(sequence: number): string {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `SYS-${String(sequence).padStart(5, "0")}-${suffix}`;
}
