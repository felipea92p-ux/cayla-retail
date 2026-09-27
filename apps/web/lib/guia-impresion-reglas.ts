/**
 * Guía de impresión de etiquetas (ADR-0180, «Guía de impresión» 2026-09-26). Lógica pura: qué sistema tiene la
 * computadora, para abrir la guía directo en la pestaña que le toca, y las medidas que la guía repite en cada paso.
 *
 * Por qué existe: la nota vieja al pie de Etiquetas de precio estaba escrita para Mac, mezclaba la impresora con reglas de
 * campañas y en Windows decía lo contrario de lo que funcionó (Felipe, 2026-09-26). Un equipo nuevo en tienda repetía la
 * prueba y error. Las medidas viven aquí una sola vez: si mañana cambia el rollo, cambia la guía entera.
 */

export type Sistema = "windows" | "mac";

/** El rollo DK-22205 y el corte de la plantilla P-touch (los mismos números que `globals.css`, `@page etiqueta-precio`). */
export const MEDIDAS = {
  anchoRollo: "62",
  largoCorte: "40.1",
  /** En los textos va con coma decimal; en los campos del driver de la Brother se escribe con punto (`largoCorte`). */
  largoCorteTexto: "40,1",
  escala: "100",
} as const;

/**
 * Windows o Mac a partir de lo que el navegador dice de sí mismo. Cualquier otra cosa (Linux, un teléfono, el servidor)
 * cae en Windows: es lo que tienen las computadoras de las sedes, y la guía siempre deja cambiar de pestaña.
 */
export function sistemaDelEquipo(userAgent: string | undefined | null, plataforma?: string | null): Sistema {
  const texto = `${plataforma ?? ""} ${userAgent ?? ""}`.toLowerCase();
  // iPhone/iPad también dicen «like Mac OS X», pero desde ahí no se imprime a la Brother con esta guía.
  if (/iphone|ipad|android/.test(texto)) return "windows";
  return /mac/.test(texto) ? "mac" : "windows";
}
