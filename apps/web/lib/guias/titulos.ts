import { GUIAS } from "./registro";
import type { GuiaEnIndice } from "./tipos";

// El título de cada guía y el índice de todas, SOLO para el servidor (ADR-0674 act. g y h).
//
// EL PROBLEMA. «Preguntas del equipo» dice a qué pantalla llevó cada respuesta («→ Caja»). Para ese nombre le preguntaba al registro de
// las guías desde el navegador, y con él bajaba el texto de las 122 guías: 650 KB ya armados de los 786 de la pantalla, la más pesada del ERP.
//
// QUÉ PROMETE. Los títulos de las guías que se piden (o de todas), como un objeto plano que el servidor le pasa a la pantalla.
// QUÉ ASUME. Que lo importa código del servidor. Un componente del navegador que lo importe vuelve a bajar todas las guías: lo vigila
// `lib/vender-no-se-arrastra.test.ts`. Una guía que ya no existe no tiene título: quien lo lee dice la frase de siempre.

/** Los títulos de las guías con esos ids; sin `ids`, los de todas. */
export function titulosDeGuias(ids?: Iterable<string | null>): Record<string, string> {
  const pedidos = ids ? new Set(ids) : null;
  const titulos: Record<string, string> = {};
  for (const g of GUIAS) if (!pedidos || pedidos.has(g.id)) titulos[g.id] = g.titulo;
  return titulos;
}

/** Lo justo de cada guía para el marco del ERP: el motor sabe qué guía tiene la pantalla y la ofrece, y «Demo» arma su lista, sin bajar
 *  el texto de todas (ADR-0674 act. h). Los pasos se piden recién cuando una demo va a correr (`guiaCompleta`, `lib/guias/diferidas.ts`). */
export function indiceDeGuias(): GuiaEnIndice[] {
  return GUIAS.map(({ id, ruta, titulo, resumen }) => ({ id, ruta, titulo, resumen }));
}
