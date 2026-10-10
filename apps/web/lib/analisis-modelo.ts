// Análisis v4 (ADR-0357, decisión 12 — Felipe, 2026-10-10): Análisis mide por MODELO, no por talla de un color. «Si dice Chaleco
// Cecia, esto incluye todas las tallas y todos los colores»: si el modelo está colgado en cualquier talla o color, está presentado
// entero; se acaba cuando se acaba el modelo, y no se vende cuando no se vende ninguna de sus tallas ni colores. La talla y el color
// quedan dentro: en el detalle del modelo (qué sale más) y en lo que se hace con él (bajar, mandar o liquidar, prenda por prenda).
//
// EL PROBLEMA PRIMERO. Con 1 a 3 unidades por talla, medir cada talla sola decía del mismo modelo colgado «Se agotó, cómprala» (la S
// que se vendió) y «Nunca salió al piso» (la L guardada). En TRU, el 10 de octubre, 140 de 424 tallas «que nunca salieron» eran de un
// modelo ya colgado, y de 159 que «se acababan», en 87 el modelo entero duraba más de dos semanas.
//
// CÓMO. La base sigue entregando una fila por talla y color (`fn_analisis_sede`); aquí se juntan las del mismo `productoId` en una
// fila con la MISMA forma (`PrendaAnalisis`). Así las reglas de `analisis-reglas.ts` (se acaba, no se vende, nunca salió, el grupo)
// no cambian: cambia la pieza que miden. Lógica pura, probada en `analisis-modelo.test.ts`.

import type { LlegadaPrenda, PrendaAnalisis, PrendaEnOtraSede } from "./analisis-tipos";
import { esTallaUnica, totalEnTienda } from "./analisis-reglas";
import { compararTallas } from "./tallas";
import { diasEntreFechas } from "./fechas-lima";

/** La falla que se dice una vez si la base todavía no dice la última venta de cada prenda (sin la migración 20261010120000). */
export const FALLA_ULTIMA_VENTA = "No se pudo saber la última venta de cada prenda: los días sin venderse de cada modelo son aproximados";

/**
 * Un modelo de mi tienda: todas sus tallas y colores juntos. Tiene la forma de una prenda para que las reglas lo midan igual, con
 * estas lecturas:
 *   · `varianteId` es el id del MODELO (el `productoId`): sirve de llave y para abrir su detalle, nunca para una acción sobre stock
 *     (esas van con `variantes`).
 *   · `color` y `talla`: el único que tiene, o "" si tiene varios (los nombres están en `colores` y `tallas`).
 *   · lo que se cuenta (stock, ventas, semanas, llegadas, lo que hay en otras tiendas y lo que viene) es la suma de sus tallas y colores;
 *   · salió al piso y llegó: la primera vez de cualquiera; la última venta: la más reciente de cualquiera;
 *   · días sin venderse: desde su última venta o desde que el modelo salió al piso, lo que pasó después (`diasSinVenderModelo`).
 */
export type ModeloAnalisis = PrendaAnalisis & {
  /** Sus tallas y colores en mi tienda (las filas de la base), en el orden en que llegaron. */
  variantes: PrendaAnalisis[];
  /** Sus colores y sus tallas, de lo que más se vendió a lo que menos (a igual venta, lo que más hay; después, como vinieron). */
  colores: string[];
  tallas: string[];
};

/** Lo que vale para el modelo sale de su primera fila: nombre, categoría y de dónde se repone son del modelo, no de la talla. */
const delModelo = (v: PrendaAnalisis) => ({
  productoId: v.productoId,
  nombre: v.nombre,
  categoria: v.categoria,
  categoriaPrefijo: v.categoriaPrefijo,
  categoriaFamilia: v.categoriaFamilia,
  origen: v.origen,
  proveedorId: v.proveedorId,
  diasDeVentas: v.diasDeVentas,
});

const suma = (vs: readonly PrendaAnalisis[], campo: (v: PrendaAnalisis) => number): number => vs.reduce((s, v) => s + campo(v), 0);

/** La fecha más temprana o la más tardía de las que se saben (YYYY-MM-DD se compara como texto); null si ninguna. */
function extremo(fechas: readonly (string | null | undefined)[], cual: "primera" | "ultima"): string | null {
  const sabidas = fechas.filter((f): f is string => typeof f === "string");
  if (sabidas.length === 0) return null;
  return sabidas.reduce((a, b) => ((cual === "primera" ? b < a : b > a) ? b : a));
}

