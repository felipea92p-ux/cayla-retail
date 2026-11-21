// Análisis, cara B (ADR-0357, act. 2026-11-21; Felipe: «hay que darle la facilidad al usuario»): los filtros de toda la pantalla.
//
// EL PROBLEMA PRIMERO. Hasta hoy Análisis solo tenía el buscador: para ver «qué no se vende en talla M» o «lo del Taller que pasa de
// S/ 150» había que recorrer la lista entera a ojo. Ahora la barra de arriba filtra los MODELOS (ADR-0357, decisión 12) por lo que
// Análisis ya lee de cada uno (tipo, talla, color, precio, de dónde viene y cuánto lleva sin venderse), con varias opciones a la vez,
// y lo mismo vale en las cinco pestañas: no cambia ninguna regla de qué se acaba o qué no se vende, solo cuáles se miran.
//
// CÓMO. Un modelo pasa si pasa lo buscado y, en cada filtro puesto, ALGUNA de sus opciones («M o L», «Negro o Vino»). Talla y color se
// miran en sus tallas y colores (`variantes`): un modelo con la M pasa «Talla: M» aunque tenga otras. Cuántos hay en cada opción se
// cuenta sin ese mismo filtro (como Productos, ADR-0308): así se ve cuántos sumaría marcar otra. Lógica pura, probada en
// `analisis-filtros.test.ts`; la barra vive en `components/analisis/FiltrosAnalisis.tsx`.

import type { ModeloAnalisis } from "./analisis-modelo";
import { coincideBusqueda } from "./analisis-reglas";
import { compararTallas } from "./tallas";

/** Los filtros de la barra. Cada lista vacía = sin ese filtro. */
export type FiltrosAnalisis = {
  q: string;
  tipo: readonly string[];
  talla: readonly string[];
  color: readonly string[];
  precio: readonly TramoPrecioAnalisis[];
  origen: readonly OrigenFiltro[];
  quieta: readonly TramoQuieta[];
};

/** Los filtros de lista (todo menos lo buscado). */
export type FacetaAnalisis = Exclude<keyof FiltrosAnalisis, "q">;

export const SIN_FILTROS: FiltrosAnalisis = { q: "", tipo: [], talla: [], color: [], precio: [], origen: [], quieta: [] };

export const FACETAS_ANALISIS: readonly FacetaAnalisis[] = ["tipo", "talla", "color", "precio", "origen", "quieta"];

/** Tres tramos fijos de precio de MI tienda (el del modelo: el promedio de sus tallas, `analisis-modelo.ts`). */
export type TramoPrecioAnalisis = "hasta80" | "81a150" | "mas150";
export const TRAMOS_PRECIO: readonly { valor: TramoPrecioAnalisis; texto: string; pasa: (precio: number) => boolean }[] = [
  { valor: "hasta80", texto: "Hasta S/\u00a080", pasa: (p) => p <= 80 },
  { valor: "81a150", texto: "S/\u00a081 a 150", pasa: (p) => p > 80 && p <= 150 },
  { valor: "mas150", texto: "Más de S/\u00a0150", pasa: (p) => p > 150 },
];

/** De dónde se repone (`PrendaAnalisis.origen`): el Taller de CAYLA o un proveedor. Un modelo sin origen no pasa este filtro. */
export type OrigenFiltro = "taller" | "terceros";
export const ORIGENES: readonly { valor: OrigenFiltro; texto: string }[] = [
  { valor: "taller", texto: "Taller CAYLA" },
  { valor: "terceros", texto: "Un proveedor" },
];

/** Cuánto lleva sin venderse en el piso (`diasSinVender` del modelo). Lo que nunca salió al piso (null) no tiene tramo. */
export type TramoQuieta = "1a2" | "2a3" | "mas3";
export const TRAMOS_QUIETA: readonly { valor: TramoQuieta; texto: string; pasa: (dias: number) => boolean }[] = [
  { valor: "1a2", texto: "1 a 2 meses", pasa: (d) => d >= 30 && d < 60 },
  { valor: "2a3", texto: "2 a 3 meses", pasa: (d) => d >= 60 && d < 90 },
  { valor: "mas3", texto: "Más de 3 meses", pasa: (d) => d >= 90 },
];

const tallasDe = (m: ModeloAnalisis): string[] => (m.variantes.length ? m.variantes.map((v) => v.talla) : [m.talla]);
const coloresDe = (m: ModeloAnalisis): string[] => (m.variantes.length ? m.variantes.map((v) => v.color) : [m.color]);

/** Si el modelo tiene esa opción de ese filtro. */
export function tieneOpcion(m: ModeloAnalisis, faceta: FacetaAnalisis, valor: string): boolean {
  switch (faceta) {
    case "tipo":
      return (m.categoria ?? "") === valor;
    case "talla":
      return tallasDe(m).includes(valor);
    case "color":
      return coloresDe(m).includes(valor);
    case "precio": {
      const tramo = TRAMOS_PRECIO.find((t) => t.valor === valor);
      return m.precio !== null && !!tramo && tramo.pasa(m.precio);
    }
    case "origen":
      return m.origen === valor;
    case "quieta": {
      const tramo = TRAMOS_QUIETA.find((t) => t.valor === valor);
      return m.diasSinVender !== null && !!tramo && tramo.pasa(m.diasSinVender);
    }
  }
}

