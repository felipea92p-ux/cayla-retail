// La boleta nueva de un cambio (ADR-0672) como la imprime la térmica: la misma de cualquier venta (`ReciboTermico`), por lo que vale
// lo que se lleva, con el sello «CANCELADO» en vez de la forma de pago (se pagó con la prenda que devolvió y, si hubo, la diferencia) y
// una referencia a la compra y a su nota de crédito. Solo arma datos; no toca la base ni el papel.

import { armarRecibo, textoNumeroRecibo, type ReciboVenta, type TipoDocCliente } from "./recibo-reglas";

/** Una línea de `comprobantes.items` de la boleta del cambio: la forma de una línea de venta (precio CON IGV, descuento aparte). */
type ItemDelCambio = { variante_id?: unknown; cantidad?: unknown; precio_unitario?: unknown; descuento_unitario?: unknown };

/** Lo que se lee de `comprobantes` para la boleta del cambio. */
export type BoletaDelCambio = {
  tipo: "boleta" | "factura";
  serie: string;
  numero: number;
  created_at: string;
  cliente_tipo_doc: TipoDocCliente;
  cliente_num_doc: string | null;
  cliente_nombre: string | null;
  items: unknown;
};

/** Cómo se llama cada prenda en el papel: su referencia y su código de etiqueta. */
export type NombrePrenda = { referencia: string; codigo: string | null };

const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * La boleta del cambio lista para imprimir, o `null` si alguna línea no se puede nombrar (no se imprime un papel con una prenda que
 * no se sabe qué es: la colaboradora la ve en Comprobantes). Los pagos van vacíos a propósito: el papel dice «CANCELADO».
 */
export function reciboDeCambio(
  boleta: BoletaDelCambio,
  nombres: ReadonlyMap<string, NombrePrenda>,
  sede: string,
  atendio: string | null,
): ReciboVenta | null {
  if (!Array.isArray(boleta.items) || boleta.items.length === 0) return null;
  const lineas = [];
  for (const it of boleta.items as ItemDelCambio[]) {
    const nombre = typeof it?.variante_id === "string" ? nombres.get(it.variante_id) : undefined;
    const descuento = it?.descuento_unitario === undefined ? 0 : it.descuento_unitario;
    if (!nombre || !esNumero(it.cantidad) || !esNumero(it.precio_unitario) || !esNumero(descuento)) return null;
    lineas.push({ cantidad: it.cantidad, referencia: nombre.referencia, codigo: nombre.codigo, precioUnitario: it.precio_unitario, descuentoUnitario: descuento });
  }
  return armarRecibo({
    comprobante: boleta,
    sede,
    cliente: { tipoDoc: boleta.cliente_tipo_doc, numDoc: boleta.cliente_num_doc, nombre: boleta.cliente_nombre },
    lineas,
    pagos: [],
    tasaIgv: 0.18,
    atendio,
  });
}

/** La línea del pie: «Cambio de la Boleta B001-000012 · Nota de crédito BC01-000003». Sin la nota (otra tienda, no se pudo leer), solo la compra. */
export function textoReferenciaCambio(compra: string | null, nota: { serie: string; numero: number } | null): string {
  return [compra ? `Cambio de la ${compra}` : "Cambio de prenda", nota ? `Nota de crédito ${textoNumeroRecibo(nota)}` : null]
    .filter(Boolean)
    .join(" · ");
}
