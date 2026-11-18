// La casilla de Configuración ▸ Tiendas (ADR-0195 F1, con el vidrio «Serena» de ADR-0596): cada número se guarda SOLO al salir de ella
// si cambió, y al guardarse dibuja un ✓ verde junto al número que se va solo (cara «A · Visto en la celda», elegida por Felipe el
// 2026-11-02 en docs/maquetas/configuracion-vidrio-2026-11/). Aquí, la lógica pura que comparten las tres casillas de la pestaña.

/** Cuánto vive el ✓ de «se guardó» junto al número. Es la misma duración que su animación en
 *  `app/estilos/vidrio/campos-y-botones.css` (`.cfg-casilla-visto`): la prueba exige que coincidan, o el ✓ se cortaría a medias
 *  (o se quedaría quieto, ya dibujado, esperando que React lo saque). */
export const VISTO_MS = 1600;

/** ¿La casilla cambió? Sin los espacios de los bordes: tocar la casilla y salir sin escribir, o dejarle un espacio al final, no
 *  guarda nada (ni dibuja el ✓). */
export function cambioLaCasilla(escrito: string, guardado: string): boolean {
  return escrito.trim() !== guardado.trim();
}
