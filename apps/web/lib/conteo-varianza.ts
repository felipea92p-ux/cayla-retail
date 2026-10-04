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
 *
 * Dos cosas NO son exactitud (ADR-0328, actividad 15), y por eso quedan fuera:
 *   · el conteo de ARRANQUE de un lugar (`esArranque`): sus diferencias son errores de cuando se cargó el inventario, no del día a
 *     día; contarlo hundiría el número justo cuando la tienda empieza a ordenarse;
 *   · las líneas «sin contar» (`sinContar`, de «Aplicar todos completos»): se anotó lo que CAYLA esperaba sin mirar, así que
 *     coinciden por definición; contarlas como acierto subiría el número sin que nadie haya contado nada. Nunca traen
 *     diferencia (la base lo impide), así que se restan solo de `lineas`.
 * Los dos campos son opcionales: sin el SQL nuevo valen 0 y `false`, y la cuenta es la de siempre.
 */
export function exactitudConteos(conteos: { estado: string; lineas: number; lineasConDiferencia: number; sinContar?: number; esArranque?: boolean }[]): {
  porcentaje: number;
  lineas: number;
  correctas: number;
  conteos: number;
} | null {
  const medidas = conteos
    .filter((c) => c.estado === "cerrado" && !c.esArranque)
    .map((c) => ({ lineas: c.lineas - Math.min(c.sinContar ?? 0, c.lineas), conDiferencia: c.lineasConDiferencia }))
    .filter((c) => c.lineas > 0);
  const lineas = medidas.reduce((acc, c) => acc + c.lineas, 0);
  if (lineas === 0) return null;
  const correctas = medidas.reduce((acc, c) => acc + (c.lineas - c.conDiferencia), 0);
  return { porcentaje: Math.round((correctas / lineas) * 1000) / 10, lineas, correctas, conteos: medidas.length };
}

/**
 * Por qué no hay exactitud AUNQUE haya conteos cerrados (ADR-0328; revisión adversarial del 2026-10-04). Sin esto, justo después de
 * contar el piso entero con el conteo de arranque, Análisis decía «Último conteo: pendiente»: una cifra que no dice la verdad.
 *   · `"arranque"`: lo único cerrado con algo verificado es el conteo de arranque (corrigió el stock, pero no mide la exactitud);
 *   · `"sin_contar"`: lo cerrado se aplicó entero con «Aplicar todos completos» (nadie contó, no hay nada que medir);
 *   · `null`: hay exactitud, o no hay ningún conteo cerrado con algo verificado (entonces sí está «pendiente»).
 * El arranque manda sobre lo aplicado: es lo que de verdad pasó en la tienda (se contó todo).
 */
export function porQueSinExactitud(conteos: { estado: string; lineas: number; lineasConDiferencia: number; sinContar?: number; esArranque?: boolean }[]): "arranque" | "sin_contar" | null {
  if (exactitudConteos(conteos) !== null) return null;
  const cerrados = conteos.filter((c) => c.estado === "cerrado" && c.lineas > 0);
  if (cerrados.some((c) => c.esArranque)) return "arranque";
  if (cerrados.length > 0) return "sin_contar";
  return null;
}

/** Con qué color se lee la exactitud (Felipe, pantalla Conteo 2026-09-16):
 *  ≥ 98 % sano, ≥ 95 % a vigilar, menos = hay que contar más seguido.
 *  Vive acá para que Conteo y Resumen pinten el mismo número igual. */
export function tonoExactitud(porcentaje: number): "text-verde-profundo" | "text-ambar-profundo" | "text-rojo-profundo" {
  if (porcentaje >= 98) return "text-verde-profundo";
  if (porcentaje >= 95) return "text-ambar-profundo";
  return "text-rojo-profundo";
}
