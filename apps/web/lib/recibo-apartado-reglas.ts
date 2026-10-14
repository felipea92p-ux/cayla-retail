// El ticket de un apartado ENTREGADO (ADR-0399, diseño de Felipe 2026-10-14): es la boleta o factura de siempre, la misma que sale
// de cualquier venta (`ReciboTermico`), por el TOTAL y sin nombrar el adelanto, con el sello «CANCELADO» y una referencia al apartado.
// Antes lo dibujaba `ReciboApartado` con el título de boleta pero sin QR y con el número del apartado: parecía un comprobante y no lo era.
// Solo arma datos; no toca la base ni el papel.

import { armarRecibo, type ReciboVenta, type TipoDocCliente } from "./recibo-reglas";
import type { Apartado } from "./separaciones-reglas";

/** Lo que se lee de `comprobantes` para armar el ticket de la entrega. */
export type ComprobanteDeApartado = {
  tipo: "boleta" | "factura";
  serie: string;
  numero: number;
  created_at: string;
  cliente_tipo_doc: TipoDocCliente;
  cliente_num_doc: string | null;
  cliente_nombre: string | null;
};

/**
 * La boleta o factura del apartado entregado, como la imprime la térmica. Los pagos van VACÍOS a propósito: el papel dice
 * «CANCELADO» y no cómo se pagó (el adelanto es un pacto interno). El redondeo del efectivo, si lo hubo, se sigue diciendo (es ley).
 */
export function reciboDeApartado(a: Apartado, comprobante: ComprobanteDeApartado, sede: string, redondeo = 0): ReciboVenta {
  return armarRecibo({
    comprobante,
    sede,
    cliente: { tipoDoc: comprobante.cliente_tipo_doc, numDoc: comprobante.cliente_num_doc, nombre: comprobante.cliente_nombre },
    lineas: a.prendas.map((p) => ({
      cantidad: p.cantidad,
      referencia: p.referencia,
      codigo: p.sku,
      precioUnitario: p.precioUnitario,
      descuentoUnitario: p.descuentoUnitario,
    })),
    pagos: [],
    redondeo,
    tasaIgv: 0.18,
    atendio: a.asesora,
  });
}
