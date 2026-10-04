// La guía de foco de «Regularizar prenda» (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: los campos del modal en el orden de pantalla, con su «hecho» y la frase de lo que falta, para que `useGuiaCampos`
//            encienda el que sigue y diga qué falta antes de «Regularizar».
//   ASUME:   cada «hecho» es lo que `regularizar_prenda` ya exige: una variante real (`La variante … no existe`) que ya esté cargada
//            en la sede (`prenda_sin_cargar_en_sede`), una de las dos respuestas (`prenda_forma_invalida`) y alguien que firme que
//            no sea quien vendió, salvo el líder firmando él mismo (`responsable_requerido`, `regularizar_propia_venta`,
//            20261004204000). No agrega reglas: la prueba recorre todas las combinaciones contra la base.
//   NO HACE: no sugiere la prenda ni la respuesta (eso es `por-regularizar-candidatas.ts`): la sugerencia nunca marca un campo como
//            hecho; hecho es lo que la persona eligió. Si todavía no se sabe si la prenda está cargada (la lectura no volvió o
//            falló), no frena: decide la base al guardar.
import type { CampoDeGuia } from "./guia-campos";
import type { FormaRegularizar } from "./por-regularizar-candidatas";

export type EleccionRegularizar = {
  /** Ya eligió qué prenda real es. */
  prendaElegida: boolean;
  /** Por qué la prenda elegida no se puede regularizar todavía (`prendaSinCargar`), o `null` (cargada, o no se sabe aún). */
  motivoPrenda?: string | null;
  forma: FormaRegularizar | null;
  /** Ya hay quién firma (el combo «Responsable», ADR-0161/0162). */
  responsableListo: boolean;
  /** Por qué el elegido no puede firmar ESTA regularización (`motivoPropiaVenta`), o `null`. */
  motivoPropia: string | null;
};

export function camposGuiaRegularizar(e: EleccionRegularizar): CampoDeGuia[] {
  const motivoPrenda = e.motivoPrenda ?? null;
  return [
    {
      id: "prenda",
      nombre: "Qué prenda es",
      requerido: true,
      hecho: e.prendaElegida && motivoPrenda === null,
      pendiente: e.prendaElegida && motivoPrenda ? motivoPrenda : "Elige qué prenda es.",
    },
    { id: "forma", nombre: "Cómo estaba", requerido: true, hecho: e.forma !== null, pendiente: "Responde si ya estaba registrada o si llegó nueva." },
    {
      id: "responsable",
      nombre: "Quién regulariza",
      requerido: true,
      hecho: e.responsableListo && e.motivoPropia === null,
      pendiente: e.motivoPropia ?? "Elige quién regulariza.",
    },
  ];
}
