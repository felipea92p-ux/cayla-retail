// El cambio a medio armar es de SU sede (Felipe, 2026-10-11). Puro: sin React ni `window`; lo usan la página de Cambios (la key),
// `CambiosPanel` y `CambiosFlujo` (qué se guarda y cómo se dice), y lo prueba `cambios-cambio-de-sede.test.ts`.
//
// El problema: el selector de sede de la cabecera cambia de sede con `router.refresh()`. La ruta no cambia y React conserva el estado
// de todo componente cliente cuya `key` siga igual. El cambio armado en Lima (la venta, la prenda nueva, el motivo) seguía en la
// pantalla de Trujillo, y `registrar_cambio` salía con Trujillo: la prenda que vuelve entraba a su piso y la nueva salía de él. La
// confirmación sí lo decía («Se registra en: Tienda Trujillo»), pero el cliente estaba en el mostrador de Lima.
//
// La decisión: Trujillo muestra su propia actividad y el cambio queda guardado en su sede (`components/ui/TrabajoPorSede.tsx`), como
// el ticket de Vender, el conteo de Recibir y el apartado de Apartados. Al volver, sigue en el mismo paso.

import type { LineaVentaReciente } from "./ventas-v2";
import type { Seleccion } from "./cambio-reemplazo-reglas";
import type { InstantaneaIntento } from "./intento-reglas";

/** La key del panel de Cambios: la sede. Otra sede, otro montaje: lo armado en una no pasa a la otra. */
export function claveDeCambios(ubicacionId: string): string {
  return `cambios:${ubicacionId}`;
}

/** Lo que queda guardado al cambiar de sede y vuelve al regresar: la venta elegida y lo hecho en el flujo. La marca del envío viaja con
 *  él (y si quedó en duda, sigue en duda): es el mismo cambio, y reintentarlo no lo duplica. */
export type CambioArmado = {
  venta: LineaVentaReciente[];
  lineaInicialId: string | null;
  lineaId: string | null;
  paso: 2 | 3 | 4;
  seleccion: Seleccion | null;
  intento: InstantaneaIntento | null;
};

/** De quién es la venta, para nombrarla en un aviso: el cliente sin su documento («Ana Prueba · DNI …» → «Ana Prueba»), si no su
 *  comprobante («la Boleta B001-000010»); `null` si no tiene ninguno. Lo comparten Cambios y Devoluciones. */
export function deQuienEsLaVenta(clienta: string | null, comprobante: string | null): string | null {
  const cliente = (clienta ?? "").split(" · ")[0].trim();
  if (cliente) return cliente;
  if (comprobante) return `la ${comprobante}`;
  return null;
}

/** Cómo se nombra el cambio: por el cliente (sin su documento), si no por su comprobante. */
function nombreDelCambio(clienta: string | null, comprobante: string | null): string {
  const quien = deQuienEsLaVenta(clienta, comprobante);
  return quien ? `El cambio de ${quien}` : "El cambio a medio armar";
}

/** Los avisos del guardián: al irse de la sede con el cambio armado y al volver a encontrarlo. */
export function avisosDelCambio({
  etiqueta,
  clienta,
  comprobante,
}: {
  etiqueta: string;
  clienta: string | null;
  comprobante: string | null;
}): { avisoAlGuardar: { texto: string; detalle: string }; avisoAlVolver: string } {
  const cual = nombreDelCambio(clienta, comprobante);
  return {
    avisoAlGuardar: {
      texto: `${cual} quedó guardado en ${etiqueta}`,
      detalle: `Vuelve a ${etiqueta} con el selector de arriba y sigue en el mismo paso. Aquí no se registró nada.`,
    },
    avisoAlVolver: `Volvió ${cual.charAt(0).toLowerCase()}${cual.slice(1)}`,
  };
}
