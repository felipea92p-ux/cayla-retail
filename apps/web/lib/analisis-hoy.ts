// Análisis (ADR-0357): la pestaña «Hoy» en lógica pura (sin base ni React). Desde la cara B «Una respuesta por pregunta» (act.
// 2026-11-21) son cuatro tarjetas, una por pregunta de la tienda, con su respuesta en grande y su botón (`components/analisis/PestanaHoy.tsx`);
// el flujo de cintas «Qué hacer hoy» se fue con la B. Todo es de la tienda elegida arriba (la comparación de las tres tiendas vive en
// CAYLA Global: decisión 3 de ADR-0357, act. 2026-10-06). Ninguna regla de negocio nueva: los grupos salen de `grupoDe`
// (`analisis-reglas.ts`); aquí solo se cuenta y se dice.

import type { PrendaAnalisis } from "./analisis-tipos";
import { GRUPOS_ACABA, GRUPOS_QUIETAS, ordenQuietas, ordenSeAcaba, prendasDe } from "./analisis-reglas";
import { lineaTodaviaNoQuietas, puedeJuzgarQuietas } from "./analisis-quietas";

/** Los estados que usa Hoy (los mismos cinco de la maqueta: urgente, atención, va bien, para saber, todavía no). */
export type EstadoHoy = "urg" | "ate" | "bien" | "info" | "nd";

// ───────────────────────── Las cuatro tarjetas ─────────────────────────

/** «¿Qué se acaba?»: lo que se está acabando, de lo más urgente a lo menos (la tarjeta muestra las 5 primeras). */
export function seAcabanHoy<T extends PrendaAnalisis>(prendas: readonly T[], liquidarDesde: number): T[] {
  return prendasDe(prendas, GRUPOS_ACABA, liquidarDesde).sort(ordenSeAcaba);
}

/** «¿Qué no se mueve?»: lo quieto desde el umbral (mandar o liquidar), de lo que más espera a lo que menos. */
export function quietasHoy<T extends PrendaAnalisis>(prendas: readonly T[], liquidarDesde: number): T[] {
  return prendasDe(prendas, GRUPOS_QUIETAS, liquidarDesde).sort(ordenQuietas);
}

/**
 * El estado de una tarjeta de Hoy que no encontró nada (ADR-0357, act. 2026-10-14; tarea #2): «Va bien» SOLO con los datos de la tienda
 * confiables. Con el aviso de «Datos incompletos» arriba, que no aparezca nada no es una buena noticia: «Para saber» (pizarra), y la
 * frase empieza por «Con lo registrado».
 */
export const estadoSinNada = (confiable: boolean): Extract<EstadoHoy, "bien" | "info"> => (confiable ? "bien" : "info");
export const conLoRegistrado = (frase: string, confiable: boolean): string => (confiable ? frase : `Con lo registrado, ${frase.charAt(0).toLowerCase()}${frase.slice(1)}`);

/**
 * «¿Qué no se mueve?» sin nada quieto: si ningún modelo lleva todavía en el piso lo que se espera para juzgarlo, «Todavía no se puede
 * saber» (pizarra), nunca «Va bien»; si ya se puede, que nada esté quieto (con los umbrales de cada tipo o «Liquidar desde»).
 */
export function vacioQuietasHoy(
  prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "salioAlPiso" | "umbrales">[],
  liquidarDesde: number,
  hoy: string,
  confiable: boolean,
): { est: Extract<EstadoHoy, "bien" | "info">; texto: string } {
  if (!puedeJuzgarQuietas(prendas, liquidarDesde, hoy)) return { est: "info", texto: `Todavía no se puede saber. ${lineaTodaviaNoQuietas(prendas, liquidarDesde)}` };
  const frase = prendas.some((p) => p.umbrales) ? "Nada está quieto para lo que tarda su tipo." : `Nada lleva ${liquidarDesde} días sin venderse.`;
  return { est: estadoSinNada(confiable), texto: conLoRegistrado(frase, confiable) };
}
