import type { ItemCarrito, VarianteBusqueda } from "@/components/PuntoDeVenta";
import { conDescuentoDeCampana } from "./vender-reglas";
import { motivoNoCobrable, type AvisoStock } from "./vender-stock-local";

/**
 * «Volver a vender» desde Ventas ▸ Historial (ADR-0230): el ticket del Punto de Venta arranca con las MISMAS prendas de
 * una venta anterior —la clienta vuelve por la misma blusa en otro color, o se lleva otra igual para su hermana—. No es
 * una copia de la venta: el precio es la etiqueta de HOY (con la campaña del día si la hay, la regla de siempre del
 * carrito) y la cantidad se recorta al PISO de esta tienda, igual que al cobrar una proforma. Lo que no hay o no alcanza
 * vuelve en `faltan` con su razón, para avisarlo con nombre. `registrar_venta` lo vuelve a verificar todo al cobrar.
 */
export type PrendaParaRepetir = { varianteId: string; cantidad: number; descripcion: string };

export type RepeticionDeVenta = {
  /** «B004-000031» o, si la venta no tuvo comprobante, «la venta del 25 set». */
  origen: string;
  lineas: ItemCarrito[];
  faltan: string[];
};

export function lineasDelCarritoDesdeVenta(prendas: readonly PrendaParaRepetir[], variantes: readonly VarianteBusqueda[]): { lineas: ItemCarrito[]; faltan: string[] } {
  const porVariante = new Map<string, PrendaParaRepetir>();
  // Dos líneas de la misma variante (se escaneó dos veces) son una sola fila del ticket.
  for (const p of prendas) {
    const ya = porVariante.get(p.varianteId);
    porVariante.set(p.varianteId, ya ? { ...ya, cantidad: ya.cantidad + p.cantidad } : { ...p });
  }
  const lineas: ItemCarrito[] = [];
  const faltan: string[] = [];
  for (const p of porVariante.values()) {
    const v = variantes.find((x) => x.varianteId === p.varianteId);
    if (!v) {
      faltan.push(`${p.descripcion} (ya no está en el catálogo)`);
      continue;
    }
    if (v.stockAqui <= 0) {
      const enAlmacen = v.almacenAqui ?? 0;
      faltan.push(`${p.descripcion} (${enAlmacen > 0 ? `${enAlmacen} en el almacén` : motivoNoCobrable(v) === "apartada" ? "apartada para una clienta" : "no hay en esta tienda"})`);
      continue;
    }
    const cantidad = Math.min(p.cantidad, v.stockAqui);
    if (cantidad < p.cantidad) faltan.push(`${p.descripcion} (en el piso hay ${v.stockAqui} de ${p.cantidad})`);
    lineas.push(
      conDescuentoDeCampana({
        claveLinea: v.varianteId,
        varianteId: v.varianteId,
        referencia: v.referencia,
        sku: v.sku,
        codigo: v.codigo,
        cantidad,
        precioUnitario: v.precio,
        descuentoUnitario: 0,
        stockAqui: v.stockAqui,
        razonDescuento: "",
        razonDescuentoOtro: "",
        argumentoDescuento: "",
        campana: v.campana ?? null,
      })
    );
  }
  return { lineas, faltan };
}

/** El aviso al abrir el Punto de Venta con una venta repetida: lo que no entró, con su razón. Nada que avisar: null. */
export function avisoFaltanDeRepeticion(r: Pick<RepeticionDeVenta, "origen" | "faltan">): AvisoStock | null {
  if (r.faltan.length === 0) return null;
  return { titulo: `No todo lo de ${r.origen} entró al ticket`, detalle: `${r.faltan.join("; ")}.` };
}
