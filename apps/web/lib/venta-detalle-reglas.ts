// Reglas puras del detalle de una venta ya cerrada y de su reimpresión. Sin DOM, sin React,
// sin `createClient`: `venta-detalle.ts` trae las filas de la base y esta función las
// convierte en lo que la pantalla y la impresora dibujan. Así se prueba sin navegador.
//
// El recibo NO se recalcula aparte: se arma con `armarRecibo`, la misma cuenta del ticket que
// salió al cobrar (`subtotal + IGV = total` al centavo).

import type { MetodoPago } from "@cayla-retail/shared";
import type { EstadoComprobante } from "./comprobantes-reglas";
import { codigoPrenda } from "./prenda-reglas";
import { armarRecibo, type PagoRecibo, type ReciboVenta, type TipoDocCliente, type TipoReciboFiscal } from "./recibo-reglas";

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export type FilaVentaItem = {
  cantidad: number;
  precio_unitario: number;
  descuento_unitario: number;
  variante: {
    sku: string | null;
    codigo: string | null;
    talla: { valor: string } | null;
    color: { nombre: string } | null;
    producto: { referencia: string } | null;
  } | null;
};
export type FilaVentaPago = { metodo: MetodoPago; monto: number; recibido: number | null };
export type FilaComprobante = {
  tipo: string;
  serie: string;
  numero: number;
  estado: EstadoComprobante;
  created_at: string;
  cliente_tipo_doc: TipoDocCliente;
  cliente_num_doc: string | null;
  cliente_nombre: string | null;
  motivo_rechazo: string | null;
  respuesta_sunat: unknown;
};
export type FilasVenta = { id: string; created_at: string; items: FilaVentaItem[]; pagos: FilaVentaPago[]; comprobante: FilaComprobante | null };

export type LineaDetalle = {
  cantidad: number;
  nombre: string;
  /** «M · Negro»; vacío si no se sabe. */
  detalle: string;
  codigo: string;
  precioUnitario: number;
  descuentoUnitario: number;
  importe: number;
};

export type VentaDetalle = {
  ventaId: string;
  creadaEn: string;
  total: number;
  prendas: number;
  lineas: LineaDetalle[];
  pagos: PagoRecibo[];
  vueltoTotal: number;
  comprobante: { tipo: string; serie: string; numero: number; estado: EstadoComprobante; hash: string | null; motivoRechazo: string | null } | null;
  /** Solo si el comprobante es boleta o factura: lo que alimenta el ticket y el A4. */
  recibo: ReciboVenta | null;
};

function hashDe(respuesta: unknown): string | null {
  if (typeof respuesta !== "object" || respuesta === null) return null;
  const h = (respuesta as { hash?: unknown }).hash;
  return typeof h === "string" && h !== "" ? h : null;
}

export function armarDetalleVenta(filas: FilasVenta, ctx: { sede: string; vendedor: string | null }): VentaDetalle {
  const lineas: LineaDetalle[] = filas.items.map((it) => {
    const v = it.variante;
    return {
      cantidad: it.cantidad,
      nombre: v?.producto?.referencia ?? "Prenda sin nombre",
      detalle: [v?.talla?.valor, v?.color?.nombre].filter(Boolean).join(" · "),
      codigo: v ? codigoPrenda(v) : "sin código",
      precioUnitario: it.precio_unitario,
      descuentoUnitario: it.descuento_unitario,
      importe: redondear2(it.cantidad * (it.precio_unitario - it.descuento_unitario)),
    };
  });
  const total = redondear2(lineas.reduce((a, l) => a + l.importe, 0));

  const c = filas.comprobante;
  const esFiscal = c !== null && (c.tipo === "boleta" || c.tipo === "factura");
  const recibo = esFiscal
    ? armarRecibo({
        comprobante: { tipo: c.tipo as TipoReciboFiscal, serie: c.serie, numero: c.numero, created_at: c.created_at },
        sede: ctx.sede,
        cliente: { tipoDoc: c.cliente_tipo_doc, numDoc: c.cliente_num_doc, nombre: c.cliente_nombre },
        lineas: lineas.map((l) => ({
          cantidad: l.cantidad,
          referencia: l.nombre,
          codigo: l.codigo,
          precioUnitario: l.precioUnitario,
          descuentoUnitario: l.descuentoUnitario,
          detalle: l.detalle || undefined,
        })),
        pagos: filas.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, recibido: p.recibido ?? undefined })),
        tasaIgv: 0.18,
      })
    : null;

  // Los pagos salen del recibo cuando lo hay (misma cuenta del vuelto); si no, se arman igual.
  const pagos: PagoRecibo[] =
    recibo?.pagos ??
    filas.pagos.map((p) => ({
      metodo: p.metodo,
      monto: p.monto,
      recibido: p.recibido,
      vuelto: p.recibido !== null && p.metodo === "efectivo" ? Math.max(0, redondear2(p.recibido - p.monto)) : 0,
    }));

  return {
    ventaId: filas.id,
    creadaEn: filas.created_at,
    total,
    prendas: lineas.reduce((a, l) => a + l.cantidad, 0),
    lineas,
    pagos,
    vueltoTotal: redondear2(pagos.reduce((a, p) => a + p.vuelto, 0)),
    comprobante: c ? { tipo: c.tipo, serie: c.serie, numero: c.numero, estado: c.estado, hash: hashDe(c.respuesta_sunat), motivoRechazo: c.motivo_rechazo } : null,
    recibo,
  };
}

/** Qué comprobantes se pueden reimprimir. `pendiente` y `enviado` imprimen con una leyenda:
 *  el documento existe pero SUNAT todavía no lo validó. Lo rechazado, anulado o que nunca se
 *  emitió no se imprime: un papel que parece válido y no lo es, es peor que no imprimirlo. */
export function puedeImprimir(estado: EstadoComprobante): { ok: true; leyenda: string | null } | { ok: false; motivo: string } {
  switch (estado) {
    case "aceptado":
      return { ok: true, leyenda: null };
    case "pendiente":
    case "enviado":
      return { ok: true, leyenda: "Comprobante pendiente de validación en SUNAT." };
    case "rechazado":
      return { ok: false, motivo: "SUNAT rechazó este comprobante: no se puede imprimir." };
    case "anulado":
      return { ok: false, motivo: "Este comprobante está anulado: no se puede imprimir." };
    case "no_emitido":
      return { ok: false, motivo: "Este comprobante no se emitió: no hay nada que imprimir." };
  }
}
