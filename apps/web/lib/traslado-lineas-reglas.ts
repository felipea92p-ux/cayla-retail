// Reglas de «Nuevo traslado» (`MoverMercaderiaFormV2.tsx`) sobre la MISMA prenda en varias líneas.
//
// Una prenda viaja una sola vez por traslado: `transferencia_items` tiene `unique (transferencia_id, variante_id)`
// (`transferencia_items_transferencia_id_variante_id_key`), y `iniciar_traslado` inserta línea por línea. Con la misma
// prenda en dos líneas, la segunda chocaba contra esa restricción y la persona leía un error de Postgres. Esta pieza lo
// resuelve en dos tiempos: el combo no deja elegir una prenda que ya está en otra línea (`prendasNoDisponibles`) y, si
// aun así dos líneas llegaran con la misma, se suman antes de mandar (`juntarPorPrenda`).
//
// Solo lógica pura, sin React ni red: el formulario la llama.

/** Una línea del formulario. `cantidad` es texto porque se escribe a mano (ver `Linea` en el formulario). */
export type LineaTraslado = { varianteId: string; cantidad: string };

/**
 * Las prendas que la línea `i` NO puede elegir: las que ya están en otra línea. Las líneas sin prenda no cuentan, y la
 * propia línea conserva la suya aunque otra la repita (un valor ya elegido nunca se le quita a quien lo tiene).
 */
export function prendasNoDisponibles(lineas: readonly LineaTraslado[], i: number): Set<string> {
  const enOtras = new Set<string>();
  lineas.forEach((l, n) => {
    if (n !== i && l.varianteId) enOtras.add(l.varianteId);
  });
  const propia = lineas[i]?.varianteId;
  if (propia) enOtras.delete(propia);
  return enOtras;
}

/**
 * Una fila por prenda, con las cantidades de sus líneas sumadas, en el orden en que cada prenda aparece por primera
 * vez. Es lo que se manda a `iniciar_traslado` (`p_items`): nunca dos veces la misma `variante_id`. El total de
 * unidades no cambia.
 */
export function juntarPorPrenda(lineas: readonly { varianteId: string; cantidadNum: number }[]): { variante_id: string; cantidad: number }[] {
  const porPrenda = new Map<string, number>();
  for (const l of lineas) porPrenda.set(l.varianteId, (porPrenda.get(l.varianteId) ?? 0) + l.cantidadNum);
  return [...porPrenda].map(([variante_id, cantidad]) => ({ variante_id, cantidad }));
}
