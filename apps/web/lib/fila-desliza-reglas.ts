// Una fila de pestañas o de píldoras que se desliza de lado (celular) avisa que hay más con un degradado en el borde donde falta por ver
// (opción A de la maqueta `docs/maquetas/pestanas-que-se-deslizan-2026-10/`, elegida por Felipe el 2026-10-23; hallazgo 14 de la auditoría
// del celular). Esta es la regla pura: ¿hay más a la izquierda? ¿a la derecha? Quien la usa es `components/ui/FilasQueSeDeslizan.tsx`.

/** Lo que la fila deja a un lado y no se ve. */
export type BordesQueFaltan = { izquierda: boolean; derecha: boolean };

/**
 * `margen` (px) absorbe lo que no es contenido que falte: el aire de 4 px que la fila de píldoras se da para que el anillo de foco no se
 * recorte (`.pildoras-desliza`) y los decimales del `scrollLeft`. Una fila que se pasa de ancho por menos que eso no se desliza de verdad.
 */
export function bordesQueFaltan(scrollLeft: number, anchoVisible: number, anchoTotal: number, margen = 4): BordesQueFaltan {
  const sobra = anchoTotal - anchoVisible;
  if (!(sobra > margen)) return { izquierda: false, derecha: false };
  const x = Number.isFinite(scrollLeft) ? scrollLeft : 0;
  return { izquierda: x > margen, derecha: x < sobra - margen };
}
