/**
 * La exactitud del inventario que mide Análisis, sin red.
 *
 * Antes este archivo también valorizaba la diferencia del cierre en soles (`resumirVarianza`). Con el rediseño de
 * Conteo (2026-09-29) el conteo dejó de hablar de plata: compara lo que CAYLA dice que hay con lo que se encuentra, en
 * unidades, y nada más. Lo que queda es lo que Análisis y el banner del resumen leen: `exactitudConteos` y su color.
 * No se importa nada del servidor, así que se prueba sin montar Supabase.
 */

/**
 * Exactitud de inventario sobre los conteos CERRADOS: de cada 100 líneas verificadas, cuántas coincidieron con el
 * sistema. Es lo que en un inventario se llama IRA (inventory record accuracy). Null si no hay ninguna línea cerrada —
 * «sin dato» no se disfraza de 100 %.
 *
 * `lineas` son solo las líneas VERIFICADAS (`fn_conteos_resumen` no cuenta las pendientes): un conteo cerrado parcial
 * mide lo que verificó y no infla el porcentaje con lo que dejó sin ver. Un anulado no es «cerrado» y un cerrado sin
 * ninguna verificada (los vacíos de antes del rediseño) tiene 0 líneas: ninguno cuenta.
 *
 * Se mide por líneas y no por unidades a propósito: una línea con 1 unidad de más y otra con 1 de menos NO se
 * cancelan — son dos registros que estaban mal.
 */
export function exactitudConteos(conteos: { estado: string; lineas: number; lineasConDiferencia: number }[]): {
  porcentaje: number;
  lineas: number;
  correctas: number;
  conteos: number;
} | null {
  const cerrados = conteos.filter((c) => c.estado === "cerrado" && c.lineas > 0);
  const lineas = cerrados.reduce((acc, c) => acc + c.lineas, 0);
  if (lineas === 0) return null;
  const correctas = cerrados.reduce((acc, c) => acc + (c.lineas - c.lineasConDiferencia), 0);
  return { porcentaje: Math.round((correctas / lineas) * 1000) / 10, lineas, correctas, conteos: cerrados.length };
}

/** Con qué color se lee la exactitud (Felipe, pantalla Conteo 2026-09-16):
 *  ≥ 98 % sano, ≥ 95 % a vigilar, menos = hay que contar más seguido.
 *  Vive acá para que Conteo y Resumen pinten el mismo número igual. */
export function tonoExactitud(porcentaje: number): "text-verde-profundo" | "text-ambar-profundo" | "text-rojo-profundo" {
  if (porcentaje >= 98) return "text-verde-profundo";
  if (porcentaje >= 95) return "text-ambar-profundo";
  return "text-rojo-profundo";
}