/**
 * El precio o el costo del modelo: el promedio de sus tallas y colores que lo tienen, pesado por lo que hay de cada uno (o uno a uno
 * si no hay nada). null si ninguno lo tiene. Las cifras de dinero de cada pestaña se suman prenda por prenda (`variantes`), no con esto.
 */
function promedioPesado(vs: readonly PrendaAnalisis[], campo: (v: PrendaAnalisis) => number | null): number | null {
  const con = vs.filter((v) => campo(v) !== null);
  if (con.length === 0) return null;
  const peso = (v: PrendaAnalisis) => (suma(vs, totalEnTienda) > 0 ? totalEnTienda(v) : 1);
  const pesos = suma(con, peso);
  if (pesos === 0) return Math.round((suma(con, (v) => campo(v) ?? 0) / con.length) * 100) / 100;
  return Math.round((suma(con, (v) => (campo(v) ?? 0) * peso(v)) / pesos) * 100) / 100;
}

/** Lo que el modelo tiene y vendió en cada otra tienda: sus tallas y colores sumados, una fila por tienda (en el orden de siempre). */
function otrasDelModelo(vs: readonly PrendaAnalisis[]): PrendaEnOtraSede[] {
  const porSede = new Map<string, PrendaEnOtraSede>();
  for (const v of vs) {
    for (const o of v.otras) {
      const a = porSede.get(o.sedeId) ?? { sedeId: o.sedeId, stock: 0, vendidas30: 0 };
      porSede.set(o.sedeId, { sedeId: o.sedeId, stock: a.stock + o.stock, vendidas30: a.vendidas30 + o.vendidas30 });
    }
  }
  return [...porSede.values()];
}

/** Lo que viene en camino al modelo: las partes de sus tallas y colores, sumando las que vienen del mismo lado el mismo día. */
function llegaDelModelo(vs: readonly PrendaAnalisis[]): LlegadaPrenda[] {
  const partes = new Map<string, LlegadaPrenda>();
  for (const v of vs) {
    for (const x of v.llega) {
      const k = `${x.de}|${x.fecha ?? ""}`;
      const a = partes.get(k);
      partes.set(k, a ? { ...a, cantidad: a.cantidad + x.cantidad } : { ...x });
    }
  }
  return [...partes.values()];
}

/**
 * Días en el piso sin venderse del MODELO: desde la última venta de cualquiera de sus tallas y colores, o desde que el modelo salió
 * al piso (la primera vez que se colgó cualquiera), lo que pasó después; null si el modelo nunca salió al piso. Colgar hoy otra talla
 * no reinicia la cuenta: el modelo ya estaba a la vista y no se vendió.
 *
 * Sin la última venta de cada fila (la base sin 20261010120000: `ultimaVenta` es undefined en alguna), se cuenta con lo que hay: el
 * menor de los días de sus tallas (lo más reciente que pasó). Casi siempre da lo mismo; difiere si se colgó una talla después de la
 * última venta del modelo (parece más fresco de lo que es). Quien carga los datos dice esa falta una vez.
 */
export function diasSinVenderModelo(vs: readonly PrendaAnalisis[], hoy: string): number | null {
  const salio = extremo(vs.map((v) => v.salioAlPiso), "primera");
  if (salio === null) return null;
  if (vs.every((v) => v.ultimaVenta !== undefined)) {
    const ultima = extremo(vs.map((v) => v.ultimaVenta), "ultima");
    const desde = ultima !== null && ultima > salio ? ultima : salio;
    return Math.max(0, diasEntreFechas(desde, hoy));
  }
  const dias = vs.map((v) => v.diasSinVender).filter((d): d is number => d !== null);
  return dias.length > 0 ? Math.min(...dias) : Math.max(0, diasEntreFechas(salio, hoy));
}

/** Los colores o las tallas del modelo, de lo más vendido a lo menos; a igual venta, lo que más hay; después, en el orden en que vienen. */
function ordenPorVenta(vs: readonly PrendaAnalisis[], clave: (v: PrendaAnalisis) => string): string[] {
  const acc = new Map<string, { vendidas: number; tiene: number; orden: number }>();
  vs.forEach((v, i) => {
    const k = clave(v);
    const a = acc.get(k) ?? { vendidas: 0, tiene: 0, orden: i };
    acc.set(k, { vendidas: a.vendidas + v.vendidas30, tiene: a.tiene + totalEnTienda(v), orden: a.orden });
  });
  return [...acc.entries()].sort(([, a], [, b]) => b.vendidas - a.vendidas || b.tiene - a.tiene || a.orden - b.orden).map(([k]) => k);
}

