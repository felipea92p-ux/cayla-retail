import type { SaldoBolsillos } from "./bolsillos-reglas";
import { soles } from "./flujo-caja-reglas";
import type { TeDejaMes } from "./te-deja-mes-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: la frase bajo el título (Felipe 2026-11-09, «que se parezca más a la maqueta»). En la maqueta la cabecera
// ya responde lo que importa —cuánto tienes, cuánto puedes usar y cuánto te deja el mes— antes de mirar ninguna tarjeta. Lógica pura: dice lo mismo
// que las tarjetas de abajo, con sus mismos números; si no hay con qué, vuelve a la frase de siempre.

export type ParteFrase = { texto: string; fuerte?: boolean };

/** La frase de siempre, cuando no hay números con qué decir algo mejor. */
export const FRASE_DE_SIEMPRE = "De lo que vendes a lo que te queda.";

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fraseDelResumen(o: { saldo: SaldoBolsillos; te: TeDejaMes; nombreMes: string; enCurso: boolean }): ParteFrase[] {
  const { saldo, te, nombreMes, enCurso } = o;
  const partes: ParteFrase[] = [];
  if (enCurso && saldo.tipo === "cayla") {
    if (saldo.libre >= 0) partes.push({ texto: `Tienes ${soles(saldo.tienes)} y puedes usar ` }, { texto: soles(saldo.libre), fuerte: true }, { texto: " sin dejar de pagar nada." });
    else partes.push({ texto: `Tienes ${soles(saldo.tienes)}, pero lo que ya tiene dueño pide ` }, { texto: soles(-saldo.libre), fuerte: true }, { texto: " más." });
  } else if (enCurso && saldo.tipo === "sede" && saldo.efectivo !== null && saldo.vende) {
    partes.push({ texto: `En ${saldo.nombre} hay ` }, { texto: soles(saldo.efectivo), fuerte: true }, { texto: " en caja." });
  }
  if (te.tipo === "estimado") partes.push({ texto: `${partes.length ? " " : ""}Al ritmo de hoy, ${nombreMes} te deja unos ${soles(te.estimado)}.` });
  else if (te.tipo === "cerrado") partes.push({ texto: `${partes.length ? " " : ""}${mayuscula(nombreMes)} ${te.resultado >= 0 ? "te dejó" : "te faltó"} ` }, { texto: soles(Math.abs(te.resultado)), fuerte: true }, { texto: "." });
  else if (te.tipo === "tramo") partes.push({ texto: `${partes.length ? " " : ""}En estas fechas ${te.resultado >= 0 ? "te dejó" : "te faltó"} ${soles(Math.abs(te.resultado))}.` });
  return partes.length ? partes : [{ texto: FRASE_DE_SIEMPRE }];
}
