// Análisis (ADR-0357): la pestaña «Se acaba», sin React. Desde la cara B (act. 2026-11-21) cada modelo es una tarjeta: cuántos días le
// quedan (o «Ya no hay»), lo que falta, lo que viene en camino y quién más la tiene, en una línea. Quién se acaba, cuántos días le quedan
// y qué viene en camino lo deciden las reglas de `analisis-reglas.ts`: aquí no nace ninguna regla de negocio, solo cómo se dice.

import type { OrigenPrenda, PrendaAnalisis } from "./analisis-tipos";
import type { ModeloAnalisis } from "./analisis-modelo";
import { DIAS_SE_ACABA, diasQueQuedan, esTallaUnica, GRUPOS_ACABA, ordenSeAcaba, otraSedeQueLaTiene, plural, porLlegar, prendasDe, totalEnTienda } from "./analisis-reglas";
import { compararTallas } from "./tallas";
import { fechaCorta } from "./motor-demanda-reglas";

/** Una semana: hasta aquí los días van en rojo, y es la línea punteada del carril. */
export const UNA_SEMANA = 7;

/** Lo que se acaba (grupo «Cómpralas»), de lo más urgente a lo menos: primero lo agotado, a igual plazo lo que más se vende. */
export function prendasQueSeAcaban<T extends PrendaAnalisis>(prendas: readonly T[], liquidarDesde: number): T[] {
  return [...prendasDe(prendas, GRUPOS_ACABA, liquidarDesde)].sort(ordenSeAcaba);
}

const semanas = (dias: number): string => {
  const n = Math.round(dias / UNA_SEMANA);
  return `${n} ${plural(n, "semana", "semanas")}`;
};

/** Si ninguna otra tienda la tiene: a quién se compra («Proveedor taller» / «Proveedor terceros»); null si no se sabe. */
export function textoProveedor(origen: OrigenPrenda | null): string | null {
  if (origen === "taller") return "Proveedor taller";
  if (origen === "terceros") return "Proveedor terceros";
  return null;
}

/**
 * La frase de la respuesta: «cómpralos ya: se acaban en 2 semanas o menos» (el tope de `DIAS_SE_ACABA`). Empieza por cuándo toca: la
 * prueba ciega de /formidable (2026-11-21) confundió «Se acaba» con «Qué pedir»; esta es la compra de ahora, aquella la de la campaña.
 */
export const fraseAcaba = (n: number): string =>
  n === 1 ? `cómpralo ya: se acaba en ${semanas(DIAS_SE_ACABA)} o menos` : `cómpralos ya: se acaban en ${semanas(DIAS_SE_ACABA)} o menos`;

/** Lo que se dice cuando la pestaña no tiene carril: nada se acaba, o no se pudieron leer las prendas. */
export type VacioAcaba = "nada" | "sin-datos";

/**
 * Sin nada que se acabe en la tienda (sin buscar ni filtrar): «Nada se está acabando». Si no llegó ni una prenda y algo falló al
 * leer, no se dice «va bien» por un error (principio 9): se dice que no se pudo ver. null = hay carril.
 */
export function vacioAcaba(c: { prendas: number; seAcaban: number; fallas: number }): VacioAcaba | null {
  if (c.seAcaban > 0) return null;
  return c.prendas === 0 && c.fallas > 0 ? "sin-datos" : "nada";
}

/** El título y la línea de cada vacío. */
export const TEXTO_VACIO_ACABA: Record<VacioAcaba, { titulo: string; linea: string }> = {
  nada: { titulo: "Nada se está acabando", linea: `Todo lo que se vende te dura más de ${semanas(DIAS_SE_ACABA)}.` },
  "sin-datos": { titulo: "No pude ver tus prendas", linea: "Vuelve a intentarlo en un rato." },
};

/** Hasta cuántas tallas se nombran en la píldora «Falta …»; con más, se cuentan («Faltan 3») y se nombran en su tooltip. */
const FALTAN_NOMBRADAS = 2;

