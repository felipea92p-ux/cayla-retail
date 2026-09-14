// Reglas puras del punto de venta — sin `createClient`, sin `next/headers`, cero
// dependencia de servidor. Mismo patrón que `comprobantes-reglas.ts`: lo que el
// componente cliente `PuntoDeVenta` necesita como VALOR vive en un archivo que
// ningún fetcher server-only pueda arrastrar al navegador.

import type { MetodoPago } from "@cayla-retail/shared";

/** Los dos momentos del ticket (decidido con Felipe el 2026-09-14, ADR «el ticket de
 *  Vender tiene dos momentos»). En «armar» solo se ven las líneas y el total; el
 *  pago y el comprobante aparecen recién al tocar «Cobrar». */
export type MomentoTicket = "armar" | "cobrar";

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
  if (v.momento === "armar") return null;
  if (v.metodoPago === null) return "Elige cómo pagó la clienta.";
  if (v.facturaSinRuc) return "La factura necesita el RUC de la empresa.";
  return null;
}
