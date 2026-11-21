// Análisis v4 (ADR-0357, act. 2026-10-07 b): «Nunca salió al piso». Lo que está guardado en el almacén de la tienda y nadie vio
// todavía en el piso de venta. La base dice, por prenda, cuándo salió al piso por primera vez (`salio_al_piso`, NULL si nunca) y
// cuándo llegó (`fn_analisis_sede`, migración 20261007120000); aquí se agrupa y se cuenta para la pestaña y la tarjeta de Hoy.
// Lógica pura, sin base ni React; la prueba es `analisis-piso.test.ts`. No nace ninguna regla de negocio: «nunca salió» es lo
// que dice la base, y el orden es el que Felipe aprobó en la maqueta (2026-10-07): primero el tipo que más se vende.

import type { PrendaAnalisis } from "./analisis-tipos";
import { categoriaDe } from "./analisis-pedir";
import { nuncaSalio } from "./analisis-reglas";
import { diasEntreFechas } from "./fechas-lima";

/** La falla que se dice una vez si la base todavía no dice cuándo salió al piso cada prenda (sin la migración 20261007120000). */
export const FALLA_PISO = "No se pudo saber qué nunca salió al piso";

/** Qué dice el «?» de cada tipo. */
export const AYUDA_TIPO_PISO =
  "Ningún color ni talla de estos modelos se colgó nunca: nadie los vio. Bájalos al piso para que se puedan vender; cuántas, lo eliges en Reponer a piso.";

/** Nunca salió al piso: la regla vive en `analisis-reglas.ts` (la usan también «Qué pedir»); aquí se vuelve a exportar. */
export { nuncaSalio };

/** Días que lleva en mi tienda desde que llegó (hoy = 0); null si no se sabe cuándo llegó. */
export function diasEnAlmacen(p: Pick<PrendaAnalisis, "llego">, hoy: string): number | null {
  if (!p.llego) return null;
  return Math.max(0, diasEntreFechas(p.llego, hoy));
}

const porNombre = (a: PrendaAnalisis, b: PrendaAnalisis): number =>
  a.nombre.localeCompare(b.nombre, "es") || a.color.localeCompare(b.color, "es") || a.talla.localeCompare(b.talla, "es");

/** Las que nunca salieron, de la que más espera a la que menos; a igual espera, la de más unidades; sin fecha, al final. */
export function prendasSinSalir<T extends PrendaAnalisis>(prendas: readonly T[], hoy: string): T[] {
  return prendas
    .filter(nuncaSalio)
    .sort((a, b) => (diasEnAlmacen(b, hoy) ?? -1) - (diasEnAlmacen(a, hoy) ?? -1) || b.almacen - a.almacen || porNombre(a, b));
}

/** Un tipo de prenda de la pestaña: sus prendas que nunca salieron y lo que se dice de él. */
export type TipoPiso<T extends PrendaAnalisis = PrendaAnalisis> = {
  categoria: string;
  prefijo: string | null;
  familia: string | null;
  /** Las que nunca salieron (las que deja ver el buscador), de la que más espera a la que menos. */
  prendas: T[];
  /** Sus unidades guardadas. */
  unidades: number;
  /** Lo que se vendió del tipo en la tienda (todas sus prendas, no solo las guardadas): el orden de la pestaña. */
  vendidas: number;
};

/**
 * Los tipos de la pestaña, empezando por el que más se vende en la tienda (bajar primero lo que más se lleva la gente); a igual
 * venta, el de más unidades guardadas; después, por nombre. `todas` son las prendas de la tienda (para lo vendido); `visibles`,
 * las que deja ver el buscador.
 */
export function tiposPiso<T extends PrendaAnalisis>(todas: readonly PrendaAnalisis[], visibles: readonly T[], hoy: string): TipoPiso<T>[] {
  const vendidasPorTipo = new Map<string, number>();
  for (const p of todas) vendidasPorTipo.set(categoriaDe(p), (vendidasPorTipo.get(categoriaDe(p)) ?? 0) + Math.max(0, p.vendidas30));
  const porTipo = new Map<string, T[]>();
  for (const p of prendasSinSalir(visibles, hoy)) {
    const c = categoriaDe(p);
    porTipo.set(c, [...(porTipo.get(c) ?? []), p]);
  }
  return [...porTipo.entries()]
    .map(([categoria, prendas]) => ({
      categoria,
      prefijo: prendas[0]?.categoriaPrefijo ?? null,
      familia: prendas[0]?.categoriaFamilia ?? null,
      prendas,
      unidades: prendas.reduce((s, p) => s + p.almacen, 0),
      vendidas: vendidasPorTipo.get(categoria) ?? 0,
    }))
    .sort((a, b) => b.vendidas - a.vendidas || b.unidades - a.unidades || a.categoria.localeCompare(b.categoria, "es"));
}

export type VacioPiso = "sin-saber" | "sin-datos" | "todo-salio";

export function vacioPiso(c: { sabePiso: boolean; prendas: number; sinSalir: number; fallas: number }): VacioPiso | null {
  if (c.prendas === 0 && c.fallas > 0) return "sin-datos";
  if (!c.sabePiso) return "sin-saber";
  return c.sinSalir === 0 ? "todo-salio" : null;
}

export const TEXTO_VACIO_PISO: Record<VacioPiso, { titulo: string; linea: string }> = {
  "sin-saber": { titulo: "Todavía no lo puedo saber", linea: "Falta una actualización de la base para saber qué nunca salió al piso. Avisa a Felipe." },
  "sin-datos": { titulo: "No pude ver tus prendas", linea: "Vuelve a intentarlo en un rato." },
  "todo-salio": { titulo: "Todo salió al piso", linea: "De cada modelo que tienes guardado, algo ya estuvo colgado alguna vez." },
};

/**
 * El orden de «Sin salir» (cara B, act. 2026-11-21): «vende» deja el de siempre (primero el tipo que más se vende, `tiposPiso`); «dias»,
 * lo que más espera primero (`prendasSinSalir`); «nombre», de la A a la Z.
 */
export function ordenarPiso<T extends PrendaAnalisis>(lista: readonly T[], orden: string, hoy: string): T[] {
  if (orden === "dias") return prendasSinSalir(lista, hoy);
  if (orden === "nombre") return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return [...lista];
}
