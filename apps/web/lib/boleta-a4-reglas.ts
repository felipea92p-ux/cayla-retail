// Reglas puras de la boleta/factura A4. Sin DOM ni React. El A4 muestra la MISMA plata que el
// ticket de 80 mm: precio unitario, descuento e importe CON IGV incluido, línea por línea — lo
// que la clienta de verdad pagó por cada prenda. El desglose de SUNAT (Op. gravada/IGV/TOTAL) va
// aparte, al pie, leído directo de `recibo.subtotal`/`recibo.igv`/`recibo.total`: no tiene que
// cuadrar con la suma de la columna Importe (que suma el TOTAL, no la gravada), igual que ya pasa
// en el ticket. Antes el A4 dividía cada línea entre 1+IGV (al estilo del Alegra viejo) y el
// precio unitario salía distinto al del ticket para la misma prenda — confundía a la clienta
// que comparaba los dos papeles.

import type { ReciboVenta } from "./recibo-reglas";

/** `B002-00009380`: el A4 es la representación impresa oficial y lleva el correlativo a 8 dígitos
 *  (el ticket y el resto de la app usan 6 por comodidad; el número es el mismo). */
export function numeroA4(r: { serie: string; numero: number }): string {
  return `${r.serie}-${String(r.numero).padStart(8, "0")}`;
}

export type LineaA4 = {
  cantidad: number;
  unidad: string;
  descripcion: string;
  detalle: string | null;
  codigo: string | null;
  precioUnitario: number;
  descuento: number;
  total: number;
};

export function lineasA4(recibo: ReciboVenta): LineaA4[] {
  return recibo.lineas.map((l) => ({
    cantidad: l.cantidad,
    unidad: "Unidad",
    descripcion: l.descripcion,
    detalle: l.detalle ?? null,
    codigo: l.codigo,
    precioUnitario: l.precioUnitario,
    descuento: l.descuentoUnitario,
    total: l.importe,
  }));
}
