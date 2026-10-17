// Análisis v4 (ADR-0357, «Actualización 2026-10-17 — Lo que hoy no se ve: «Sobra» y la talla o el color agotado», B3). Lógica pura (sin base ni React), probada
// en `analisis-sobra.test.ts`.
//
// EL PROBLEMA. Dos cosas que Análisis no decía. (1) **Lo que sobra**: en Trujillo unos 27 modelos y 468 unidades (26 % del stock) tienen para más de 60 días a
// su ritmo y no salen en ninguna pestaña (`grupoDe` devuelve null apenas vendieron algo y la ficha dice «Va bien»): quien compra no ve dónde ya tiene de
// sobra. (2) **La talla o el color agotado** de un modelo que, entero, dura más de 14 días: se vendía la M azul, ya no hay, y el modelo «se acaba» solo cuando
// se acaba entero; 16 a 23 modelos hoy.
//
// LAS REGLAS (D11 y D14, decididas por el orquestador con la recomendación del plan; Felipe puede cambiar una constante cada una):
//   · «Sobra» = el modelo se vende, el ritmo se apoya en 3 ventas o más (con una venta en 17 días y 30 unidades el ritmo puntual da 510 días: eso no es
//     «sobra», es «no se sabe») y lo que tienes dura MÁS de `SOBRA_DIAS` a ese ritmo Y más que el horizonte de «Qué pedir» (la meta de la campaña: contra
//     Navidad con temporada, 90 días no es sobra). Es SOLO información, nunca un botón de rebaja: «Tienes para más de 16 semanas: mira antes de comprar más».
//   · «Reponer talla o color» = un modelo que NO se está acabando entero pero tiene una talla o un color agotado que se vendía (`VENTAS_PARA_REPONER` o más en
//     su ventana). Sin cantidades y sin «al menos 1» (D14).

import type { ModeloAnalisis } from "./analisis-modelo";
import { faltanDelModelo } from "./analisis-acaba";
import type { GrupoAnalisis } from "./analisis-reglas";
import { diasQueQuedan, grupoDe, plural, totalEnTienda } from "./analisis-reglas";

/** Desde cuántos días de venta a su ritmo lo que tienes se llama «sobra» (D11). Un solo lugar para cambiarlo. */
export const SOBRA_DIAS = 90;
/** Cuántas ventas necesita el ritmo para decir «sobra»: con menos, el número saldría de una venta suelta. */
export const VENTAS_PARA_DECIR_SOBRA = 3;
/** Cuántas ventas tiene que haber hecho una talla o un color agotado para pedir que se reponga (D14). */
export const VENTAS_PARA_REPONER = 2;

/** Pasado este tiempo, «más de 16 semanas» deja de ayudar: se dice «más de un año». */
const DIAS_UN_ANO = 365;

/** Los días que tienen que pasar para que algo sobre: el mayor entre `SOBRA_DIAS` y el horizonte de «Qué pedir» (sin horizonte válido, solo `SOBRA_DIAS`). */
export const umbralDeSobra = (horizonteDias: number): number => (Number.isFinite(horizonteDias) ? Math.max(SOBRA_DIAS, Math.ceil(horizonteDias)) : SOBRA_DIAS);

/**
 * ¿Sobra este modelo? Se vende (3 ventas o más en su ventana), no se está acabando, y lo que tiene dura más que el umbral. Devuelve los días a su ritmo
 * (los mismos de `diasQueQuedan`: una sola cuenta) o null.
 */
export function sobraDe(
  p: Pick<ModeloAnalisis, "piso" | "almacen" | "vendidas30" | "diasDeVentas"> & { variantes?: readonly Pick<ModeloAnalisis, "piso" | "almacen" | "vendidas30">[] },
  horizonteDias: number,
): { dias: number } | null {
  if (p.vendidas30 < VENTAS_PARA_DECIR_SOBRA || totalEnTienda(p) <= 0) return null;
  // Un modelo con una talla o un color agotado que se vendía va a «Reponer talla o color» (el stock está en lo que no se vende): no es "sobra", y no sale en las dos.
  if (p.variantes?.some((v) => totalEnTienda(v) === 0 && v.vendidas30 >= VENTAS_PARA_REPONER)) return null;
  const dias = diasQueQuedan(p);
  return dias !== null && dias > umbralDeSobra(horizonteDias) ? { dias } : null;
}

/** El grupo de una prenda para la ficha: el de `grupoDe` o, si no pide nada y sobra, «sobra». */
export function grupoConSobra(p: Parameters<typeof grupoDe>[0] & Pick<ModeloAnalisis, "vendidas30">, horizonteDias: number): GrupoAnalisis | null {
  return grupoDe(p) ?? (sobraDe(p, horizonteDias) ? "sobra" : null);
}

/** Los modelos que sobran, del que más sobra al que menos (a igual tiempo, el que más tiene; después, el nombre). */
export function modelosQueSobran<T extends ModeloAnalisis>(modelos: readonly T[], horizonteDias: number): T[] {
  return modelos
    .map((m) => ({ m, sobra: sobraDe(m, horizonteDias) }))
    .filter((x): x is { m: T; sobra: { dias: number } } => x.sobra !== null)
    .sort((a, b) => b.sobra.dias - a.sobra.dias || totalEnTienda(b.m) - totalEnTienda(a.m) || a.m.nombre.localeCompare(b.m.nombre, "es"))
    .map((x) => x.m);
}

/** «Tienes para más de 16 semanas a este ritmo: mira antes de comprar más.» Solo información: ni cantidades ni un botón de rebaja. */
export function textoSobra(dias: number): string {
  // «Más de N»: N es el entero de semanas por debajo (13 semanas justas son «más de 12»), nunca igual al valor.
  const semanas = Math.ceil(dias / 7) - 1;
  const tiempo = dias > DIAS_UN_ANO ? "un año" : `${semanas} ${plural(semanas, "semana", "semanas")}`;
  return `Tienes para más de ${tiempo} a este ritmo: mira antes de comprar más.`;
}

/**
 * Los modelos que no se están acabando enteros pero tienen una talla o un color agotado que se vendía (2 o más ventas), de los que más vendían a los que menos.
 * `faltan` dice cuáles con las mismas palabras que «Se está acabando» (`faltanDelModelo`), contando solo las que se vendían. Un modelo agotado entero ya está en
 * «Se está acabando» y no entra aquí.
 */
export function modelosPorReponer<T extends ModeloAnalisis>(modelos: readonly T[]): { modelo: T; faltan: { texto: string; todas: string[] }; vendidas: number }[] {
  const filas: { modelo: T; faltan: { texto: string; todas: string[] }; vendidas: number }[] = [];
  for (const m of modelos) {
    if (grupoDe(m) === "comprar") continue;
    const seVendian = m.variantes.filter((v) => totalEnTienda(v) === 0 && v.vendidas30 >= VENTAS_PARA_REPONER);
    if (seVendian.length === 0) continue;
    // `faltanDelModelo` nombra todas las agotadas: aquí solo las que se vendían (las que nunca se vendieron no piden reposición).
    const variantes = m.variantes.filter((v) => totalEnTienda(v) > 0 || v.vendidas30 >= VENTAS_PARA_REPONER);
    const faltan = faltanDelModelo({ variantes, colores: m.colores });
    if (faltan) filas.push({ modelo: m, faltan, vendidas: seVendian.reduce((s, v) => s + v.vendidas30, 0) });
  }
  return filas.sort((a, b) => b.vendidas - a.vendidas || a.modelo.nombre.localeCompare(b.modelo.nombre, "es"));
}
