/**
 * El stock de la caja después de vender, sin recargar la pantalla entera (ADR-0192).
 *
 * EL PROBLEMA. Tras cada venta la caja hacía `router.refresh()`: el servidor volvía a leer el catálogo, el stock de
 * TODA la red (~2.900 filas), el de la sede (~2.300), campañas, categorías, tallas y colores — ~10 viajes y ~1 MB por
 * venta, por caja. Lo único que una venta cambia es el stock de SUS prendas en ESTA sede y la lista de ventas de hoy.
 *
 * LA REGLA. Al vender, la pantalla descuenta lo vendido de inmediato (la cajera no ve unidades que ya cobró) y
 * después relee de la base SOLO esas prendas: la cifra final es la de la base, que también refleja lo que otra caja
 * vendió de esas mismas prendas mientras tanto. Si otra caja vende la última unidad de una prenda que aquí no se tocó,
 * esta pantalla la sigue mostrando hasta la próxima carga: quien lo defiende es `registrar_venta` (valida el stock con
 * candado y responde «Stock insuficiente», que la caja traduce con el nombre de la prenda).
 *
 * Todo aquí es puro: lo usan `PuntoDeVenta` (cliente) y `vender/page.tsx` (servidor).
 */
import type { Cantidades } from "@/lib/inventario-reglas";

/** Lo que la caja puede cobrar de una prenda: el PISO disponible (una venta nunca descuenta el almacén en
 *  silencio) o, en una ubicación sin piso/almacén (Taller), el total disponible. Lo apartado no cuenta (ADR-0141). */
export function cantidadCobrable(c: Cantidades | undefined): number {
  if (!c) return 0;
  return c.pisoDisponible ?? c.disponible;
}

/** Stock de la caja corregido: `ajustes` pisa `stockAqui` de las prendas que se vendieron o releyeron en esta
 *  pantalla. Devuelve el MISMO arreglo si no hay nada que corregir (los `useMemo` de abajo no se recalculan). */
export function conStockAjustado<V extends { varianteId: string; stockAqui: number }>(variantes: V[], ajustes: ReadonlyMap<string, number>): V[] {
  if (ajustes.size === 0) return variantes;
  return variantes.map((v) => (ajustes.has(v.varianteId) ? { ...v, stockAqui: ajustes.get(v.varianteId)! } : v));
}

/** Descuenta lo vendido del stock que la pantalla muestra, sin bajar de 0. Parte de `stockActual` (lo que se ve
 *  ahora, sin la cola sin conexión) y devuelve los ajustes nuevos, mezclados con los que ya había. */
export function descontarVendido(
  ajustes: ReadonlyMap<string, number>,
  stockActual: ReadonlyMap<string, number>,
  vendidas: { varianteId: string; cantidad: number }[],
): Map<string, number> {
  const nuevos = new Map(ajustes);
  for (const { varianteId, cantidad } of vendidas) {
    const antes = nuevos.get(varianteId) ?? stockActual.get(varianteId);
    if (antes === undefined) continue; // no está en el catálogo de la caja (prenda sin registrar, cargo especial)
    nuevos.set(varianteId, Math.max(0, antes - cantidad));
  }
  return nuevos;
}

/** Mezcla lo que la base respondió para las prendas releídas. Una prenda pedida que no volvió en la respuesta ya no
 *  tiene fila de stock en esta sede: queda en 0 (no se inventa lo que había antes). */
export function conStockReleido(ajustes: ReadonlyMap<string, number>, pedidas: string[], releido: ReadonlyMap<string, Cantidades>): Map<string, number> {
  const nuevos = new Map(ajustes);
  for (const id of pedidas) nuevos.set(id, cantidadCobrable(releido.get(id)));
  return nuevos;
}
