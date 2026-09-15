// Reglas puras del punto de venta — sin `createClient`, sin `next/headers`, cero
// dependencia de servidor. Mismo patrón que `comprobantes-reglas.ts`: lo que el
// componente cliente `PuntoDeVenta` necesita como VALOR vive en un archivo que
// ningún fetcher server-only pueda arrastrar al navegador.

import type { MetodoPago } from "@cayla-retail/shared";

/** Los momentos del ticket (ADR-0044). En «armar» solo se ven las líneas y el total;
 *  «descuento» es el apartado para decidir un descuento (vuelve a «armar»); «espera» es
 *  la lista de tickets en espera de la sede (vuelve a «armar»); el pago y el comprobante
 *  aparecen recién al tocar «Cobrar». */
export type MomentoTicket = "armar" | "descuento" | "espera" | "cobrar";

/** Qué tickets en espera vuelven a la pantalla al montar Vender. La espera de la sede
 *  se vacía al cerrar caja (ADR-0049) — y eso incluye abrir la página al día siguiente
 *  con la caja todavía cerrada: lo guardado ayer no vuelve. Vive acá y no dentro del
 *  efecto porque es la decisión, no el acceso al storage. */
export function esperaAlCargar<T>(cajaCerrada: boolean, guardados: T[]): T[] {
  return cajaCerrada ? [] : guardados;
}

/** Un medio con el que la clienta pagó parte (o todo) del ticket. `recibido` es solo
 *  para el efectivo y solo de pantalla: lo que entregó, para calcular el vuelto. A la
 *  RPC viaja únicamente `{ metodo, monto }` — si viajara lo entregado en vez de lo que
 *  cubre, `registrar_venta` lo rechazaría por no cuadrar con los ítems. */
export type PagoAplicado = { metodo: MetodoPago; monto: number; recibido?: number };

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que falta cubrir del total con los pagos puestos, a 2 decimales. Negativo si se
 *  pasan — `registrar_venta` exige que sumen igual que los ítems al centavo. */
export function restanteDePagos(total: number, pagos: readonly PagoAplicado[]): number {
  return redondear2(total - pagos.reduce((acc, p) => acc + p.monto, 0));
}

/** El vuelto de un pago: lo recibido menos lo que cubre, solo en efectivo (Yape, Plin,
 *  tarjeta y transferencia no dan vuelto). Nunca negativo: si lo recibido no llega, no
 *  hay vuelto que mostrar — lo que falta lo dice `motivoBloqueoCobro`. */
export function vueltoDe(pago: PagoAplicado): number {
  if (pago.metodo !== "efectivo" || pago.recibido === undefined) return 0;
  return Math.max(0, redondear2(pago.recibido - pago.monto));
}

/**
 * Por qué el botón principal del ticket está apagado — o `null` si se puede seguir.
 *
 * Se deriva UNA sola vez en `PuntoDeVenta` y alimenta tres cosas a la vez: el
 * `disabled` del botón, la línea que lo explica debajo, y el freno dentro de
 * `cobrar()`. Antes cada una tenía su propia condición y el botón callaba.
 *
 * El orden es el del recorrido real: primero tiene que haber caja, después algo
 * que cobrar, y solo entonces —ya en el momento «cobrar»— con qué se cubre la
 * plata (todos los medios, hasta el centavo) y recién al final el comprobante.
 * Pedir el método con el ticket vacío es exactamente la decisión antes de tiempo
 * que este cambio elimina.
 */
export function motivoBloqueoCobro(v: {
  cajaAbierta: boolean;
  prendas: number;
  momento: MomentoTicket;
  total: number;
  pagos: readonly PagoAplicado[];
  facturaSinRuc: boolean;
}): string | null {
  if (!v.cajaAbierta) return "Abre la caja para vender.";
  if (v.prendas === 0) return "Agrega una prenda para cobrar.";
  if (v.momento !== "cobrar") return null;
  if (v.pagos.length === 0) return "Elige cómo pagó la clienta.";
  const restante = restanteDePagos(v.total, v.pagos);
  if (restante > 0) return `Falta cubrir S/${restante.toFixed(2)}.`;
  if (restante < 0) return "Los pagos superan el total.";
  if (v.facturaSinRuc) return "La factura necesita el RUC de la empresa.";
  return null;
}

// ---- Descuento manual (decidido con Felipe el 2026-09-14) -------------------------
// El precio lo fija el catálogo y ya no se edita en la caja; lo que se decide en el
// mostrador es un descuento. Viaja como `descuento_unitario` por línea — la columna que
// `venta_items` ya tiene (≥ 0, ≤ precio, subtotal generado) y que `registrar_venta`
// recibe — así queda medido por prenda en vez de disfrazado de "precio más bajo".

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