/** Un modelo a partir de sus tallas y colores (todas del mismo `productoId`; al menos una). */
export function modeloDe(vs: readonly PrendaAnalisis[], hoy: string): ModeloAnalisis {
  const variantes = [...vs];
  const colores = ordenPorVenta(variantes, (v) => v.color);
  const tallas = ordenPorVenta(variantes, (v) => v.talla);
  // La cara del modelo: la foto y el color de lo que más se vende (o, si nada se vendió, de lo que más hay).
  const cara = variantes.find((v) => v.color === colores[0] && v.fotoUrl) ?? variantes.find((v) => v.color === colores[0]) ?? variantes[0];
  const semanas = variantes[0].semanas.map((_, k) => suma(variantes, (v) => v.semanas[k] ?? 0));
  return {
    ...delModelo(variantes[0]),
    varianteId: variantes[0].productoId,
    color: colores.length === 1 ? colores[0] : "",
    colorHex: cara.colorHex,
    talla: tallas.length === 1 ? tallas[0] : "",
    fotoUrl: cara.fotoUrl ?? variantes.find((v) => v.fotoUrl)?.fotoUrl ?? null,
    precio: promedioPesado(variantes, (v) => v.precio),
    costo: promedioPesado(variantes, (v) => v.costo),
    piso: suma(variantes, (v) => v.piso),
    almacen: suma(variantes, (v) => v.almacen),
    vendidas30: suma(variantes, (v) => v.vendidas30),
    semanas,
    diasSinVender: diasSinVenderModelo(variantes, hoy),
    salioAlPiso: extremo(variantes.map((v) => v.salioAlPiso), "primera"),
    ...(variantes.every((v) => v.ultimaVenta !== undefined) ? { ultimaVenta: extremo(variantes.map((v) => v.ultimaVenta), "ultima") } : {}),
    llego: extremo(variantes.map((v) => v.llego), "primera"),
    llegaron30: suma(variantes, (v) => v.llegaron30),
    vendidasDeLasQueLlegaron30: suma(variantes, (v) => v.vendidasDeLasQueLlegaron30),
    otras: otrasDelModelo(variantes),
    llega: llegaDelModelo(variantes),
    variantes,
    colores,
    tallas,
  };
}

/** Los modelos de mi tienda, uno por `productoId`, en el orden en que aparece su primera talla (la base las ordena por nombre). */
export function armarModelos(prendas: readonly PrendaAnalisis[], hoy: string): ModeloAnalisis[] {
  const porModelo = new Map<string, PrendaAnalisis[]>();
  for (const p of prendas) {
    const vs = porModelo.get(p.productoId);
    if (vs) vs.push(p);
    else porModelo.set(p.productoId, [p]);
  }
  return [...porModelo.values()].map((vs) => modeloDe(vs, hoy));
}

/** Las tallas y colores de unos modelos, para lo que se hace prenda por prenda (bajar, mandar, liquidar, pedir). */
export const variantesDe = (modelos: readonly Pick<ModeloAnalisis, "variantes">[]): PrendaAnalisis[] => modelos.flatMap((m) => m.variantes);

/**
 * Lo que el modelo tiene, en una línea bajo su nombre: su color si es uno («Arena»), o cuántos («3 colores»); y sus tallas en orden
 * («S, M, L»; con más de tres, «XS a XL»). La talla única no se nombra. Ejemplo inventado: «2 colores · S, M, L».
 */
export function queTiene(m: Pick<ModeloAnalisis, "colores" | "tallas">): string {
  const colores = m.colores.filter((c) => c.trim() !== "");
  const color = colores.length === 0 ? null : colores.length === 1 ? colores[0] : `${colores.length} colores`;
  const tallas = m.tallas.filter((t) => t.trim() !== "" && !esTallaUnica(t)).sort(compararTallas);
  const talla = tallas.length === 0 ? null : tallas.length <= 3 ? tallas.join(", ") : `${tallas[0]} a ${tallas[tallas.length - 1]}`;
  return [color, talla].filter(Boolean).join(" · ");
}
