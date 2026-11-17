import { GUIAS } from "./registro";

// El título de cada guía por su id, SOLO para el servidor (ADR-0674 act. g).
//
// EL PROBLEMA. «Preguntas del equipo» dice a qué pantalla llevó cada respuesta («→ Caja»). Para ese nombre le preguntaba al registro de
// las guías desde el navegador, y con él bajaba el texto de las 79 guías: 650 KB ya armados de los 786 de la pantalla, la más pesada del ERP.
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
