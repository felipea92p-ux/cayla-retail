// Análisis v4 (ADR-0357, act. 2026-10-07 b): «Nunca salió al piso». Lo que está guardado en el almacén de la tienda y nadie vio
// todavía en el piso de venta. La base dice, por prenda, cuándo salió al piso por primera vez (`salio_al_piso`, NULL si nunca) y
// cuándo llegó (`fn_analisis_sede`, migración 20261007120000); aquí se agrupa y se cuenta para la pestaña y la tarjeta de Hoy.
// Lógica pura, sin base ni React; la prueba es `analisis-piso.test.ts`. No nace ninguna regla de negocio: «nunca salió» es lo
// que dice la base, y el orden es el que Felipe aprobó en la maqueta (2026-10-07): primero el tipo que más se vende.

import type { PrendaAnalisis } from "./analisis-tipos";
import { categoriaDe } from "./analisis-pedir";
import { nuncaSalio, plural } from "./analisis-reglas";
import { diasEntreFechas } from "./fechas-lima";

/** La falla que se dice una vez si la base todavía no dice cuándo salió al piso cada prenda (sin la migración 20261007120000). */
export const FALLA_PISO = "No se pudo saber qué nunca salió al piso";

/** Cuántas prendas de cada tipo se ven antes de «Ver N más» (la maqueta aprobada muestra tres). */
export const PRENDAS_POR_TIPO_PISO = 3;

/** El eje de «Días en el almacén» llega a un mes; si algo espera más, a los meses enteros que hagan falta. */
export const DIAS_EJE_PISO = 30;

/** Qué dice el «?» de cada tipo. */
export const AYUDA_TIPO_PISO =
  "Están en tu almacén y nunca se colgaron: nadie las vio. Bájalas al piso para que se puedan vender; cuántas, lo eliges en Reponer a piso.";

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

/** Los modelos que ya tienen algo colgado en mi tienda (otra talla u otro color). */
export function modelosEnElPiso(prendas: readonly Pick<PrendaAnalisis, "productoId" | "piso">[]): Set<string> {
  return new Set(prendas.filter((p) => p.piso > 0).map((p) => p.productoId));
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

/** Las cifras de arriba de la pestaña, de toda la tienda (el buscador no las mueve, como en «No se vende»). */
export type CifrasPiso = {
  prendas: number;
  unidades: number;
  modelos: number;
  /** Lo que costaron las unidades guardadas; null si ninguna tiene costo. */
  costo: number | null;
  /** Lo que valen a precio de venta; null si ninguna tiene precio. */
  precioVenta: number | null;
  /** Cuántas de las que nunca salieron no tienen costo (la cifra de costo no las cuenta). */
  sinCosto: number;
  /** Cuántas son de un modelo que ya está colgado en otra talla u otro color. */
  conModeloEnPiso: number;
};

export function cifrasPiso(todas: readonly PrendaAnalisis[]): CifrasPiso {
  const sin = todas.filter(nuncaSalio);
  const colgados = modelosEnElPiso(todas);
  const conCosto = sin.filter((p) => p.costo !== null);
  const conPrecio = sin.filter((p) => p.precio !== null);
  return {
    prendas: sin.length,
    unidades: sin.reduce((s, p) => s + p.almacen, 0),
    modelos: new Set(sin.map((p) => p.productoId)).size,
    costo: conCosto.length === 0 ? null : conCosto.reduce((s, p) => s + p.almacen * (p.costo ?? 0), 0),
    precioVenta: conPrecio.length === 0 ? null : conPrecio.reduce((s, p) => s + p.almacen * (p.precio ?? 0), 0),
    sinCosto: sin.length - conCosto.length,
    conModeloEnPiso: sin.filter((p) => colgados.has(p.productoId)).length,
  };
}

/** «Dónde está lo que tienes»: las unidades libres de la tienda en el piso, guardadas que ya salieron y guardadas que nunca salieron. */
export type LugarDeLoQueTienes = { piso: number; yaSalieron: number; nunca: number };

export function lugarDeLoQueTienes(todas: readonly PrendaAnalisis[]): LugarDeLoQueTienes {
  let piso = 0;
  let yaSalieron = 0;
  let nunca = 0;
  for (const p of todas) {
    piso += p.piso;
    if (nuncaSalio(p)) nunca += p.almacen;
    else yaSalieron += p.almacen;
  }
  return { piso, yaSalieron, nunca };
}

/** Sin carril: la base todavía no lo sabe, no se pudieron leer las prendas, o todo salió al piso (la respuesta corta y buena). */
export type VacioPiso = "sin-saber" | "sin-datos" | "todo-salio";

export function vacioPiso(c: { sabePiso: boolean; prendas: number; sinSalir: number; fallas: number }): VacioPiso | null {
  if (c.prendas === 0 && c.fallas > 0) return "sin-datos";
  if (!c.sabePiso) return "sin-saber";
  return c.sinSalir === 0 ? "todo-salio" : null;
}

export const TEXTO_VACIO_PISO: Record<VacioPiso, { titulo: string; linea: string }> = {
  "sin-saber": { titulo: "Todavía no lo puedo saber", linea: "Falta una actualización de la base para saber qué nunca salió al piso. Avisa a Felipe." },
  "sin-datos": { titulo: "No pude ver tus prendas", linea: "Vuelve a intentarlo en un rato." },
  "todo-salio": { titulo: "Todo salió al piso", linea: "Todo lo que tienes guardado ya estuvo colgado alguna vez." },
};

/** El fin del eje: un mes, o los meses enteros que hagan falta para que la que más espera quede adentro. */
export function finEjePiso(masDias: number): number {
  return Math.max(DIAS_EJE_PISO, Math.ceil(Math.max(0, masDias) / 30) * 30);
}

/** Las marcas del eje: 0, una y dos semanas (con el eje de un mes) o el primer mes (con uno más largo, donde las semanas se
 *  juntarían), y el fin («1 mes», «2 meses»…). */
export function marcasEjePiso(fin: number): { texto: string; left: string }[] {
  const pct = (d: number) => `${((d / fin) * 100).toFixed(2)}%`;
  const meses = Math.round(fin / 30);
  return [
    { texto: "0", left: "0%" },
    ...(fin <= DIAS_EJE_PISO ? [{ texto: "1 semana", left: pct(7) }, { texto: "2 semanas", left: pct(14) }] : [{ texto: "1 mes", left: pct(30) }]),
    { texto: `${meses} ${plural(meses, "mes", "meses")}`, left: "100%" },
  ];
}

/** «vendiste 38 en 8 días» / «sin ventas en 30 días»: lo vendido del tipo y la ventana de la tienda. */
export function textoVendidasTipo(vendidas: number, diasDeVentas: number): string {
  const dias = `${diasDeVentas} ${plural(diasDeVentas, "día", "días")}`;
  return vendidas > 0 ? `vendiste ${vendidas} en ${dias}` : `sin ventas en ${dias}`;
}

/** «Ver 68 más»: lo que queda bajo el corte de un tipo. */
export const textoVerMas = (n: number): string => `Ver ${n} más`;
