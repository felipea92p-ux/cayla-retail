import { soles } from "./compras-reglas";

// «Esperando nota de crédito» en las LISTAS (Comprobantes y Por pagar), ADR-0111 D2. Puro, sin I/O:
// dice qué texto y qué tono lleva el chip y cuándo vale la pena preguntarle a la base.
//
// El problema: cuando en una recepción se cierra un faltante («estas 4 unidades no llegaron»), el
// proveedor le debe a CAYLA una nota de crédito por lo cerrado (a su costo + IGV) hasta que llegue y
// se registre. El detalle de un comprobante ya lo decía; las listas no, y en Por pagar el líder veía
// el saldo completo y podía pagar de más justo lo que el proveedor va a acreditar. El monto y el
// «resuelto» los calcula Postgres (`compras_nota_pendiente`, migración 20260918220000); acá solo se
// redacta.

/** Lo que la base dice de un comprobante que está esperando su nota por faltante. */
export type NotaPendiente = {
  /** Unidades cerradas por faltante (suman todas las líneas del comprobante). */
  unidadesCerradas: number;
  /** Lo cerrado a su costo más IGV, a 2 decimales: lo que la nota debería acreditar. */
  montoEsperado: number;
  /** Recibido + cerrado ≥ facturado: el comprobante ya está al 100 % y la nota YA se puede registrar. */
  resuelto: boolean;
};

export type ChipNota = {
  /** Siempre ámbar: es algo a medias que el proveedor nos debe, no un error ni algo hecho. */
  tono: "ambar";
  /** «Esperando nota S/ 236.00». */
  texto: string;
  /** La frase completa, para el tooltip y para el lector de pantalla. */
  pista: string;
  /** El aviso corto que se muestra al lado del chip; solo cuando ya se puede registrar la nota. */
  ayuda: string | null;
};

const unidades = (n: number) => `${n.toLocaleString("es-PE")} ${n === 1 ? "unidad" : "unidades"}`;

/**
 * El chip de un comprobante. `saldo` es lo que hoy se le debe al proveedor por ese comprobante: si
 * todavía hay saldo la advertencia es «no pagues esa parte»; si ya está pagado (típico de una factura
 * al contado) la nota queda a favor de CAYLA con ese proveedor. Misma redacción que el detalle
 * (`NotasCreditoCompra`).
 */
export function chipNotaPendiente(n: NotaPendiente, saldo: number): ChipNota {
  const monto = soles(n.montoEsperado);
  const cerrado = `Cerraste ${unidades(n.unidadesCerradas)} que no llegaron: el proveedor te debe una nota de crédito por ${monto}.`;
  const destino = saldo > 0 ? "No pagues esa parte." : "Como ya está pagado, quedará a tu favor.";
  // Dónde se registra: desde 2026-09-19 hay una sola puerta, el módulo `/compras/notas-credito`. Antes
  // eran tres (la guía de recepción, el detalle del comprobante y el módulo) y la frase podía quedarse en
  // «ya puedes registrarla» sin decir dónde.
  const cuando = n.resuelto
    ? "El comprobante ya está resuelto: ya puedes registrarla en Notas de crédito."
    : "Todavía quedan unidades sin recibir ni cerrar: la nota se registra cuando el comprobante quede al 100 %.";
  return {
    tono: "ambar",
    texto: `Esperando nota ${monto}`,
    pista: `${cerrado} ${cuando} ${destino}`,
    ayuda: n.resuelto ? "Regístrala en Notas de crédito" : null,
  };
}

/**
 * De una página de comprobantes, los ids por los que vale la pena preguntar: solo los vigentes que
 * tienen algo cerrado (`cerradoCantidad` es la foto que ya trae la lista). Casi siempre es ninguno:
 * en ese caso la pantalla ni llama a la base.
 */
export function idsConFaltanteCerrado(compras: { id: string; estado: string; cerradoCantidad: number }[]): string[] {
  return compras.filter((c) => c.estado === "vigente" && c.cerradoCantidad > 0).map((c) => c.id);
}
