// Análisis v4 (ADR-0357): las reglas que deciden en qué grupo cae cada prenda. Lógica pura (sin base ni React): la usan el
// servidor (el resumen de cada tienda) y cada pestaña, así una prenda cae en el mismo grupo en Hoy, en su carril y en su ficha.
//
// Las cifras son las de la maqueta aprobada por Felipe (2026-10-06, artifact TBSFBD1nikBu8FeShiKMMp): se acaba lo que dura dos
// semanas o menos al ritmo de lo vendido en los días de ventas que tiene la tienda, hasta 30 (2026-10-07: antes siempre entre 30); se vigila lo que lleva un mes quieto; se liquida desde el umbral que eligió la tienda
// (60 días por defecto, uno para todos); en rojo, lo de más de 3 meses. El sistema NO decide si pedirla a otra tienda o
// comprarla (decisión 7): todo lo que se acaba aparece para comprar y, si otra tienda la tiene, se dice cuántas tiene.

import type { EdadInventario, PrendaAnalisis, PrendaEnOtraSede, SedeAnalisis, VistaAnalisis } from "./analisis-tipos";
import { VISTAS_ANALISIS } from "./analisis-tipos";
import { diasEntreFechas } from "./fechas-lima";

/** Hasta cuántos días de stock «se está acabando» (el eje del carril llega a 2 semanas). */
export const DIAS_SE_ACABA = 14;
/** Desde cuántos días sin venderse se vigila (un mes). */
export const DIAS_VIGILAR = 30;
/** Desde cuántos días sin venderse va en rojo (3 meses). */
export const DIAS_TRES_MESES = 90;
/** El largo mínimo del carril «Días sin venderse» (4 meses): se alarga si «Liquidar desde» pasa de ahí (`finDelEje`). */
export const DIAS_EJE_QUIETAS = 120;
/**
 * «Liquidar desde»: el valor de fábrica y lo que acepta. Felipe, 2026-10-06: se mueve, no es fijo; 2026-10-07: sin tope, los días que
 * se quiera (de 1 a 999, lo mismo que la base: 20261007100000). Cada toque de − y + suma o resta LIQUIDAR_PASO.
 */
export const LIQUIDAR_DEFECTO = 60;
export const LIQUIDAR_MIN = 1;
export const LIQUIDAR_MAX = 999;
export const LIQUIDAR_PASO = 5;
/** Cuánto tiene que haber vendido otra tienda en 30 días para proponer mandársela («Mándalas a donde sí se venden»). */
export const VENDIDAS_PARA_ENVIAR = 2;
/** La ventana de ventas de Análisis: el ritmo de lo que se vende se mide en hasta 30 días. */
export const VENTANA_VENTAS = 30;

/**
 * Cuántos días de ventas tiene la tienda en el ERP, hasta 30: desde su primera venta, hoy incluido. Sin ventas, 30 (no hay ritmo
 * que medir y la ventana es la de siempre). Ejemplo inventado: una tienda que vende en el ERP desde el 30 de setiembre tiene 8 el
 * 7 de octubre.
 */
export function diasDeVentas(primeraVenta: string | null | undefined, hoy: string): number {
  if (!primeraVenta) return VENTANA_VENTAS;
  return Math.min(VENTANA_VENTAS, Math.max(1, diasEntreFechas(primeraVenta, hoy) + 1));
}

/** Cuántas prendas muestran las listas cortas de Hoy. */
export const PRENDAS_EN_LISTA = 5;

export type GrupoAnalisis = "comprar" | "enviar" | "liquidar" | "vigila";
/** Los grupos de «Se está acabando» y de «No se vende», en el orden de su carril. */
export const GRUPOS_ACABA: readonly GrupoAnalisis[] = ["comprar"];
export const GRUPOS_QUIETAS: readonly GrupoAnalisis[] = ["enviar", "liquidar"];
export const GRUPOS_CARRIL_QUIETAS: readonly GrupoAnalisis[] = ["enviar", "liquidar", "vigila"];

/**
 * Nunca salió al piso (20261007120000): tiene unidades guardadas en mi tienda y la base no sabe de ninguna vez en su piso de venta
 * (ni una bajada, ni una venta). Lo que está colgado ya salió, aunque la base no lo hubiera visto moverse. Vive aquí (y no en
 * `analisis-piso.ts`) porque lo usan «Nunca salió al piso» y «Qué pedir».
 */
