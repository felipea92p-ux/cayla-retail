// Finanzas ▸ Impuestos en la barra común de «El telar» (ADR-0493): lo que Impuestos le pasa a la cabecera
// (`<RespuestaTelar pregunta valor chips motivo>`) y cómo nombra la sede elegida. Lógica pura sobre lo que la pantalla ya calcula
// (`pulsoImpuestos`): no agrega reglas tributarias.

import type { TonoChip } from "@/components/ui/Chip";
import type { PulsoImpuestos } from "./impuestos-pulso-reglas";
import { nombreMes, sumarMeses } from "./impuestos-reglas";
import { SEDE_TODAS, type ClaveSede, type SedeTelar } from "./finanzas-telar-reglas";

export type RespuestaImpuestos = { pregunta: string; valor: number | null; chips: { texto: string; tono: TonoChip }[]; motivo?: string };

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

/** La respuesta grande de la cabecera: lo que de verdad sale hacia SUNAT por el mes que se mira (con IGV a favor, solo la renta).
 *  `enCurso`: el mes todavía corre y la cifra va a la fecha. `pendientes`: cuántas cosas hay antes de declarar. */
export function respuestaImpuestos(pulso: PulsoImpuestos | null, opciones: { enCurso: boolean; pendientes: number }): RespuestaImpuestos {
  if (!pulso) return { pregunta: "¿Cuánto le pagas a SUNAT?", valor: null, chips: [] };
  const mes = nombreMes(pulso.mes);
  const pregunta = opciones.enCurso ? `¿Cuánto le pagarás a SUNAT por ${mes}?` : `¿Cuánto le pagas a SUNAT por ${mes}?`;
  if (pulso.estado === "sin_mes") return { pregunta, valor: 0, chips: [{ texto: "Sin movimiento", tono: "pizarra" }], motivo: pulso.frase };
  // Dos chips como mucho (como Gastos), para que la respuesta quepa a la derecha de la cabecera: cuándo (o que todavía cambia) y lo
  // que más importa después de la cifra (el IGV a favor, o lo que falta antes de declarar).
  const chips: RespuestaImpuestos["chips"] = [
    opciones.enCurso ? { texto: "Va a la fecha: todavía cambia", tono: "pizarra" } : { texto: `Se paga en ${nombreMes(sumarMeses(pulso.mes, 1))}`, tono: "pizarra" },
  ];
  if (pulso.estado === "a_favor") chips.push({ texto: `IGV a favor: ${soles(pulso.aFavor)}`, tono: "verde" });
  else if (opciones.pendientes > 0) chips.push({ texto: `${opciones.pendientes} antes de declarar`, tono: "ambar" });
  return { pregunta, valor: pulso.estado === "a_pagar" ? pulso.total : (pulso.renta ?? 0), chips };
}

/** Arriba de la cabecera: «Todas las sedes», «Lima», «Empresa». El IGV se declara junto (un RUC), pero se nombra la sede elegida. */
export function sedeDeLaCabecera(elegida: ClaveSede, sedes: readonly SedeTelar[]): string {
  if (elegida === SEDE_TODAS) return "Todas las sedes";
  return sedes.find((s) => s.clave === elegida)?.nombre ?? "Todas las sedes";
}
