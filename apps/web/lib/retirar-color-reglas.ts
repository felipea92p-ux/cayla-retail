import { cantidadTexto, type UnidadInsumo } from "./insumos-reglas";

// «Retirar color» (ADR-0554): esconder de la lista de Insumos un color que se eligió por error. Reglas puras, sin React ni red; la hoja las usa para decir de antemano lo que la base ya rechazaría.
//
// CONTRATO
//   PROMETE: `motivoParaNoRetirar` dice, con las mismas palabras que la base (`fn_color_compromisos`), por qué un color con saldo no se retira; el botón y la hoja no pueden contradecir a la base en eso.
//   ASUME:   `saldo` es lo que el libro suma hoy para ese color (la base mira todas las sedes; esta pantalla solo ve las del Taller que tiene abierto, así que la base sigue siendo la última palabra).
//   NO HACE: no conoce las órdenes, las facturas ni las recetas que también impiden retirar: esas las dice la base al intentar, y `traducirError` las muestra tal cual. No decide quién puede retirar (es del líder).

/** El nombre de la función de la base que retira un color (ADR-0554, 20261029014000). */
export const RPC_RETIRAR_COLOR = "retirar_color_de_material";

/** El saldo que el libro lleva se escribe con tres decimales: una diferencia menor que medio milésimo es un saldo en cero. */
const TOLERANCIA = 0.0005;

/** `null` si por saldo se puede retirar; si no, la frase para quien lee la hoja (la misma que daría la base). */
export function motivoParaNoRetirar({ saldo, unidad }: { saldo: number; unidad: UnidadInsumo }): string | null {
  if (Math.abs(saldo) < TOLERANCIA) return null;
  return `Este color todavía tiene ${cantidadTexto(saldo, unidad)}: solo se retira un color sin saldo.`;
}
