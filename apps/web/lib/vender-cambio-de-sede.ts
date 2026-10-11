// El ticket de Vender es de SU sede (Felipe, 2026-10-11). Puro: sin React ni `window`; lo usan la página de Vender (la key) y
// `TicketPorSede` (la espera), y lo prueba `vender-cambio-de-sede.test.ts`.
//
// El problema: el selector de sede de la cabecera cambia la sede con `router.refresh()`. La ruta no cambia y React conserva el
// estado de todo componente cliente cuya `key` siga igual; Vender montaba el Punto de venta con la misma key en todas las
// sedes («caja»), así que el ticket armado en Lima —prendas, cliente, pago y comprobante elegidos— quedaba listo para
// cobrarse en la caja de Trujillo. La base valida el stock de Trujillo al cobrar, pero si esas prendas también estaban ahí
// la venta, el dinero y la boleta quedaban en la sede equivocada.
//
// La decisión: la caja de la sede nueva arranca vacía, y el ticket que se deja queda «En espera» en su sede, para retomarlo
// al volver. Se guarda lo mismo que guarda «Dejar en espera» (prendas con su descuento adentro, nota y cliente); el medio de
// pago y el comprobante elegidos no, como nunca los guardó la espera.

/** El nombre con que el ticket aparece en la espera de su sede. */
export const NOMBRE_ESPERA_CAMBIO_DE_SEDE = "Al cambiar de sede";

/** La key del Punto de venta: la sede primero, después el ticket con que arranca (la caja, una proforma o «volver a vender»).
 *  Otra sede, otra key: React lo vuelve a montar y su estado no pasa de una tienda a otra. */
export function claveDelPuntoDeVenta({
  ubicacionId,
  proformaId = null,
  repetirVentaId = null,
}: {
  ubicacionId: string;
  proformaId?: string | null;
  repetirVentaId?: string | null;
}): string {
  const ticket = proformaId ?? (repetirVentaId ? `repetir-${repetirVentaId}` : "caja");
  return `${ubicacionId}:${ticket}`;
}

/** Lo que el Punto de venta tiene armado ahora mismo, tal como lo reporta a `TicketPorSede`. */
export type TicketVivo<L, C> = {
  carrito: readonly L[];
  nota: string;
  clienta: C | null;
  /** El ticket es una proforma en cobro (ADR-0167). */
  conProforma: boolean;
};

/** Un nombre que no esté tomado en esa espera: el segundo ticket dejado así se llama «Al cambiar de sede 2». */
function nombreLibre(base: string, ocupados: readonly (string | undefined)[]): string {
  const tomados = new Set(ocupados.map((n) => (n ?? "").trim()));
  if (!tomados.has(base)) return base;
  for (let n = 2; ; n++) if (!tomados.has(`${base} ${n}`)) return `${base} ${n}`;
}

/**
 * La espera de la sede que se deja, con el ticket que tenía armado al final. `null` = no hay nada que guardar:
 *  · un ticket vacío;
 *  · una proforma en cobro: sigue vigente en Proformas y se cobra desde ahí; como ticket suelto perdería el vínculo y se
 *    cobraría como una venta nueva.
 * Entra aunque la sede ya tenga sus 5 en espera: el tope frena a quien deja OTRO ticket en el mostrador, y aquí nadie lo
 * eligió — perder un ticket armado es peor que uno de más en la tira (Felipe, 2026-10-11).
 */
export function esperaTrasCambiarDeSede<L, C, T extends { nombre?: string }>(
  espera: readonly T[],
  vivo: TicketVivo<L, C>,
  { id, ahora }: { id: string; ahora: string },
): (T | { id: string; creadoEn: string; carrito: L[]; nota: string; nombre: string; clienta: C | null })[] | null {
  if (vivo.carrito.length === 0 || vivo.conProforma) return null;
  const nombre = nombreLibre(
    NOMBRE_ESPERA_CAMBIO_DE_SEDE,
    espera.map((t) => t.nombre),
  );
  return [...espera, { id, creadoEn: ahora, carrito: [...vivo.carrito], nota: vivo.nota, nombre, clienta: vivo.clienta }];
}
