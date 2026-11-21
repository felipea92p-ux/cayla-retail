// Análisis (ADR-0357): la pestaña «No se vende», en lógica pura (sin base ni React), probada en `analisis-quietas.test.ts`.
// Qué grupo le toca a cada prenda lo decide `grupoDe` (analisis-reglas.ts) y aquí no se repite: esto reparte los modelos en sus grupos,
// dice cuánta plata tienen parada, a qué tienda van todas y qué se dice cuando no hay nada (cara B, act. 2026-11-21).

import type { PrendaAnalisis } from "./analisis-tipos";
import { diasEntreFechas } from "./fechas-lima";
import { VENTAS_PARA_JUZGAR_SOLA } from "./frescura-reglas";
import { GRUPOS_CARRIL_QUIETAS, grupoDe, ordenQuietas, plural, prendasDe, sedeQueMasVende, totalEnTienda, umbralLiquidar } from "./analisis-reglas";

/**
 * El nombre de la caja de días (Felipe 2026-11-09): solo manda en los tipos que todavía no tienen ritmo propio, y lo dice en su nombre.
 * Con «Liquidar desde» a secas parecía que movía a todas las prendas, y al bajarla de 7 a 1 «no pasaba nada».
 */
// Cara B (Felipe 2026-11-21): la pantalla ya no dice «liquidar»; el umbral se llama por lo que cuenta.
export const ETIQUETA_LIQUIDAR_DESDE = "Sin venderse desde";

/**
 * La nota del carril: con qué se mide cada tipo (ADR-0357, act. 2026-10-14). Con la vara de su tipo, la caja de días es solo el
 * respaldo de los tipos que todavía no tienen ventas para su ritmo; sin Frescura, se mide todo con la caja. Cuando todos los tipos
 * tienen ritmo, la nota dice que la caja hoy no mueve a ninguno (Felipe 2026-11-09).
 */
export function notaDeUmbrales(prendas: readonly Pick<PrendaAnalisis, "umbrales">[], frescura: "ok" | "sin_modulo" | "fallo" | "no_aplica"): string {
  if (frescura !== "ok") return "Sin el ritmo de cada tipo (Frescura del piso), todo cuenta como «no se vende» desde los días de la caja.";
  const con = prendas.filter((p) => p.umbrales).length;
  if (con === 0) return `Ningún tipo tiene todavía ${VENTAS_PARA_JUZGAR_SOLA} ventas para medir su ritmo: todo cuenta como «no se vende» desde los días de la caja.`;
  if (con === prendas.length) return `Cada tipo cuenta como «no se vende» según lo que tardan en venderse los suyos en tu piso. Los días de la caja solo valen para tipos con menos de ${VENTAS_PARA_JUZGAR_SOLA} ventas, y hoy no hay ninguno.`;
  return `Cada tipo cuenta como «no se vende» según lo que tardan en venderse los suyos en tu piso. Los días de la caja solo valen para tipos con menos de ${VENTAS_PARA_JUZGAR_SOLA} ventas.`;
}

/** Las prendas de cada grupo del carril, cada uno de lo que más espera a lo que menos. Una prenda cae en uno solo. */
export function gruposQuietas<T extends PrendaAnalisis>(prendas: readonly T[], liquidarDesde: number): { enviar: T[]; liquidar: T[]; duda: T[]; vigila: T[] } {
  const grupos = { enviar: [] as T[], liquidar: [] as T[], duda: [] as T[], vigila: [] as T[] };
  for (const p of prendas) {
    const g = grupoDe(p, liquidarDesde);
    if (g === "enviar" || g === "liquidar" || g === "duda" || g === "vigila") grupos[g].push(p);
  }
  grupos.enviar.sort(ordenQuietas);
  grupos.liquidar.sort(ordenQuietas);
  grupos.duda.sort(ordenQuietas);
  grupos.vigila.sort(ordenQuietas);
  return grupos;
}

/**
 * «Enviar todas»: la tienda a la que van todas (la que más las vende), si es la misma para todas; null si van a tiendas
 * distintas (cada fila tiene la suya) o si no hay ninguna.
 */
export function destinoDeTodas(prendas: readonly Pick<PrendaAnalisis, "otras">[]): string | null {
  const destinos = new Set(prendas.map((p) => sedeQueMasVende(p.otras)?.sedeId ?? null));
  if (destinos.size !== 1) return null;
  return [...destinos][0] ?? null;
}