export const nuncaSalio = (p: Pick<PrendaAnalisis, "salioAlPiso" | "almacen" | "piso">): boolean => p.salioAlPiso === null && p.almacen > 0 && p.piso === 0;

/** Lo libre en mi tienda. */
export const totalEnTienda = (p: Pick<PrendaAnalisis, "piso" | "almacen">): number => p.piso + p.almacen;

/** Lo que viene en camino, sume de donde sume (compra, almacén, taller, otra tienda). */
export const porLlegar = (p: Pick<PrendaAnalisis, "llega">): number => p.llega.reduce((s, x) => s + x.cantidad, 0);

/**
 * Cuántos días le quedan al ritmo de lo vendido en los días de ventas de la tienda (`diasDeVentas`, hasta 30; Felipe 2026-10-07:
 * una tienda con 8 días en el ERP no divide entre 30): 0 si ya no hay; al menos 1 si queda algo; null si no se vendió (no se
 * acaba: no tiene ritmo).
 */
export function diasQueQuedan(p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasDeVentas">): number | null {
  if (p.vendidas30 <= 0) return null;
  const total = totalEnTienda(p);
  if (total === 0) return 0;
  const ventana = Math.min(VENTANA_VENTAS, Math.max(1, Math.round(p.diasDeVentas ?? VENTANA_VENTAS)));
  return Math.max(1, Math.round(total / (p.vendidas30 / ventana)));
}

/** Se está acabando: se vende y lo que queda dura dos semanas o menos (o ya no hay). */
export function seEstaAcabando(p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasDeVentas">): boolean {
  const d = diasQueQuedan(p);
  return d !== null && d <= DIAS_SE_ACABA;
}

/** La otra tienda que más vendió esta prenda en 30 días (para «Mándalas»); null si ninguna vendió. */
export function sedeQueMasVende(otras: readonly PrendaEnOtraSede[]): PrendaEnOtraSede | null {
  const conVenta = otras.filter((o) => o.vendidas30 > 0);
  if (conVenta.length === 0) return null;
  return [...conVenta].sort((a, b) => b.vendidas30 - a.vendidas30 || b.stock - a.stock || a.sedeId.localeCompare(b.sedeId))[0];
}

/**
 * Otra tienda que la tiene (cualquier cantidad): la que más tiene. Solo es un dato a la vista («AQP tiene 3» y «o pedir a
 * Arequipa»): la persona decide si pedirla o comprarla (decisión 7). null si ninguna la tiene.
 */
export function otraSedeQueLaTiene(otras: readonly PrendaEnOtraSede[]): PrendaEnOtraSede | null {
  const con = otras.filter((o) => o.stock >= 1);
  if (con.length === 0) return null;
  return [...con].sort((a, b) => b.stock - a.stock || b.vendidas30 - a.vendidas30 || a.sedeId.localeCompare(b.sedeId))[0];
}

/**
 * El grupo de una prenda, o null si no pide nada (se vende bien, o lleva menos de un mes quieta). Una prenda vive en UN solo
 * grupo: lo que se acaba se compra; lo quieto desde el umbral se manda a donde sí se vende (si otra tienda vendió 2 o más) o
 * se liquida; lo quieto desde un mes, se vigila.
 */
export function grupoDe(
  p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasSinVender" | "otras" | "diasDeVentas">,
  liquidarDesde: number,
): GrupoAnalisis | null {
  if (seEstaAcabando(p)) return "comprar";
  if (p.vendidas30 > 0 || p.diasSinVender === null || totalEnTienda(p) === 0) return null;
  if (p.diasSinVender < liquidarDesde) return p.diasSinVender >= DIAS_VIGILAR ? "vigila" : null;
  const vende = sedeQueMasVende(p.otras);
  if (vende && vende.vendidas30 >= VENDIDAS_PARA_ENVIAR) return "enviar";
  return "liquidar";
}

/** Las prendas de unos grupos, en el orden en que se atienden. */
export function prendasDe<T extends PrendaAnalisis>(prendas: readonly T[], grupos: readonly GrupoAnalisis[], liquidarDesde: number): T[] {
  const g = new Set(grupos);
  return prendas.filter((p) => {
    const x = grupoDe(p, liquidarDesde);
    return x !== null && g.has(x);
  });
}

