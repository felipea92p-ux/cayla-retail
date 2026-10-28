/* ====================================================================
   Los íconos — la regla de todo el ERP (ADR-0358, ronda 15, Felipe eligió P1 el 2026-10-15)

   Todos son de lucide-react, con el grosor de fábrica (2): no se le pasa `strokeWidth`. El tamaño lo pone el lugar:
   · 12 px dentro de una insignia o una etiqueta chica (`h-3 w-3`);
   · 14 px junto a un texto: una fila, una nota, un menú (`h-3.5 w-3.5`);
   · 16 px en un botón, un campo, una pestaña o una tecla de 32 px (`h-4 w-4`);
   · 20 px junto al título de un bloque, en una tecla grande (40 px o más) o en una tarjeta de opción (`h-5 w-5`).
   Dos casos con su `unificar-fijo:`: la MARCA (✓ − ‖ ✕ sobre un punto lleno, como la casilla) lleva trazo 3, y un ícono GRANDE (24 px
   o más, un dibujo) lleva 1,5, como el de un vacío. Las piezas con su dibujo (vacío, aviso, buscador, los sellos de Movimientos, los
   pases de Traslados, el Observatorio, Análisis, la vista rápida) traen el suyo. Registro: docs/unificar/icono.md.
   ==================================================================== */

/** La escala, en px. La usan las piezas que dibujan su ícono (`BotonDeshacer`, `BotonBuscar`) y `lib/unificar.test.ts` la cruza con las
 *  firmas de `icono` (unificar/familias.mjs): un tamaño de aquí nunca es deuda. */
export const TAMANOS_ICONO = { insignia: 12, texto: 14, control: 16, grande: 20 } as const;
