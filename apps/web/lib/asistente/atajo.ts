// «Pregúntale a CAYLA» (ADR-0536): cuándo una tecla abre el asistente. Lógica pura, probada en `atajo.test.ts`.
//
// ⌘K ya es del buscador de la cabecera (`BuscadorGlobal`) y «/» lleva el cursor al buscador de la pantalla (`Buscador`), así que el
// asistente usa «?» (la tecla de ayuda de siempre) fuera de un campo, y ⌘/ (Ctrl+/) desde cualquier lado, también escribiendo.

export function esAtajoDelAsistente(t: {
  tecla: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  /** El cursor está en un campo de texto: ahí «?» es una letra que se escribe. */
  enCampo: boolean;
  /** Hay otra hoja abierta: el asistente no se abre encima (ADR-0136). */
  hayHoja: boolean;
  /** Otro control ya usó la tecla (`defaultPrevented`). */
  usada: boolean;
}): boolean {
  if (t.usada || t.hayHoja || t.alt) return false;
  if (t.tecla === "/" && (t.meta || t.ctrl)) return true;
  return t.tecla === "?" && !t.meta && !t.ctrl && !t.enCampo;
}
