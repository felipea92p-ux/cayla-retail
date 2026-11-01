import type { KeyboardEvent } from "react";

/* ====================================================================
   enterNoGuarda · guardar es un acto explícito (2026-10-31)

   El problema: en HTML, un `<form>` con un botón `type="submit"` se envía
   al pulsar Enter en CUALQUIER caja de texto de adentro. Medido con
   teclado de verdad en «Nuevo avío»: con la hoja completa, UN SOLO Enter
   en el campo del nombre creaba el avío y cerraba la hoja — y esa hoja fija
   la unidad para siempre al primer lote. `/chaos` lo encontró y se lo
   atribuyó al combo; la medición dice que el combo es solo una de las
   puertas, y la grande es el envío implícito del formulario.

   No es una regla nueva: este mismo gesto estaba copiado A MANO en seis
   formularios (Nuevo producto, Editar producto, los dos comprobantes de
   orden, Recibir mercadería y su hoja de prenda), con sus comentarios
   diciendo lo mismo. Lo que faltaba era que fuera UNA pieza, y que la
   tuvieran las diez hojas que la necesitaban.

   La regla para una hoja nueva que guarda: `<form onSubmit={…}
   onKeyDown={enterNoGuarda}>`. Lo vigila `lib/enter-no-guarda.test.ts`; lo
   que de verdad quiere enviarse con Enter (un buscador, el login) se
   declara ahí con su motivo.

   Qué NO toca: el Enter de una caja de varias líneas (ahí es un salto), el de un
   botón (ahí Enter ES «pulsa esto», incluido el de guardar) y el que otro
   control ya usó — un combo que eligió de su lista hace `preventDefault()`,
   y eso aquí se respeta, igual que la regla del Escape (ADR-0136).
   ==================================================================== */

/** La decisión, en texto plano para poder probarla: las pruebas de este repo corren sin DOM, así que mira el
 *  `tagName` y no `instanceof HTMLInputElement`. Una regla que no se puede probar no es una regla. */
export function hayQueFrenarElEnter(tecla: string, etiqueta: string, yaLoUsaron: boolean): boolean {
  if (tecla !== "Enter" || yaLoUsaron) return false;
  return etiqueta === "INPUT";
}

/** Para el `onKeyDown` del `<form>` de una hoja que guarda. */
export function enterNoGuarda(e: KeyboardEvent): void {
  if (hayQueFrenarElEnter(e.key, (e.target as HTMLElement | null)?.tagName ?? "", e.defaultPrevented)) e.preventDefault();
}
