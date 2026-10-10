import { ID_CARGO_ESPECIAL } from "./cargo-especial";
import { codigoPrenda } from "./prenda-reglas";
import { esDescuentoDeCampana, porcentajeDeLinea, RAZONES_DESCUENTO, type CampanaLinea } from "./vender-reglas";

/**
 * Qué dice la fila de cada prenda del ticket de Vender (spike del club, 2026-09-30, commit `7be3ebea`: «cada prenda
 * del ticket es una fila compacta»). Antes cada prenda ocupaba ~150 px —nombre y código; «Desc.» y «Quitar»; debajo
 * «Cantidad / Precio unitario / Importe» con etiquetas y «Máximo disponible en sede: N»— y, con la caja de la clienta
 * arriba, cabían muy pocas a la vista. Ahora es una fila: nombre · color y talla · stock | − 1 + | importe | quitar,
 * y solo si lleva descuento, una línea roja con el % y su motivo.
 *
 * Aquí solo se decide QUÉ se muestra. Los montos salen de la línea tal cual (`precioUnitario − descuentoUnitario`):
 * la misma cuenta que hacía la fila de antes, ni un cálculo nuevo. Lo que se cobra lo decide `registrar_venta`.
 */

/** Lo que la fila necesita de una línea del carrito (`ItemCarrito` lo cumple). */
export type LineaParaFila = {
  varianteId: string;
  referencia: string;
  sku: string;
  codigo: string | null;
  cantidad: number;
  precioUnitario: number;
  descuentoUnitario: number;
  stockAqui: number;
  razonDescuento: string;
  razonDescuentoOtro: string;
  campana?: CampanaLinea | null;
  /** Una pieza de liquidación (ADR-0371): su etiqueta. */
  liquidacion?: { codigo: string } | null;
};

/** Color y talla de la variante, tal como los trae el catálogo de la caja. La línea del carrito no los guarda:
 *  un ticket en espera o una prenda que ya no está en el catálogo llega sin ellos y la fila muestra el código. */
export type DetalleVariante = { color: string | null; talla: string | null };

/** Desde cuántas unidades en la sede el punto del stock es verde (el del spike: `s.piso >= 3`). Menos, ámbar: quedan pocas. */
export const STOCK_HOLGADO = 3;

/** `excedido`: el stock en vivo (`useStockEnVivo`) bajó de lo que ya está en el ticket; el cobro lo frena (`motivoBloqueoCobro`). */
export type TonoStock = "verde" | "ambar" | "excedido";

export type FilaDelTicket = {
  /** Una «Prenda sin registrar» (ADR-0179): va de a una, sin stock que mostrar. */
  sinRegistrar: boolean;
  /** «Rosa · Talla M»; si no se conoce ninguno de los dos, el código de la etiqueta (lo que se veía antes). */
  detalle: string;
  /** Para el `title` del nombre: el código de la etiqueta que antes se leía en la fila. */
  titulo: string;
  /** El «● Stock: N» (ex «Máximo disponible en sede: N»); null en una prenda sin registrar. */
  stock: { cantidad: number; tono: TonoStock } | null;
  /** Ya no se puede subir: la cantidad llegó a lo que hay en la sede. Apaga el «+» (mismo tope que antes). */
  alTope: boolean;
  /** El «− 1 +». Una prenda sin registrar no lo lleva: la base exige cantidad 1 y el paso no tendría nada que hacer. */
  conPaso: boolean;
  /** El importe abre el descuento de la prenda. Una pieza de liquidación no lo lleva: su precio es final (ADR-0371). */
  conDescuento: boolean;
  /** El % de la línea: con campaña, el de SU campaña, no la cuenta monto ÷ precio. */
  pct: number;
  /** «−25 % · Black Friday» o «−20 % · Prenda con desperfecto»; null sin descuento. */
  nota: string | null;
  importe: number;
  /** El importe de lista, tachado debajo del que se cobra; null sin descuento. */
  importeLista: number | null;
};

/** El % que se ve en la fila: el de la campaña si el descuento es de campaña (el descuento es exacto al céntimo, pero
 *  monto ÷ precio puede correrse un pelo: 4.98 de 19.90 es 25.03 % y la campaña es de 25 %); si no, la cuenta de siempre. */
export function porcentajeVisible(l: LineaParaFila): number {
  return esDescuentoDeCampana(l) && l.campana ? l.campana.pct : porcentajeDeLinea(l);
}

/** El porqué del descuento, en palabras de la tienda: el nombre de la campaña, el texto de «Otro» (una proforma
 *  deja ahí «Precio de la proforma P-…») o la etiqueta del motivo de la lista cerrada (R-45). */
export function motivoDeLaLinea(l: LineaParaFila): string {
  if (esDescuentoDeCampana(l)) return l.campana?.nombre.trim() || "Campaña";
  if (l.razonDescuento === "otro") return l.razonDescuentoOtro.trim() || "Otro";
  return RAZONES_DESCUENTO.find((r) => r.valor === l.razonDescuento)?.etiqueta ?? "Descuento";
}

export function tonoDelStock(cantidad: number, stock: number): TonoStock {
  if (cantidad > stock) return "excedido";
  return stock >= STOCK_HOLGADO ? "verde" : "ambar";
}

export function filaDelTicket(l: LineaParaFila, detalle?: DetalleVariante | null): FilaDelTicket {
  const sinRegistrar = l.varianteId === ID_CARGO_ESPECIAL;
  const pct = porcentajeVisible(l);
  const neto = l.precioUnitario - l.descuentoUnitario;
  const colorYTalla = [detalle?.color?.trim(), detalle?.talla?.trim() ? `Talla ${detalle.talla.trim()}` : null].filter(Boolean).join(" · ");
  return {
    sinRegistrar,
    detalle: l.liquidacion
      ? `Venta final · etiqueta ${l.liquidacion.codigo}`
      : sinRegistrar
        ? "Prenda sin registrar · almacén la regulariza después"
        : colorYTalla || codigoPrenda(l),
    titulo: sinRegistrar ? l.referencia : `${l.referencia} · ${codigoPrenda(l)}`,
    stock: sinRegistrar ? null : { cantidad: l.stockAqui, tono: tonoDelStock(l.cantidad, l.stockAqui) },
    alTope: l.cantidad >= l.stockAqui,
    conPaso: !sinRegistrar,
    conDescuento: !l.liquidacion,
    pct,
    nota: pct > 0 ? `−${pct} % · ${motivoDeLaLinea(l)}` : null,
    importe: l.cantidad * neto,
    importeLista: pct > 0 ? l.cantidad * l.precioUnitario : null,
  };
}
