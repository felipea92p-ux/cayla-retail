import type { ItemCarrito, VarianteBusqueda } from "@/components/PuntoDeVenta";
import { lineasDeLaProforma, numeroDeProforma, precioAlCobrarDeLaProforma, type Proforma } from "./proformas-reglas";
import { conDescuentoDeCampana } from "./vender-reglas";

/**
 * Las líneas de una proforma como carrito del Punto de Venta («Cobrar», ADR-0167). El precio es la etiqueta de
 * HOY (lo exige `registrar_venta`) y lo prometido va como descuento (`precioAlCobrarDeLaProforma`). Si la campaña
 * del día deja la prenda más barata, gana la campaña (regla del carrito: un solo descuento, el mayor). La cantidad
 * se recorta al stock de esta tienda; lo que no hay (o no alcanza) vuelve en `faltan` para avisarlo con nombre.
 * Todo lo vuelve a verificar `registrar_venta` al cobrar (costo, topes por rol, código de una colaboradora).
 */
export function lineasDelCarritoDesdeProforma(p: Proforma, variantes: VarianteBusqueda[]): { lineas: ItemCarrito[]; faltan: string[] } {
  const numero = numeroDeProforma(p.numero);
  const lineas: ItemCarrito[] = [];
  const faltan: string[] = [];
  for (const l of lineasDeLaProforma(p.items) ?? []) {
    const v = variantes.find((x) => x.varianteId === l.variante_id);
    if (!v || v.stockAqui <= 0) {
      faltan.push(l.descripcion);
      continue;
    }
    const cantidad = Math.min(l.cantidad, v.stockAqui);
    if (cantidad < l.cantidad) faltan.push(`${l.descripcion} (solo hay ${v.stockAqui} de ${l.cantidad})`);

    const cobro = precioAlCobrarDeLaProforma(l, v.precio, numero);
    const base: ItemCarrito = {
      claveLinea: v.varianteId,
      varianteId: v.varianteId,
      referencia: v.referencia,
      sku: v.sku,
      codigo: v.codigo,
      cantidad,
      precioUnitario: cobro.precioUnitario,
      descuentoUnitario: 0,
      stockAqui: v.stockAqui,
      razonDescuento: "",
      razonDescuentoOtro: "",
      argumentoDescuento: "",
      campana: v.campana ?? null,
    };
    const deCampana = conDescuentoDeCampana(base);
    const deProforma: ItemCarrito = { ...base, descuentoUnitario: cobro.descuentoUnitario, razonDescuento: cobro.motivo, razonDescuentoOtro: cobro.motivoDetalle };
    lineas.push(deCampana.descuentoUnitario > deProforma.descuentoUnitario ? deCampana : deProforma);
  }
  return { lineas, faltan };
}
