// Lógica pura del "en vivo" del tablero de Caja (2026-09-18) — mismo patrón que
// `caja-panel-reglas.ts`: lo que se prueba sin red ni React vive acá; el sondeo en sí
// está en `useCajaEnVivo.ts` y la detección de lo nuevo en `useNovedades.ts`.

type RespuestaSello = { data: unknown; error: unknown };

/**
 * La "huella" de la caja: el sello que devuelve `fn_sello_caja` (ADR-0191), como "3:0:1:0:0" (ventas, anuladas,
 * movimientos, devoluciones y cambios de la caja). Basta para saber si entró o se anuló algo sin traer ninguna fila.
 * `null` si la consulta falló o no trajo texto: sin dato no se decide nada (una caída de red no puede pasar por una venta).
 */
export function selloDeCaja(r: RespuestaSello): string | null {
  if (r.error || typeof r.data !== "string" || r.data === "") return null;
  return r.data;
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
