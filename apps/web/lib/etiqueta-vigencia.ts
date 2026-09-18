// En qué momento de su temporada está una etiqueta comercial (Black Friday,
// Día de la Madre…). Las etiquetas sin fechas son permanentes ("Nuevo", "Hecho
// a mano") y devuelven `null`: no tienen temporada de la que estar dentro o fuera.
//
// "Hoy" se calcula en hora de Lima, no en UTC. `new Date().toISOString()` da la
// fecha UTC: pasadas las 7 pm en Lima ya es "mañana" allá, y una campaña que
// termina hoy aparecería como terminada mientras la tienda sigue abierta.

export type Vigencia =
  | { estado: "vigente"; hasta: string | null }
  | { estado: "proxima"; desde: string; enDias: number }
  | { estado: "terminada"; hasta: string };

const DIA_MS = 86_400_000;

/** Fecha de hoy en Lima como `YYYY-MM-DD` (el formato `en-CA` ya es ISO). */
export function hoyLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(ahora);
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

export function vigenciaDe(desde: string | null, hasta: string | null, hoy: string): Vigencia | null {
  if (!desde && !hasta) return null;
  if (desde && desde > hoy) return { estado: "proxima", desde, enDias: diasEntre(hoy, desde) };
  if (hasta && hasta < hoy) return { estado: "terminada", hasta };
  return { estado: "vigente", hasta };
}
