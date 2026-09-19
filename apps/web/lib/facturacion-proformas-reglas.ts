import type { Proforma } from "./proformas-reglas";
import { antiguedad, faltaPara } from "./facturacion-resumen-reglas";

// Reglas de la vista Proformas (spec §6 y §9, ADR-0124): qué estado ve la persona, en qué orden
// van las filas, con qué chip y con qué línea de detalle. Puras y sin servidor: el reloj entra por
// parámetro y el componente solo dibuja lo que sale de acá.

/** Lo que la persona ve. «Vencida» también es la vigente cuyo plazo ya pasó: nadie escribe
 *  `vencida` en la base (ni un cron ni un trigger), así que `Proforma.vencida` es derivado. */
export type EstadoVisible = "porVencer" | "vigente" | "vencida" | "convertida" | "anulada";

export function estadoVisible(p: Proforma): EstadoVisible {
  if (p.estado === "vigente") return p.vencida ? "vencida" : p.porVencer ? "porVencer" : "vigente";
  return p.estado;
}

/** Compara dos instantes que pueden faltar: el que falta va al final, sea cual sea el sentido. */
function comparar(a: string | null, b: string | null, sentido: 1 | -1): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return sentido * (Date.parse(a) - Date.parse(b));
}

const GRUPO: Record<EstadoVisible, number> = { porVencer: 0, vigente: 0, vencida: 1, convertida: 2, anulada: 3 };

/** El orden de la lista: «excepciones primero» (hallazgo Oracle, ronda 2), sin filtro que haya que
 *  recordar aplicar. Las que siguen valiendo, las que caducan antes primero (una por vencer siempre
 *  caduca antes que una que no); luego las vencidas, la que venció más recién primero (es la clienta
 *  más fresca); luego las convertidas y las anuladas, las más nuevas primero. El desempate siempre
 *  es la más nueva. No modifica el arreglo que recibe. */
export function ordenarProformas(proformas: Proforma[]): Proforma[] {
  return [...proformas].sort((a, b) => {
    const ga = GRUPO[estadoVisible(a)];
    const gb = GRUPO[estadoVisible(b)];
    if (ga !== gb) return ga - gb;
    const porVencimiento = ga === 0 ? comparar(a.vence_at, b.vence_at, 1) : ga === 1 ? comparar(a.vence_at, b.vence_at, -1) : 0;
    return porVencimiento || comparar(a.created_at, b.created_at, -1);
  });
}

export type ChipDeProforma = { tono: "neutro" | "ambar" | "verde" | "apagado"; texto: string };

// Vigente en neutro y por vencer en ámbar: en una lista que es casi toda vigente, lo que vence pronto
// tiene que verse contra el resto. Ningún rojo: `MAX_ROJO_POR_PANTALLA` es 2 y esto no es una falla.
const CHIP: Record<EstadoVisible, ChipDeProforma> = {
  porVencer: { tono: "ambar", texto: "Por vencer" },
  vigente: { tono: "neutro", texto: "Vigente" },
  vencida: { tono: "apagado", texto: "Vencida" },
  convertida: { tono: "verde", texto: "Convertida" },
  anulada: { tono: "apagado", texto: "Anulada" },
};

export function chipDeLaProforma(p: Proforma): ChipDeProforma {
  return CHIP[estadoVisible(p)];
}

/** La línea de abajo del chip: cuánto falta para que venza (`urgente` la pide en ámbar) o hace cuánto
 *  venció. Sin fecha de vencimiento, o ya cerrada (convertida, anulada), no dice nada. */
export function detalleDeLaProforma(p: Proforma, ahora: Date): { texto: string; urgente: boolean } | null {
  if (!p.vence_at) return null;
  switch (estadoVisible(p)) {
    case "porVencer":
      return { texto: `Vence en ${faltaPara(p.vence_at, ahora)}`, urgente: true };
    case "vigente":
      return { texto: `Vence en ${faltaPara(p.vence_at, ahora)}`, urgente: false };
    case "vencida":
      return { texto: `Venció ${antiguedad(p.vence_at, ahora)}`, urgente: false };
    default:
      return null;
  }
}
