import type { ItemCarrito, VarianteBusqueda } from "@/components/PuntoDeVenta";
import { lineasDeLaProforma, numeroDeProforma, precioAlCobrarDeLaProforma, type LineaProforma, type Proforma } from "./proformas-reglas";
import { conDescuentoDeCampana } from "./vender-reglas";
import { DONDE_SE_BAJA, type AvisoStock } from "./vender-stock-local";

/**
 * Las líneas de una proforma como carrito del Punto de Venta («Cobrar», ADR-0167). El precio es la etiqueta de
 * HOY (lo exige `registrar_venta`) y lo prometido va como descuento (`precioAlCobrarDeLaProforma`). Si la campaña
 * del día deja la prenda más barata, gana la campaña (regla del carrito: un solo descuento, el mayor). La cantidad
 * se recorta al PISO de esta tienda (la venta descuenta el piso); lo que no hay (o no alcanza) vuelve en `faltan` para
 * avisarlo con nombre y su razón, y si está en el almacén de esta tienda lo dice con el número (D-40: se puede vender,
 * falta bajarlo) — `faltanEnAlmacen` avisa que hay algo que pedir que bajen.
 *
 * `prometidas`: TODAS las prendas de la proforma con el cobro prometido, hayan entrado o no. Una que no entró porque
 * estaba en el almacén, y que bajan después, se agrega escaneándola: sin esto entraba a precio de etiqueta y la venta
 * cobraba de más lo que la proforma había cotizado (`agregar()` la busca aquí).
 * Todo lo vuelve a verificar `registrar_venta` al cobrar (costo, topes por rol, código de una colaboradora).
 */
export function lineasDelCarritoDesdeProforma(
  p: Proforma,
  variantes: VarianteBusqueda[],
): { lineas: ItemCarrito[]; faltan: string[]; faltanEnAlmacen: boolean; prometidas: ItemCarrito[] } {
  const numero = numeroDeProforma(p.numero);
  const lineas: ItemCarrito[] = [];
  const faltan: string[] = [];
  const prometidas: ItemCarrito[] = [];
  let faltanEnAlmacen = false;
  for (const l of lineasDeLaProforma(p.items) ?? []) {
    const v = variantes.find((x) => x.varianteId === l.variante_id);
    const enAlmacen = v?.almacenAqui ?? 0;
    if (v) prometidas.push(lineaAlPrecioDeLaProforma(l, v, numero, l.cantidad));
    if (!v || v.stockAqui <= 0) {
      // Cada una con su razón: si se mezclan una del almacén y una que no hay, el aviso no manda a buscar la segunda.
      faltan.push(`${l.descripcion} (${enAlmacen > 0 ? `${enAlmacen} en el almacén` : "no hay en esta tienda"})`);
      faltanEnAlmacen ||= enAlmacen > 0;
      continue;
    }
    const cantidad = Math.min(l.cantidad, v.stockAqui);
    if (cantidad < l.cantidad) {
      faltan.push(
        enAlmacen > 0
          ? `${l.descripcion} (en el piso hay ${v.stockAqui} de ${l.cantidad}; ${enAlmacen} más en el almacén)`
          : `${l.descripcion} (solo hay ${v.stockAqui} de ${l.cantidad})`,
      );
      faltanEnAlmacen ||= enAlmacen > 0;
    }

    lineas.push(lineaAlPrecioDeLaProforma(l, v, numero, cantidad));
  }
  return { lineas, faltan, faltanEnAlmacen, prometidas };
}

/** El aviso al abrir el cobro de una proforma que no entró entera. Cada prenda lleva su razón (`faltan`); si alguna está
 *  en el almacén, dice qué hacer y que al sumarla entra al precio de la proforma (`prometidas`), no al de etiqueta.
 *  Nada que avisar: `null`. */
export function avisoFaltanDeProforma({ numero, faltan, faltanEnAlmacen = false }: { numero: string; faltan: string[]; faltanEnAlmacen?: boolean }): AvisoStock | null {
  if (faltan.length === 0) return null;
  return {
    titulo: `No todo lo de ${numero} entró al ticket`,
    detalle: `${faltan.join("; ")}.${
      faltanEnAlmacen ? ` Lo del almacén se puede cobrar: que lo bajen en ${DONDE_SE_BAJA} y súmalo al ticket; entra al precio de la proforma.` : ""
    }`,
  };
}

/** Una línea de la proforma como fila del ticket: la etiqueta de HOY con lo prometido como descuento; si la campaña del
 *  día deja la prenda más barata, gana la campaña (un solo descuento, el mayor). */
function lineaAlPrecioDeLaProforma(l: LineaProforma, v: VarianteBusqueda, numero: string, cantidad: number): ItemCarrito {
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
  return deCampana.descuentoUnitario > deProforma.descuentoUnitario ? deCampana : deProforma;
}
