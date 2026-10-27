// La guía de foco de la hoja «Ficha de consumo» (ADR-0284, ADR-0513): qué está hecho, qué sigue y qué falta antes de «Guardar».
//
// CONTRATO
//   PROMETE: dado lo que la persona ya hizo en la hoja, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál sigue y qué falta antes del botón.
//   ASUME:   nada de negocio nuevo: cada `hecho` sale de lo que la base ya exige (`guardar_ficha_consumo` valida la tela y los avíos juntos, como `problemasDeFicha`; y exige a alguien que
//            firme con `fn_actor_persona_id(true)`). `lib/ficha-consumo-guia.test.ts` recorre las combinaciones contra esas reglas.
//   NO HACE: no pinta ni toca la base; y ningún campo es «sugerido»: aquí no hay recomendaciones que avisen sin bloquear.

import type { CampoDeGuia } from "./guia-campos";

export type EleccionFichaConsumo = {
  /** Lo que `problemasDeFicha` dice del borrador tal como quedó (vacío = la base lo aceptaría). */
  faltas: readonly string[];
  /** El borrador es distinto de lo guardado (`hayCambiosEnLaFicha`): guardar lo mismo no es un paso. */
  hayCambios: boolean;
  responsableListo: boolean;
};

/** «Ficha de consumo»: la tela y los avíos son UN campo (la base los valida juntos) y después quién los guarda. Sin cambios o con una falta, la guía lo dice. */
export function camposDeFichaConsumo(e: EleccionFichaConsumo): CampoDeGuia[] {
  const bien = e.faltas.length === 0 && e.hayCambios;
  return [
    { id: "ficha", nombre: "Tela y avíos del modelo", requerido: true, hecho: bien, pendiente: e.faltas[0] ?? "Cambia algo de la ficha para guardar." },
    { id: "quien", nombre: "Quién la guarda", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién guarda este cambio." },
  ];
}
