// La devolución a medio armar es de SU sede (Felipe, 2026-10-11): la misma regla que Cambios, su pantalla gemela
// (`cambios-cambio-de-sede.ts`). Puro: lo usan la página de Devoluciones (la key), `DevolucionesPanel` y `DevolucionesFlujo`, y lo
// prueba `devoluciones-cambio-de-sede.test.ts`.
//
// El problema: tras cambiar de sede con el selector, la devolución armada en Lima seguía en la pantalla de Trujillo y
// `crear_devolucion` salía con Trujillo: la prenda entraba a su piso o a su cuarentena (la confirmación sí decía «Se registra en:
// Tienda Trujillo»). La decisión: Trujillo muestra su actividad y la devolución queda guardada en Lima; al volver, sigue en su paso.

import type { LineaVentaReciente } from "./ventas-v2";
import type { ItemElegido, MotivoDevolucion } from "./devoluciones-reglas";
import { deQuienEsLaVenta } from "./cambios-cambio-de-sede";

/** La key del panel de Devoluciones: la sede. Otra sede, otro montaje. */
export function claveDeDevoluciones(ubicacionId: string): string {
  return `devoluciones:${ubicacionId}`;
}

/** Lo que queda guardado al cambiar de sede y vuelve al regresar: la venta elegida y lo hecho en el flujo. */
export type DevolucionArmada = {
  venta: LineaVentaReciente[];
  lineaInicialId: string | null;
  paso: 2 | 3 | 4;
  elegidas: Record<string, ItemElegido>;
  motivo: MotivoDevolucion | null;
  detalle: string;
};

/** Los avisos del guardián: al irse de la sede con la devolución armada y al volver a encontrarla. */
export function avisosDeLaDevolucion({
  etiqueta,
  clienta,
  comprobante,
}: {
  etiqueta: string;
  clienta: string | null;
  comprobante: string | null;
}): { avisoAlGuardar: { texto: string; detalle: string }; avisoAlVolver: string } {
  const quien = deQuienEsLaVenta(clienta, comprobante);
  const cual = quien ? `La devolución de ${quien}` : "La devolución a medio armar";
  return {
    avisoAlGuardar: {
      texto: `${cual} quedó guardada en ${etiqueta}`,
      detalle: `Vuelve a ${etiqueta} con el selector de arriba y sigue en el mismo paso. Aquí no se registró nada.`,
    },
    avisoAlVolver: `Volvió ${cual.charAt(0).toLowerCase()}${cual.slice(1)}`,
  };
}
