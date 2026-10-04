// La guía de foco de «Regularizar prenda» (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: los campos del modal en el orden de pantalla, con su «hecho» y la frase de lo que falta, para que `useGuiaCampos`
//            encienda el que sigue y diga qué falta antes de «Regularizar».
//   ASUME:   cada «hecho» es lo que `regularizar_prenda` ya exige: una variante real (`La variante … no existe`) y una de las dos
//            respuestas (`prenda_forma_invalida`). No agrega reglas: la prueba recorre todas las combinaciones contra la base.
//   NO HACE: no sugiere la prenda ni la respuesta (eso es `por-regularizar-candidatas.ts`): la sugerencia nunca marca un campo como
//            hecho; hecho es lo que la persona eligió.
import type { CampoDeGuia } from "./guia-campos";
import type { FormaRegularizar } from "./por-regularizar-candidatas";

export type EleccionRegularizar = {
  /** Ya eligió qué prenda real es. */
  prendaElegida: boolean;
  forma: FormaRegularizar | null;
};

export function camposGuiaRegularizar(e: EleccionRegularizar): CampoDeGuia[] {
  return [
    { id: "prenda", nombre: "Qué prenda es", requerido: true, hecho: e.prendaElegida, pendiente: "Elige qué prenda es." },
    { id: "forma", nombre: "Cómo estaba", requerido: true, hecho: e.forma !== null, pendiente: "Responde si ya estaba registrada o si llegó nueva." },
  ];
}
