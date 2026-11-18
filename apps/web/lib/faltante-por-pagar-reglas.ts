import { soles } from "./compras-reglas";

// El faltante en «Por pagar» de Producción (P02 del «Análisis del Taller», opción B, Felipe 2026-11-02).
//
// CONTRATO
//   PROMETE: decir, al lado de una factura del Taller, que el PEDIDO al que pertenece cerró con mercadería que no llegó, cuánta (sin IGV y con IGV al ritmo de esa factura)
//            y, si eso alcanza lo que queda por pagar, avisarlo más fuerte: pagar entera esa factura sería pagar lo que no llegó.
//   ASUME:   `netoSinIgv` es lo que dice `fn_ordenes_insumo_nos_debe` (cantidad × costo de cada cierre del pedido, sin IGV). El cierre cuelga del PEDIDO, no de una factura
//            (en los datos reales `orden_insumo_cierres.comprobante_item_id` queda nulo): por eso el aviso habla del pedido y nunca dice cuánto de ESTA factura faltó.
//   NO HACE: no cambia la deuda ni el saldo (eso es la nota de crédito de Producción, opción A, que espera decisión de Felipe y del contador por el IGV); no frena ningún pago.

/** Lo que cerró un pedido como «no va a llegar». */
/** `orden`: «OI-000420» si se sabe; `null` si no (el rol no lee la tabla de pedidos: el aviso dice «el pedido al que pertenece esta factura»). */
export type FaltanteDePedido = { orden: string | null; netoSinIgv: number; cierres: number };

export type AvisoFaltante = {
  /** El texto corto de la fila de la lista. */
  chip: string;
  /** El título del aviso en la hoja «Pagar». */
  titulo: string;
  detalle: string;
  /** Lo que faltó (con IGV) alcanza o pasa lo que queda por pagar. */
  casiTodo: boolean;
};

const IGV_POR_OMISION = 0.18;

export function avisoDeFaltante(f: FaltanteDePedido | undefined, factura: { subtotal: number; igv: number; saldo: number }): AvisoFaltante | null {
  if (!f || !(f.netoSinIgv > 0)) return null;
  // Con IGV al ritmo de esa factura (total ÷ subtotal); sin subtotal, el 18 % de siempre. Es una ayuda para decidir, no un asiento.
  const ritmo = factura.subtotal > 0 ? (factura.subtotal + factura.igv) / factura.subtotal : 1 + IGV_POR_OMISION;
  const conIgv = Math.round(f.netoSinIgv * ritmo * 100) / 100;
  const casiTodo = factura.saldo > 0 && conIgv >= factura.saldo - 0.005;
  return {
    chip: `Faltó mercadería · ${soles(f.netoSinIgv)}`,
    titulo: casiTodo ? "Lo que faltó llegar es casi todo lo que queda por pagar" : "Faltó mercadería de este pedido",
    detalle: `${f.orden ? `El pedido ${f.orden}` : "El pedido al que pertenece esta factura"} cerró con ${soles(f.netoSinIgv)} de mercadería que no llegó (≈ ${soles(conIgv)} con IGV). Antes de pagar, pregunta si el proveedor la repone o la descuenta: esta pantalla todavía no baja la deuda por eso.`,
    casiTodo,
  };
}
