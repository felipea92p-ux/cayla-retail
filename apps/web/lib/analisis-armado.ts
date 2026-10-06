// Análisis v4 (ADR-0357): cómo se arman las prendas de MI tienda con lo leído de las tres. Lógica pura, probada en
// `analisis-armado.test.ts`: el servidor solo lee (`analisis-datos.ts`) y esto cruza.

import type { LlegadaPrenda, PrendaAnalisis, PrendaSede, ResumenSedeAnalisis, SedeAnalisis } from "./analisis-tipos";
import { edadDelInventario, grupoDe, GRUPOS_QUIETAS, totalEnTienda, vendioDe10 } from "./analisis-reglas";

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

/**
 * Lo que se dice de una tienda en «Por tienda»: cuántas se acaban, cuántas no se mueven desde el umbral, cuánto de lo que llegó
 * se vendió y la edad de lo que tiene. Con SUS filas: la red de cada prenda no cambia estas cifras salvo «Mándalas», que mira
 * a las otras tiendas (por eso se le pasan sus filas ya cruzadas).
 */
export function resumenDeSede(sedeId: string, prendas: readonly PrendaAnalisis[], liquidarDesde: number, puedeHablar: boolean): ResumenSedeAnalisis {
  let seAcaban = 0;
  let noSeMueven = 0;
  for (const p of prendas) {
    const g = grupoDe(p, liquidarDesde);
    if (g === "comprar") seAcaban++;
    else if (g !== null && GRUPOS_QUIETAS.includes(g)) noSeMueven++;
  }
  return {
    sedeId,
    seAcaban,
    noSeMueven,
    vendioDe10: vendioDe10(prendas),
    edad: edadDelInventario(prendas),
    unidades: prendas.reduce((s, p) => s + totalEnTienda(p), 0),
    puedeHablar,
  };
}