/**
 * Lo que ya no hay de un modelo que se acaba (ADR-0357, decisión 12): la talla y el color que se agotaron en mi tienda, de lo que más
 * se vendía a lo que menos. Se nombra la talla (no la única) y el color solo si el modelo tiene varios: «Falta S Arena», «Faltan S y
 * M», «Faltan 3» (con las tres en `todas`). null si no falta ninguna, o si se agotó el modelo entero (eso ya lo dice su pista).
 */
export function faltanDelModelo(m: Pick<ModeloAnalisis, "variantes" | "colores">): { texto: string; todas: string[] } | null {
  const agotadas = m.variantes.filter((v) => totalEnTienda(v) === 0);
  if (agotadas.length === 0 || agotadas.length === m.variantes.length) return null;
  const variosColores = m.colores.filter((c) => c.trim() !== "").length > 1;
  const todas = [...agotadas]
    .sort((a, b) => b.vendidas30 - a.vendidas30 || compararTallas(a.talla, b.talla))
    .map((v) => [esTallaUnica(v.talla) ? null : v.talla, variosColores ? v.color : null].filter(Boolean).join(" ") || v.color || v.talla);
  const verbo = todas.length === 1 ? "Falta" : "Faltan";
  const texto = todas.length <= FALTAN_NOMBRADAS ? `${verbo} ${todas.join(" y ")}` : `${verbo} ${todas.length}`;
  return { texto, todas };
}

/**
 * El número grande de la tarjeta: los días que le quedan al modelo y su unidad («3» «días te quedan»), o «Ya no hay» si se agotó.
 * `urgente`: una semana o menos (rojo profundo); hasta dos semanas, ámbar. null si no tiene ritmo (no se vende: no se acaba).
 */
export function numeroAcaba(m: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasDeVentas">): { numero: string; unidad: string; urgente: boolean } | null {
  const dias = diasQueQuedan(m);
  if (dias === null) return null;
  if (dias <= 0) return { numero: "Ya no hay", unidad: "", urgente: true };
  return { numero: String(dias), unidad: plural(dias, "día te queda", "días te quedan"), urgente: dias <= UNA_SEMANA };
}

/** Lo que viene en camino, en pocas palabras: «Llegan 12 el 6 dic.», «Llega 1 hoy», «Llegan 4: debían llegar el 1 oct.». null si nada viene. */
export function textoViene(p: Pick<PrendaAnalisis, "llega">, hoy: string): string | null {
  const n = porLlegar(p);
  if (n <= 0) return null;
  const verbo = n === 1 ? "Llega 1" : `Llegan ${n}`;
  const primera = [...p.llega].filter((x) => x.cantidad > 0 && x.fecha !== null).sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))[0];
  if (!primera?.fecha) return verbo;
  if (primera.fecha === hoy) return `${verbo} hoy`;
  if (primera.fecha < hoy) return `${verbo}: ${n === 1 ? "debía" : "debían"} llegar el ${fechaCorta(primera.fecha)}`;
  return `${verbo} el ${fechaCorta(primera.fecha)}`;
}

/**
 * La línea de detalle de la tarjeta, de lo más útil a lo menos: qué talla falta, qué viene en camino y, si nada viene, quién más la
 * tiene («Arequipa tiene 12») o a quién se compra. `ciudadDe` nombra la otra tienda por su ciudad.
 */
export function detalleAcaba(m: ModeloAnalisis, hoy: string, ciudadDe: (sedeId: string) => string | undefined): string {
  const partes: (string | null | undefined)[] = [faltanDelModelo(m)?.texto, textoViene(m, hoy)];
  if (!textoViene(m, hoy)) {
    const otra = otraSedeQueLaTiene(m.otras);
    const ciudad = otra ? ciudadDe(otra.sedeId) : undefined;
    partes.push(otra && ciudad ? `${ciudad} tiene ${otra.stock}` : textoProveedor(m.origen));
  }
  return partes.filter(Boolean).join(" · ");
}
