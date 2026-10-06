// Análisis v4 (ADR-0357, decisión 2, act. 2026-10-06): ver Análisis «con los datos de hoy» mientras la tienda todavía no cumple las tres
// condiciones del motor (ADR-0346). Felipe lo pidió al ver producción: ninguna tienda cumple y la pantalla solo decía «Todavía no».
// «Todavía no» sigue siendo lo primero; esto es un botón explícito, y mientras se mira, un aviso fijo dice que las cifras pueden fallar.

/** El parámetro de la URL que lo deja encendido (`?datos=hoy`): se puede volver a la misma vista al recargar o compartir el enlace. */
export const PARAM_DATOS_DE_HOY = "datos";
export const VALOR_DATOS_DE_HOY = "hoy";

/** Si la URL pide ver con los datos de hoy. */
export function leerDatosDeHoy(v: string | string[] | undefined | null): boolean {
  const x = Array.isArray(v) ? v[0] : v;
  return x === VALOR_DATOS_DE_HOY;
}

/**
 * El aviso fijo, en una línea: cuántas ventas tienen su prenda (lo que Análisis puede contar) y que las cifras pueden fallar. Con la
 * parte de 0 a 1 (`identificada14` del motor: los últimos 14 días cerrados); sin ventas en esos días, lo dice así.
 */
export function avisoDatosDeHoy(identificada: number | null): string {
  if (identificada === null) return "No hubo ventas en los últimos 14 días para medirlo: estas cifras pueden fallar.";
  const de100 = Math.max(0, Math.min(100, Math.floor(identificada * 100)));
  return `Solo ${de100} de cada 100 ventas tienen su prenda: estas cifras pueden fallar.`;
}
