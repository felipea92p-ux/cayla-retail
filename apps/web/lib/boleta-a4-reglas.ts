// Reglas puras de la boleta/factura A4. Sin DOM ni React. El A4 muestra valores SIN IGV
// (valor unitario, descuento, total por línea) y al pie el desglose: la suma de la columna
// Total ES la «Op. gravada». Como cada línea se redondea por separado, la suma puede
// quedar a un centavo de la gravada que calculó la base: ese centavo se le da a la última
// línea, para que el papel no se contradiga.

import type { ReciboVenta } from "./recibo-reglas";

const redondear2 = (n: number) => Math.round(n * 100) / 100;

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
  valorUnitario: number;
  descuento: number;
  total: number;
};

export function lineasA4(recibo: ReciboVenta, tasaIgv = 0.18): LineaA4[] {
  const f = 1 + tasaIgv;
  const lineas: LineaA4[] = recibo.lineas.map((l) => ({
    cantidad: l.cantidad,
    unidad: "Unidad",
    descripcion: l.descripcion,
    detalle: l.detalle ?? null,
    codigo: l.codigo,
    valorUnitario: redondear2(l.precioUnitario / f),
    descuento: redondear2(l.descuentoUnitario / f),
    total: redondear2(l.importe / f),
  }));
  const ultima = lineas[lineas.length - 1];
  if (ultima) {
    const diferencia = redondear2(recibo.subtotal - lineas.reduce((a, l) => a + l.total, 0));
    if (diferencia !== 0) ultima.total = redondear2(ultima.total + diferencia);
  }
  return lineas;
}
