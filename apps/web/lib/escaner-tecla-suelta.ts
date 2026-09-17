// Una pistola de códigos de barras es un teclado: escribe el código donde esté el foco
// y remata con Enter. En Vender, si la encargada de sede tocó un chip, una tarjeta o
// «Quitar» antes de escanear, el foco quedó en ese botón: los caracteres se pierden y
// el Enter final ACTIVA el botón — puede cobrar a medio escaneo o quitar una línea.
//
// Esta regla decide, por cada tecla suelta que llega a la ventana, si hay que mover el
// foco al campo de escaneo antes de que el carácter caiga. El padre (`PuntoDeVenta`)
// la aplica en un `keydown` global, solo con la caja abierta y sin modal abierto — las
// dos guardas que dependen de su estado viven ahí, no acá.
//
// Sin DOM a propósito (tipos estructurales) para poder probarla sin navegador, igual
// que `conteo-varianza.ts` o `panel-serie.ts`.

export type TeclaSuelta = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/** `document.activeElement`: `isContentEditable` solo existe en HTMLElement, por eso opcional. */
export type ElementoActivo = { tagName: string; isContentEditable?: boolean } | null;

const CAMPOS_DE_TEXTO = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function teclaSueltaVaAlEscaner(tecla: TeclaSuelta, activo: ElementoActivo): boolean {
  // Atajos del navegador o del sistema (Ctrl+R, Alt+Tab…) no son escaneo.
  if (tecla.ctrlKey || tecla.metaKey || tecla.altKey) return false;
  // Solo caracteres imprimibles: Enter, Tab, flechas, Escape, F5 vienen con nombre largo.
  if (tecla.key.length !== 1) return false;
  // El espacio activa el botón enfocado (accesibilidad por teclado); ningún código empieza así.
  if (tecla.key === " ") return false;
  if (!activo) return true;
  // Un campo de texto con foco es dueño de la tecla: DNI de la clienta, cantidad, precio.
  if (CAMPOS_DE_TEXTO.has(activo.tagName.toUpperCase())) return false;
  if (activo.isContentEditable) return false;
  return true;
}
