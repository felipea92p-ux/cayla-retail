/**
 * La página no se encoge bajo el mouse (ADR-0185) — la parte pura, sin DOM, para poder probarla.
 *
 * EL PROBLEMA. Un clic (o una tecla, en un buscador con filtrado en vivo) cambia un bloque del final por otro
 * más corto (Contado → Crédito, una pestaña, «Volver sin cerrar», un medio de pago que no muestra datos, una
 * lista que se achica al escribir). Si la persona estaba abajo del todo, la página o la ventana pierde alto y el
 * navegador no puede dejarla más abajo que el nuevo final: recorta el scroll y la vista «se sube sola». No es un
 * scroll que alguien pidió: es el piso que se movió.
 *
 * LA REGLA. Durante un momento después de la interacción, si el contenedor que se desplaza (la página o una
 * ventana) se acortó Y el navegador tuvo que recortar el scroll (quedó pegado al nuevo final), se reserva al
 * fondo exactamente lo que se recortó y se devuelve la vista adonde estaba. La reserva es aire vacío al final; se
 * suelta sola en cuanto queda fuera de la vista (la persona sube, o el contenido vuelve a crecer).
 *
 * QUÉ NO ES. Un scroll pedido por el código (llevar a un campo con error, volver arriba al cambiar de página) no
 * deja la vista pegada al final, así que no cumple la condición y se respeta.
 *
 * TRES EVENTOS, NO UNO (2026-09-25). `click` y `change` abren vigilancia siempre. `input` (cada letra de un
 * buscador) es distinto: una ráfaga de tecleo dispara un evento por letra, y reabrir la vigilancia en cada uno
 * perdería la foto de «antes de escribir» — la única válida para medir cuánto se acortó — además de crear y
 * destruir el `ResizeObserver` sin necesidad. `esContinuacionDeTecleo` decide cuándo un `input` debe limitarse a
 * extender el plazo de la vigilancia ya abierta, no reabrirla.
 */

/** Cuánto dura la vigilancia después de una interacción: cubre el colapso animado de 240 ms, un render algo
 *  lento, y —para un buscador— la pausa típica entre letras mientras la persona sigue escribiendo. */
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

/**
 * Un `change` que llega pegado a un clic muy reciente (<300 ms) ya fue capturado por ese clic: no abre
 * vigilancia propia. Medir en ese `change` tomaría la foto de DESPUÉS del recorte (React ya repintó).
 */
export function esChangeInmediatoAlClic(tipoEvento: string, msDesdeUltimoClic: number | null): boolean {
  return tipoEvento === "change" && msDesdeUltimoClic !== null && msDesdeUltimoClic < 300;
}

/**
 * Un `input` (una tecla en un buscador con filtrado en vivo) que llega mientras ya hay una vigilancia abierta
 * sobre el MISMO contenedor no debe reabrirla: perdería la foto de «antes de escribir», la única que sirve para
 * medir cuánto se acortó la lista al terminar de escribir. Solo se le da más tiempo (ver `VENTANA_TRAS_CLIC_MS`).
 * Un `input` sin vigilancia previa, o sobre OTRO contenedor, sí abre una nueva — es la primera letra, o el
 * campo cambió.
 */
export function esContinuacionDeTecleo(tipoEvento: string, hayVigilanciaAbierta: boolean, mismoContenedor: boolean): boolean {
  return tipoEvento === "input" && hayVigilanciaAbierta && mismoContenedor;
}
