import type { Comprobante, EstadoComprobante } from "./comprobantes-reglas";
import { ESTADO_ETIQUETA } from "./comprobantes-reglas";

// Reglas del chip de estado de un comprobante, el mismo en el Resumen y en la vista Comprobantes
// (spec §6 y §9, ADR-0124). Puras y sin servidor. Lo que había aquí para la «Actividad de hoy» (cruzar
// ventas con comprobantes, el hilo, el detalle y la acción de cada fila) quedó sin pantalla que lo use y se borró.

/** El texto del número, con la MISMA fórmula que `fn_ventas_del_dia` (`serie-` y el correlativo
 *  a 6 dígitos): es la llave que une una venta con su comprobante. */
export function textoDelNumero(c: Pick<Comprobante, "serie" | "numero">): string {
  return `${c.serie}-${String(c.numero).padStart(6, "0")}`;
}

/* ------------------------------ El chip de estado ------------------------------ */

/** La baja se pidió pero SUNAT no la confirmó: el resumen diario de boletas se procesa diferido. Decir
 *  «anulado» antes de que confirme sería adelantarse a SUNAT. */
export function anulacionEnTramite(c: Pick<Comprobante, "estado" | "anulacion_solicitada_at">): boolean {
  return c.estado === "aceptado" && c.anulacion_solicitada_at !== null;
}

export type ChipDeFila = { tono: "neutro" | "ambar" | "verde" | "rojo" | "apagado"; texto: string; punteado: boolean };

const TONO_DEL_ESTADO: Record<EstadoComprobante, ChipDeFila["tono"]> = {
  pendiente: "ambar",
  pendiente_reintento: "ambar",
  enviado: "ambar",
  aceptado: "verde",
  rechazado: "rojo",
  anulado: "apagado",
  no_emitido: "apagado",
  interna: "apagado",
};

/** El chip de estado de un comprobante, el mismo en el Resumen y en la vista Comprobantes. Uno
 *  transmitido al sandbox lleva la palabra «prueba» y borde punteado en el estado que esté (el
 *  color solo no lo distingue, ADR-0015: SUNAT nunca lo vio); una baja pedida y aún sin confirmar
 *  por SUNAT es «Anulación en trámite» en ámbar. Las etiquetas son las de siempre
 *  (`ESTADO_ETIQUETA`). */
export function chipDelComprobante(c: Comprobante): ChipDeFila {
  const enTramite = anulacionEnTramite(c);
  const texto = enTramite ? "Anulación en trámite" : ESTADO_ETIQUETA[c.estado];
  if (c.entorno_transmision === "sandbox") return { tono: "neutro", texto: `${texto} · prueba`, punteado: true };
  return { tono: enTramite ? "ambar" : TONO_DEL_ESTADO[c.estado], texto, punteado: false };
}