/** Lo que se acaba, de lo más urgente a lo menos: primero lo agotado; a igual plazo, lo que más se vende. */
export function ordenSeAcaba(a: PrendaAnalisis, b: PrendaAnalisis): number {
  return (diasQueQuedan(a) ?? Infinity) - (diasQueQuedan(b) ?? Infinity) || b.vendidas30 - a.vendidas30 || a.nombre.localeCompare(b.nombre, "es");
}

/** Lo quieto, de lo que más espera a lo que menos. */
export function ordenQuietas(a: PrendaAnalisis, b: PrendaAnalisis): number {
  return (b.diasSinVender ?? 0) - (a.diasSinVender ?? 0) || totalEnTienda(b) - totalEnTienda(a) || a.nombre.localeCompare(b.nombre, "es");
}

/** Las unidades de mi tienda por tramo de días sin venderse («Por tienda» en No se vende). Sin dato de días, no cuenta. */
export function edadDelInventario(prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "diasSinVender">[]): EdadInventario {
  const e: EdadInventario = { hasta30: 0, de31a60: 0, de61a90: 0, masDe90: 0 };
  for (const p of prendas) {
    const u = totalEnTienda(p);
    if (u <= 0 || p.diasSinVender === null) continue;
    if (p.diasSinVender <= 30) e.hasta30 += u;
    else if (p.diasSinVender <= 60) e.de31a60 += u;
    else if (p.diasSinVender <= 90) e.de61a90 += u;
    else e.masDe90 += u;
  }
  return e;
}

/** «Liquidar desde» dentro de sus topes; lo que no es un número vuelve al de fábrica. */
export function liquidarDesdeValido(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return LIQUIDAR_DEFECTO;
  return Math.min(LIQUIDAR_MAX, Math.max(LIQUIDAR_MIN, Math.round(n)));
}

/** La pestaña de la URL (`?vista=`), o Hoy. */
export function leerVista(v: string | string[] | undefined | null): VistaAnalisis {
  const x = Array.isArray(v) ? v[0] : v;
  return (VISTAS_ANALISIS as readonly string[]).includes(x ?? "") ? (x as VistaAnalisis) : "hoy";
}

/** Busca sin tildes ni mayúsculas en nombre, color, talla y categoría (el buscador de la cabecera). */
export function coincideBusqueda(p: Pick<PrendaAnalisis, "nombre" | "color" | "talla" | "categoria">, q: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const buscado = norm(q.trim());
  if (!buscado) return true;
  return norm([p.nombre, p.color, p.talla, p.categoria ?? ""].join(" ")).includes(buscado);
}

/** Las tallas que no se nombran en una lista corta («Polo Lucky» y no «Polo Lucky · Estándar»). */
export const esTallaUnica = (talla: string): boolean => /^(est[aá]ndar|[uú]nica|unitalla|talla [uú]nica)$/i.test(talla.trim());

/** Ciudad y código de cada tienda, para hablar en tienda: «AQP tiene 3», «o pedir a Arequipa». */
const CIUDADES: readonly { patron: RegExp; codigo: string; ciudad: string }[] = [
  { patron: /\b(tru|trujillo)\b/i, codigo: "TRU", ciudad: "Trujillo" },
  { patron: /\b(aqp|arequipa)\b/i, codigo: "AQP", ciudad: "Arequipa" },
  { patron: /\b(lim|lima)\b/i, codigo: "LIM", ciudad: "Lima" },
];

/** La tienda como la nombra Análisis, a partir de su nombre del sistema («Tienda AQP» → AQP · Arequipa). */
export function sedeDeAnalisis(u: { id: string; nombre: string }): SedeAnalisis {
  const c = CIUDADES.find((x) => x.patron.test(u.nombre));
  if (c) return { id: u.id, nombre: u.nombre, codigo: c.codigo, ciudad: c.ciudad };
  const sinPrefijo = u.nombre.replace(/^tienda\s+/i, "").trim() || u.nombre;
  return { id: u.id, nombre: u.nombre, codigo: sinPrefijo.slice(0, 3).toUpperCase(), ciudad: sinPrefijo };
}

/** «1 prenda» / «3 prendas». */
export const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);
