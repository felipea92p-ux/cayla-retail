// Análisis v4 (ADR-0357): cómo se arman las prendas de MI tienda con lo leído de las tres. Lógica pura, probada en
// `analisis-armado.test.ts`: el servidor solo lee (`analisis-datos.ts`) y esto cruza.

import type { LlegadaPrenda, PrendaAnalisis, PrendaSede, SedeAnalisis } from "./analisis-tipos";
import { totalEnTienda } from "./analisis-reglas";
import { conPrecioDeLaSede } from "./precio-sede-reglas";

/**
 * Las prendas de MI tienda con el precio al que ESTA tienda las vende (Felipe 2026-10-10: la pantalla de una tienda usa el precio de
 * esa tienda). La base (`fn_analisis_sede`) entrega el precio de la prenda (`variantes.precio`); aquí la que tiene precio propio en
 * la tienda lo toma —la regla de `fn_precio_en_sede`— y de ahí salen «a precio de venta», «Ganas por cada una» y el precio del
 * subtítulo. `propios` es lo de `getPreciosPorSede` para esta tienda (solo las excepciones). `undefined` o vacío: las mismas prendas.
 * Las filas de las OTRAS tiendas no se tocan: de ellas solo se leen unidades y ventas, nunca su precio.
 */
export function conPreciosDeMiTienda(mias: PrendaSede[], propios: Readonly<Record<string, number>> | undefined): PrendaSede[] {
  return conPrecioDeLaSede(mias, propios, (p) => p.varianteId);
}

/**
 * Las prendas de mi tienda con su red: cada una sabe cuánto tiene y vendió cada otra tienda (una fila por tienda, aunque sea
 * 0) y lo que viene en camino. Una prenda que no está en las filas de otra tienda tiene 0 allá.
 */
export function armarPrendas(
  mias: readonly PrendaSede[],
  otrasSedes: readonly { sede: SedeAnalisis; filas: readonly PrendaSede[] }[],
  llega: Readonly<Record<string, readonly LlegadaPrenda[]>>,
): PrendaAnalisis[] {
  const indices = otrasSedes.map(({ sede, filas }) => ({ sede, porVariante: new Map(filas.map((f) => [f.varianteId, f])) }));
  return mias.map((p) => ({
    ...p,
    otras: indices.map(({ sede, porVariante }) => {
      const alla = porVariante.get(p.varianteId);
      return { sedeId: sede.id, stock: alla ? totalEnTienda(alla) : 0, vendidas30: alla?.vendidas30 ?? 0 };
    }),
    llega: [...(llega[p.varianteId] ?? [])],
  }));
}
