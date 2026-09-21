// Lógica pura del movimiento de la lista de Comprobantes (/compras): qué filas deben deslizarse cuando la
// lista cambia (FLIP) y a qué fila salta `j`/`k`. Sin DOM ni React, para probarla con vitest y para que la
// importen el componente cliente `ComprobantesListaFilas` y sus pruebas por igual.

/** Diferencia mínima de posición (px) que vale la pena animar: menos que eso es ruido de redondeo. */
const UMBRAL_PX = 1;

/**
 * FLIP: dadas las posiciones verticales de cada fila ANTES y AHORA (por id), devuelve cuánto hay que
 * desplazarlas al inicio para que parezca que vienen de donde estaban (`dy = antes - ahora`). Las filas
 * nuevas (sin posición previa) no aparecen: no tienen de dónde venir, su aviso es la entrada escalonada.
 */
export function desplazamientos(antes: ReadonlyMap<string, number>, ahora: ReadonlyMap<string, number>): { id: string; dy: number }[] {
  const salida: { id: string; dy: number }[] = [];
  ahora.forEach((top, id) => {
    const previa = antes.get(id);
    if (previa == null) return;
    const dy = previa - top;
    if (Math.abs(dy) >= UMBRAL_PX) salida.push({ id, dy });
  });
  return salida;
}

/** Índice de la fila a la que salta `j` (`paso` = 1) o `k` (`paso` = -1). Sin fila activa (`actual` < 0) arranca en la primera. */
export function indiceSiguiente(actual: number, total: number, paso: 1 | -1): number {
  if (total <= 0) return -1;
  if (actual < 0) return 0;
  return Math.max(0, Math.min(total - 1, actual + paso));
}
