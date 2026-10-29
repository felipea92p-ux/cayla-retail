// Finanzas ▸ Impuestos en la barra común de «El telar» (ADR-0493): cómo nombra la sede elegida. La respuesta grande ya no vive aquí: desde la
// versión «E · B++» (ADR-0573) la arma `lib/impuestos-cuenta-reglas.ts`.

import { SEDE_TODAS, type ClaveSede, type SedeTelar } from "./finanzas-telar-reglas";

/** Arriba de la cabecera: «Todas las sedes», «Lima», «Empresa». El IGV se declara junto (un RUC), pero se nombra la sede elegida. */
export function sedeDeLaCabecera(elegida: ClaveSede, sedes: readonly SedeTelar[]): string {
  if (elegida === SEDE_TODAS) return "Todas las sedes";
  return sedes.find((s) => s.clave === elegida)?.nombre ?? "Todas las sedes";
}
