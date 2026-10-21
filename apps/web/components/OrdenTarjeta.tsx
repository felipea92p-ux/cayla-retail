"use client";

import { Chip } from "@/components/ui/Chip";
import { precioParaMargen, semaforoMargen, TEXTO_SEMAFORO, type EstadoEntrega } from "@/lib/produccion-reglas";
import type { OrdenProduccion } from "@/lib/produccion";

// Lo que el cajón de una orden (`OrdenPanel`) toma de la antigua tarjeta del tablero (ADR-0133, F2): el semáforo de margen y el chip de entrega. La tarjeta misma se fue con el tablero
// (ADR-0400, actividad 5): la lista de Órdenes dibuja cada orden con `FilaDeOrden`.

const TONO_SEMAFORO = { gana: "bg-verde", filo: "bg-ambar", pierde: "bg-rojo" } as const;

/** El semáforo de margen de una orden. El precio con que se mide es el MÁS BAJO de cualquier tienda si alguna vende el modelo más barato que la grilla (`precioParaMargen`,
 *  ADR-0370): `sede` dice cuál, para que el color no parezca contradecir el «precio de venta». */
export function semaforoDeOrden(o: Pick<OrdenProduccion, "precioVenta" | "costoUnitario" | "precioMasBajo">) {
  const s = semaforoMargen(precioParaMargen(o), o.costoUnitario);
  return s ? { ...s, clase: TONO_SEMAFORO[s.tono], texto: TEXTO_SEMAFORO[s.tono], sede: o.precioMasBajo?.sede ?? null } : null;
}

/** «Entrega pasada · 3 d», «Entrega hoy», «Entrega en 2 d» o la fecha sin alarma. */
export function ChipEntrega({ entrega }: { entrega: EstadoEntrega }) {
  if (entrega.tipo === "vencida") return <Chip tono="rojo">Entrega pasada · {entrega.dias} d</Chip>;
  if (entrega.tipo === "pronto") return <Chip tono="ambar">{entrega.dias === 0 ? "Entrega hoy" : `Entrega en ${entrega.dias} d`}</Chip>;
  return null;
}
