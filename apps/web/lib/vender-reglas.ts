// Reglas puras del punto de venta — sin `createClient`, sin `next/headers`, cero
// dependencia de servidor. Mismo patrón que `comprobantes-reglas.ts`: lo que el
// componente cliente `PuntoDeVenta` necesita como VALOR vive en un archivo que
// ningún fetcher server-only pueda arrastrar al navegador.

import type { MetodoPago } from "@cayla-retail/shared";

/** Los momentos del ticket (ADR-0044). En «armar» solo se ven las líneas y el total;
 *  «descuento» es el apartado para decidir un descuento (vuelve a «armar»); el pago y
 *  el comprobante aparecen recién al tocar «Cobrar». */
export type MomentoTicket = "armar" | "descuento" | "cobrar";

/**
 * Por qué el botón principal del ticket está apagado — o `null` si se puede seguir.
 *
 * Se deriva UNA sola vez en `PuntoDeVenta` y alimenta tres cosas a la vez: el
 * `disabled` del botón, la línea que lo explica debajo, y el freno dentro de
 * `cobrar()`. Antes cada una tenía su propia condición y el botón callaba.
 *
 * El orden es el del recorrido real: primero tiene que haber caja, después algo
 * que cobrar, y solo entonces —ya en el momento «cobrar»— cómo pagó la clienta y
 * el comprobante. Pedir el método con el ticket vacío es exactamente la decisión
 * antes de tiempo que este cambio elimina.
 */
export function motivoBloqueoCobro(v: {
  cajaAbierta: boolean;
  prendas: number;
  momento: MomentoTicket;
  metodoPago: MetodoPago | null;
  facturaSinRuc: boolean;
}): string | null {
  if (!v.cajaAbierta) return "Abre la caja para vender.";
  if (v.prendas === 0) return "Agrega una prenda para cobrar.";
  if (v.momento !== "cobrar") return null;
  if (v.metodoPago === null) return "Elige cómo pagó la clienta.";
  if (v.facturaSinRuc) return "La factura necesita el RUC de la empresa.";
  return null;
}

// ---- Descuento manual (decidido con Felipe el 2026-09-14) -------------------------
// El precio lo fija el catálogo y ya no se edita en la caja; lo que se decide en el
// mostrador es un descuento. Viaja como `descuento_unitario` por línea — la columna que
// `venta_items` ya tiene (≥ 0, ≤ precio, subtotal generado) y que `registrar_venta`
// recibe — así queda medido por prenda en vez de disfrazado de "precio más bajo".

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Un % (entero o no) convertido a monto por unidad, con 2 decimales. Fuera de 0..100
 *  se recorta: 0 (o inválido) no descuenta; 100 regala la prenda, nunca más — el
 *  candado `venta_items_descuento_no_supera_precio` lo rechazaría igual. */
export function descuentoUnitarioPorPorcentaje(precioUnitario: number, porcentaje: number): number {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  if (porcentaje >= 100) return precioUnitario;
  return redondear2((precioUnitario * porcentaje) / 100);
}

type LineaDescontable = { claveLinea: string; precioUnitario: number; descuentoUnitario: number };

/** Devuelve un carrito nuevo con el % aplicado a las líneas de `claves` — o a todas si
 *  `claves` viene vacío ("todo el ticket"). Las que no entran quedan como estaban. */
export function aplicarDescuento<L extends LineaDescontable>(carrito: L[], porcentaje: number, claves: string[]): L[] {
  const alcanza = (l: L) => claves.length === 0 || claves.includes(l.claveLinea);
  return carrito.map((l) => (alcanza(l) ? { ...l, descuentoUnitario: descuentoUnitarioPorPorcentaje(l.precioUnitario, porcentaje) } : l));
}

/** El % entero que se muestra en el chip de la línea, leído desde el monto guardado
 *  (el monto es la verdad; el % es solo cómo se lo contamos a la colaboradora). */
export function porcentajeDeLinea(l: { precioUnitario: number; descuentoUnitario: number }): number {
  if (l.precioUnitario <= 0 || l.descuentoUnitario <= 0) return 0;
  return Math.round((l.descuentoUnitario / l.precioUnitario) * 100);
}

