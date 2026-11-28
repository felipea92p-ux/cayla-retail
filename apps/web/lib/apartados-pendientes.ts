import { money } from "./money";
import { avisadaHoy, diasEntre, estadoVisible, formatoCelular, GRACIA_DIAS, ORDEN_ESTADO, type Apartado, type AvisoApartado, type ClaveEstado } from "./separaciones-reglas";

/**
 * Cómo sale cada apartado en «Pendientes» (ADR-0720, la lista que Felipe eligió para Recibir, ADR-0676): su insignia, una sola línea
 * debajo y, solo donde hay algo que hacer hoy, UN botón. Lo que va a tiempo no lleva botón: se abre su fila para cobrarlo y entregarlo.
 * Sin «·» (ADR-0716): cada dato dice qué es («S/45.00 por Yape al 987 041 107», «se cancela solo en 2 días»).
 */
export type ComoSePendiente = {
  clave: Exclude<ClaveEstado, "cerrada">;
  insignia: string;
  tono: "rojo" | "ambar" | "verde";
  /** La línea bajo la insignia. La fecha de «vence» la escribe la pantalla (con su formato de fecha corta). */
  debajo: { tipo: "texto"; texto: string } | { tipo: "vence"; iso: string } | null;
  /** El único botón de la fila: devolver el adelanto, escribirle (o, si ya se le escribió hoy, «Avisado hoy») o ninguno. */
  accion: "devolver" | "escribir" | "avisado" | null;
  /** Lo que le falta pagar; `null` si ya no se cobra: se le devuelve el adelanto. */
  falta: number | null;
};

/** Adónde va la plata que se le devuelve, dicho en una frase: «por Yape al 987 041 107», «por transferencia a su cuenta …1234». */
export function adondeSeDevuelve(a: Pick<Apartado, "devolucionMedio" | "devolucionNumero" | "devolucionCciFinal">): string {
  if (a.devolucionMedio === "transferencia") return a.devolucionCciFinal ? `por transferencia a su cuenta …${a.devolucionCciFinal}` : "por transferencia";
  const medio = a.devolucionMedio === "plin" ? "Plin" : "Yape";
  return a.devolucionNumero ? `por ${medio} al ${formatoCelular(a.devolucionNumero)}` : `por ${medio}`;
}

/** Cuándo se cancela solo un apartado vencido: el último día de su gracia (ADR-0166) es el de hoy si queda 1. */
export function cuandoSeCancelaSolo(venceEl: string, hoy: string): string {
  const quedan = Math.max(0, GRACIA_DIAS + diasEntre(hoy, venceEl) + 1);
  return quedan <= 0 ? "se cancela solo hoy" : quedan === 1 ? "se cancela solo mañana" : `se cancela solo en ${quedan} días`;
}

export function comoSePendiente(a: Apartado, hoy: string, aviso: AvisoApartado | undefined): ComoSePendiente {
  const e = estadoVisible(a, hoy);
  const puedeEscribirle = a.celular !== "";
  const escribir: ComoSePendiente["accion"] = puedeEscribirle ? (avisadaHoy(aviso, hoy) ? "avisado" : "escribir") : null;
  if (e.clave === "devolver") {
    return { clave: "devolver", insignia: "Por devolver", tono: "rojo", debajo: { tipo: "texto", texto: `${money(a.adelanto)} ${adondeSeDevuelve(a)}` }, accion: "devolver", falta: null };
  }
  if (e.clave === "vencida") {
    return { clave: "vencida", insignia: "Vencido", tono: "rojo", debajo: { tipo: "texto", texto: cuandoSeCancelaSolo(a.venceEl, hoy) }, accion: escribir, falta: a.saldo };
  }
  if (e.clave === "porvencer") {
    // «Vence hoy», «Vence mañana» o «Vence en 2 días»: la insignia ya dice cuándo.
    return { clave: "porvencer", insignia: e.texto, tono: "ambar", debajo: null, accion: escribir, falta: a.saldo };
  }
  return { clave: "vigente", insignia: "A tiempo", tono: "verde", debajo: { tipo: "vence", iso: a.venceEl }, accion: null, falta: a.saldo };
}

/** El orden de la lista: lo urgente primero (por devolver, vencido, por vencer, a tiempo) y, dentro, lo que vence antes. */
export function ordenPendientes<A extends Pick<Apartado, "venceEl" | "estado" | "adelanto">>(apartados: readonly A[], hoy: string): A[] {
  return [...apartados].sort((x, y) => ORDEN_ESTADO[estadoVisible(x, hoy).clave] - ORDEN_ESTADO[estadoVisible(y, hoy).clave] || x.venceEl.localeCompare(y.venceEl));
}

/** Lo que entró en adelantos por lo que sigue abierto (lo cancelado ya no se cuenta: se devuelve). */
export function adelantosGuardados(apartados: readonly Pick<Apartado, "estado" | "adelanto">[]): number {
  return Math.round(apartados.filter((a) => a.estado === "abierta").reduce((t, a) => t + a.adelanto, 0) * 100) / 100;
}