/**
 * Si «No se vende» puede decir algo de esta tienda (ADR-0357, act. 2026-10-14; tarea #2): algún modelo con algo en la tienda lleva en el
 * piso, desde que salió, al menos lo que se espera para liquidarlo (el p90 de su tipo o «Liquidar desde»). Si ninguno llegó todavía
 * —una tienda que vende en el ERP hace menos días que el umbral, o todo se colgó hace poco—, que nada esté quieto no es una buena
 * noticia: todavía no se puede saber.
 */
export function puedeJuzgarQuietas(prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "salioAlPiso" | "umbrales">[], liquidarDesde: number, hoy: string): boolean {
  return prendas.some((p) => totalEnTienda(p) > 0 && p.salioAlPiso !== null && diasEntreFechas(p.salioAlPiso, hoy) >= umbralLiquidar(p, liquidarDesde));
}

/** «Todavía no se puede saber: …» con el umbral que manda (el de cada tipo, o «Liquidar desde» si ningún tipo tiene ritmo). */
export function lineaTodaviaNoQuietas(prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "salioAlPiso" | "umbrales">[], liquidarDesde: number): string {
  if (!prendas.some((p) => totalEnTienda(p) > 0 && p.salioAlPiso !== null)) return "No hay nada colgado que juzgar todavía.";
  return prendas.some((p) => p.umbrales)
    ? "Ningún modelo lleva aún lo que tarda su tipo en venderse."
    : `Ningún modelo lleva aún ${liquidarDesde} ${plural(liquidarDesde, "día", "días")} en el piso.`;
}

export type VacioQuietas = "todo-se-mueve" | "todavia-no" | "sin-datos";

/**
 * Lo que dice la pestaña cuando no hay carril (con las prendas de la tienda, sin buscar): «sin-datos» si no llegó ni una prenda y algo
 * falló al leer (principio 9: nunca «todo se mueve» por un error; la misma regla que «Se está acabando»); «todavia-no» si ningún modelo
 * lleva aún en el piso lo que se espera para juzgarlo (`puedeJuzgarQuietas`: nunca «todo se mueve» por no haber esperado); si no,
 * «todo-se-mueve»; null si hay carril.
 */
export function vacioQuietas(prendas: readonly PrendaAnalisis[], liquidarDesde: number, fallas: number, hoy?: string): VacioQuietas | null {
  if (prendasDe(prendas, GRUPOS_CARRIL_QUIETAS, liquidarDesde).length > 0) return null;
  if (prendas.length === 0 && fallas > 0) return "sin-datos";
  return hoy !== undefined && !puedeJuzgarQuietas(prendas, liquidarDesde, hoy) ? "todavia-no" : "todo-se-mueve";
}

/** El título y la línea de cada vacío («sin-datos» dice lo mismo que en «Se está acabando»; «todavia-no» lleva su línea aparte). */
export const TEXTO_VACIO_QUIETAS: Record<VacioQuietas, { titulo: string; linea: string }> = {
  "todo-se-mueve": { titulo: "Todo se mueve", linea: "Ningún modelo lleva sin venderse más de lo que se vigila." },
  "todavia-no": { titulo: "Todavía no se puede saber", linea: "Ningún modelo lleva aún en el piso lo que se espera." },
  "sin-datos": { titulo: "No pude ver tus prendas", linea: "Vuelve a intentarlo en un rato." },
};

/**
 * La plata parada de un modelo: lo que costó lo que tiene en mi tienda, talla por talla (costo × lo que hay). null si ninguna de sus
 * tallas tiene costo (no se inventa: la pantalla lo dice aparte).
 */
export function plataParada(m: Pick<PrendaAnalisis, "costo" | "piso" | "almacen"> & { variantes?: readonly Pick<PrendaAnalisis, "costo" | "piso" | "almacen">[] }): number | null {
  const tallas = m.variantes?.length ? m.variantes : [m];
  const conCosto = tallas.filter((v) => v.costo !== null);
  if (conCosto.length === 0) return null;
  return conCosto.reduce((t, v) => t + (v.costo ?? 0) * totalEnTienda(v), 0);
}