/** Lo buscado: por el nombre o el tipo del modelo, o por el color o la talla de cualquiera de sus prendas («camel» halla el Chaleco). */
export function pasaBusqueda(m: ModeloAnalisis, q: string): boolean {
  if (!q.trim()) return true;
  return coincideBusqueda(m, q) || m.variantes.some((v) => coincideBusqueda(v, q));
}

/** Si el modelo pasa todos los filtros puestos. `sin`: un filtro que no se mira (para contar sus opciones). */
export function pasaFiltros(m: ModeloAnalisis, f: FiltrosAnalisis, sin?: FacetaAnalisis): boolean {
  if (!pasaBusqueda(m, f.q)) return false;
  return FACETAS_ANALISIS.every((k) => k === sin || f[k].length === 0 || f[k].some((v) => tieneOpcion(m, k, v)));
}

export const filtrarModelos = (modelos: readonly ModeloAnalisis[], f: FiltrosAnalisis): ModeloAnalisis[] => modelos.filter((m) => pasaFiltros(m, f));

/** Cuántos filtros hay puestos (cada opción marcada cuenta una, y lo buscado otra): el globito de «Filtros» en el celular. */
export const cuantosPuestos = (f: FiltrosAnalisis): number => FACETAS_ANALISIS.reduce((n, k) => n + f[k].length, f.q.trim() ? 1 : 0);

export const hayFiltros = (f: FiltrosAnalisis): boolean => cuantosPuestos(f) > 0;

/** Una opción de un filtro con cuántos modelos la tienen (contados con los demás filtros puestos, sin este). `hex`: el color, si es uno. */
export type OpcionFiltro = { valor: string; texto: string; cantidad: number; hex?: string | null };

/** Las opciones de un filtro, sacadas de los modelos de la tienda, con su cuenta. Se listan todas: la pieza esconde las que darían cero. */
export function opcionesDe(modelos: readonly ModeloAnalisis[], f: FiltrosAnalisis, faceta: FacetaAnalisis): OpcionFiltro[] {
  const base = modelos.filter((m) => pasaFiltros(m, f, faceta));
  const contar = (valor: string) => base.filter((m) => tieneOpcion(m, faceta, valor)).length;
  switch (faceta) {
    case "tipo": {
      const tipos = [...new Set(modelos.map((m) => m.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "es"));
      return tipos.map((t) => ({ valor: t, texto: t, cantidad: contar(t) }));
    }
    case "talla": {
      const tallas = [...new Set(modelos.flatMap(tallasDe))].filter(Boolean).sort(compararTallas);
      return tallas.map((t) => ({ valor: t, texto: t, cantidad: contar(t) }));
    }
    case "color": {
      const hex = new Map<string, string | null>();
      for (const m of modelos) for (const v of m.variantes.length ? m.variantes : [m]) if (v.color && !hex.has(v.color)) hex.set(v.color, v.colorHex);
      return [...hex.keys()].sort((a, b) => a.localeCompare(b, "es")).map((c) => ({ valor: c, texto: c, cantidad: contar(c), hex: hex.get(c) ?? null }));
    }
    case "precio":
      return TRAMOS_PRECIO.map((t) => ({ valor: t.valor, texto: t.texto, cantidad: contar(t.valor) }));
    case "origen":
      return ORIGENES.map((o) => ({ valor: o.valor, texto: o.texto, cantidad: contar(o.valor) }));
    case "quieta":
      return TRAMOS_QUIETA.map((t) => ({ valor: t.valor, texto: t.texto, cantidad: contar(t.valor) }));
  }
}

/** El nombre de una opción puesta, para su chip y el vacío («Talla M», «Más de S/ 150»). */
export function textoPuesto(faceta: FacetaAnalisis, valor: string): string {
  if (faceta === "precio") return TRAMOS_PRECIO.find((t) => t.valor === valor)?.texto ?? valor;
  if (faceta === "origen") return ORIGENES.find((o) => o.valor === valor)?.texto ?? valor;
  if (faceta === "quieta") return `Sin venderse ${TRAMOS_QUIETA.find((t) => t.valor === valor)?.texto ?? valor}`;
  if (faceta === "talla") return `Talla ${valor}`;
  return valor;
}

/** Cada opción puesta como un chip que se quita: lo que muestra el vacío y la fila del celular. */
export function puestos(f: FiltrosAnalisis): { faceta: FacetaAnalisis; valor: string; texto: string }[] {
  return FACETAS_ANALISIS.flatMap((k) => f[k].map((v) => ({ faceta: k, valor: v, texto: textoPuesto(k, v) })));
}

/** Quita una opción de un filtro. */
export function quitarOpcion(f: FiltrosAnalisis, faceta: FacetaAnalisis, valor: string): FiltrosAnalisis {
  return { ...f, [faceta]: f[faceta].filter((v) => v !== valor) };
}
