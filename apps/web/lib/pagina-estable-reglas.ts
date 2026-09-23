/**
 * La página no se encoge bajo el mouse (ADR-0182) — la parte pura, sin DOM, para poder probarla.
 *
 * EL PROBLEMA. Un clic cambia un bloque del final por otro más corto (Contado → Crédito, una pestaña, «Volver
 * sin cerrar», un medio de pago que no muestra datos). Si la persona estaba abajo del todo, la página o la
 * ventana pierde alto y el navegador no puede dejarla más abajo que el nuevo final: recorta el scroll y la vista
 * «se sube sola». No es un scroll que alguien pidió: es el piso que se movió.
 *
 * LA REGLA. Durante un momento después de un clic, si el contenedor que se desplaza (la página o una ventana) se
 * acortó Y el navegador tuvo que recortar el scroll (quedó pegado al nuevo final), se reserva al fondo exactamente
 * lo que se recortó y se devuelve la vista adonde estaba. La reserva es aire vacío al final; se suelta sola en
 * cuanto queda fuera de la vista (la persona sube, o el contenido vuelve a crecer).
 *
 * QUÉ NO ES. Un scroll pedido por el código (llevar a un campo con error, volver arriba al cambiar de página) no
 * deja la vista pegada al final, así que no cumple la condición y se respeta.
 */

/** Cuánto dura la vigilancia después de un clic: cubre el colapso animado de 240 ms y un render algo lento. */
export const VENTANA_TRAS_CLIC_MS = 1200;

export type Medida = {
  /** `scrollTop` del contenedor. */
  arriba: number;
  /** `scrollHeight` del contenedor. */
  alto: number;
  /** `clientHeight` del contenedor: lo que se ve. */
  visible: number;
};

/**
 * Cuánto hay que reservar al fondo para que la vista vuelva adonde estaba al hacer clic, o 0 si no hace falta.
 * Solo cuando fue el navegador el que recortó: el contenido se acortó y la vista quedó pegada al nuevo final.
 */
export function reservaNecesaria(alClic: Medida, ahora: Medida): number {
  const seAcorto = ahora.alto < alClic.alto - 0.5;
  const subio = ahora.arriba < alClic.arriba - 0.5;
  const pegadaAlFinal = ahora.arriba + ahora.visible >= ahora.alto - 1;
  if (!seAcorto || !subio || !pegadaAlFinal) return 0;
  return Math.round(alClic.arriba - ahora.arriba);
}

/** La reserva ya no se ve (quedó entera por debajo de lo visible): se puede quitar sin que nada se mueva. */
export function puedeSoltar(ahora: Medida, reserva: number): boolean {
  return ahora.arriba + ahora.visible <= ahora.alto - reserva + 0.5;
}
