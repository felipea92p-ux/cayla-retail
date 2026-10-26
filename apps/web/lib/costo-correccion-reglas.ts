import { leerMonto } from "./precio-sede-reglas";
import { soles } from "./historial-prenda-reglas";

// Corregir el costo de la ÚLTIMA compra de una prenda (Felipe 2026-10-24, ADR-0515): lo que la hoja valida antes de llamar a la base y
// lo que dice después. Las reglas son las MISMAS que hace cumplir `corregir_costo_de_compra` (20261026160000): un costo entre S/ 0.01 y
// S/ 5000 distinto del que ya tiene la compra, y un motivo de 3 a 300 letras. Lógica pura: la usan la hoja y su guía de foco.

export const COSTO_MINIMO = 0.01;
export const COSTO_MAXIMO = 5000;
export const MOTIVO_MINIMO = 3;
export const MOTIVO_MAXIMO = 300;

export type BorradorCorreccion = {
  /** Lo que escribió la persona: «19,50», «S/ 19.50». */
  costo: string;
  motivo: string;
  /** Lo que costó lo que llegó, hoy (el que se está corrigiendo). */
  costoActual: number;
};

/** El costo ya como número (a céntimos), o null si no es un monto válido. */
export function costoEscrito(texto: string): number | null {
  return leerMonto(texto);
}

/** Lo que impide guardar el COSTO, o null. */
export function problemaDelCosto(texto: string, costoActual: number): string | null {
  if (texto.trim() === "") return "Escribe el costo correcto de lo que llegó.";
  const n = costoEscrito(texto);
  if (n === null) return "Escribe el costo como un monto, por ejemplo 19.50.";
  if (n < COSTO_MINIMO || n > COSTO_MAXIMO) return `El costo tiene que estar entre ${soles(COSTO_MINIMO)} y ${soles(COSTO_MAXIMO)}.`;
  if (n === Math.round(costoActual * 100) / 100) return "Ese ya es el costo de esta compra: escribe el correcto.";
  return null;
}

/** Lo que impide guardar el MOTIVO, o null. */
export function problemaDelMotivo(motivo: string): string | null {
  const n = motivo.trim().length;
  if (n < MOTIVO_MINIMO) return "Cuenta en pocas palabras qué estaba mal.";
  if (n > MOTIVO_MAXIMO) return `Cuéntalo en menos de ${MOTIVO_MAXIMO} letras.`;
  return null;
}

/** Lo primero que impide guardar (el costo, después el motivo), o null si se puede. */
export function problemaDeLaCorreccion(b: BorradorCorreccion): string | null {
  return problemaDelCosto(b.costo, b.costoActual) ?? problemaDelMotivo(b.motivo);
}

/** Lo que devuelve `previsualizar_correccion_de_costo`: cuánto costaría cada prenda con el costo nuevo. */
export type VistaPreviaCosto = {
  llegaron: number;
  stock: number;
  /** Hoy, a nivel prenda, antes y con la corrección. */
  hoyAntes: number | null;
  hoyDespues: number | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** La vista previa tal como la devolvió la base, o null si no vino (no es líder, la compra ya no es la última…). */
export function leerVistaPrevia(json: unknown): VistaPreviaCosto | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const llegaron = num(j.llegaron);
  if (llegaron === null) return null;
  return { llegaron, stock: Math.max(0, num(j.stock) ?? 0), hoyAntes: num(j.hoy_antes), hoyDespues: num(j.hoy_despues) };
}

/** «Hoy cada prenda te cuesta S/ 19.57 · con la corrección, S/ 19.49» (o «igual»). Vacío si falta una de las dos cifras. */
export function fraseDeVistaPrevia(v: VistaPreviaCosto): string {
  if (v.hoyAntes === null || v.hoyDespues === null) return "";
  if (v.hoyAntes === v.hoyDespues) return `Hoy cada prenda te cuesta ${soles(v.hoyAntes)} y seguiría igual.`;
  return `Hoy cada prenda te cuesta ${soles(v.hoyAntes)}; con la corrección, ${soles(v.hoyDespues)}.`;
}

/**
 * La frase de un rechazo de `corregir_costo_de_compra`. La base responde con un código (`costo_no_es_la_ultima`) y un `hint` que ya
 * está en palabras de tienda: se usa ese. Null si el error no es de esta función (lo traduce quien llama).
 */
export function fraseDeErrorDeCorreccion(error: { message?: string | null; hint?: string | null } | null | undefined): string | null {
  const m = error?.message ?? "";
  if (!/^costo_[a-z_]+$/.test(m)) return null;
  return error?.hint?.trim() || null;
}

/** El doble clic o una corrección ya hecha por otra persona: la base dice «sin cambios» y la pantalla lo toma como hecho. */
export const esCorreccionYaHecha = (error: { message?: string | null } | null | undefined): boolean => error?.message === "costo_sin_cambios";

/** Lo que cuesta cada prenda hoy, ya corregido, según lo que devolvió `corregir_costo_de_compra`; null si no vino. */
export function hoyTrasCorregir(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  return num((json as Record<string, unknown>).hoy_despues);
}
