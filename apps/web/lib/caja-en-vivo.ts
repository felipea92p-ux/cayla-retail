// Lógica pura del "en vivo" del tablero de Caja (2026-09-18) — mismo patrón que
// `caja-panel-reglas.ts`: lo que se prueba sin red ni React vive acá; el sondeo en sí
// está en `useCajaEnVivo.ts` y la detección de lo nuevo en `useNovedades.ts`.

type Conteo = { count: number | null; error: unknown };

/**
 * La "huella" de la caja: cuántas ventas y cuántos movimientos tiene, como "3:1". Basta para
 * saber si entró algo nuevo sin traer ninguna fila. `null` si cualquiera de las dos consultas
 * falló: sin dato no se decide nada (una caída de red no puede pasar por una venta).
 */
export function firmaDeConteos(ventas: Conteo, movimientos: Conteo): string | null {
  if (ventas.error || movimientos.error || ventas.count === null || movimientos.count === null) return null;
  return `${ventas.count}:${movimientos.count}`;
}

/**
 * Hay novedad solo si hay dos huellas válidas y son distintas. La primera medición no cuenta:
 * es la línea base (lo que ya se está viendo).
 */
export function hayNovedad(previa: string | null, actual: string | null): boolean {
  return previa !== null && actual !== null && previa !== actual;
}

/** Los elementos de `actuales` cuyo id todavía no se había visto. */
export function nuevosPorId<T>(vistos: ReadonlySet<string>, actuales: readonly T[], idDe: (x: T) => string): T[] {
  return actuales.filter((x) => !vistos.has(idDe(x)));
}
