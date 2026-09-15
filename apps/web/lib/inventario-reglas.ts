// Reglas de Inventario sin nada de servidor: las importan los componentes
// cliente y las pruebas. Las lecturas contra Postgres viven en
// `inventario-v2.ts` (mismo reparto que compras-reglas / compras).

export type EstadoStock = "normal" | "reponer_piso" | "sin_stock";

/** Con cuántas unidades en el piso de venta la tienda ya tiene que reponer.
 *  Decisión de Felipe (2026-09-15): «Reponer piso» aparece cuando en el piso
 *  quedan 4 unidades o menos, no recién cuando llega a 0 — a esa altura la
 *  clienta ya se fue sin su talla. Una sola constante, para que el número no
 *  viva repartido entre la etiqueta, el filtro y la tarjeta de resumen. */
export const UMBRAL_REPOSICION_PISO = 4;

/** El estado de una prenda en una tienda que separa piso de almacén:
 *  · sin_stock    — no hay nada, ni en el piso ni atrás.
 *  · reponer_piso — el piso está en el umbral o por debajo Y hay en el
 *                   almacén para bajar. Si el almacén está vacío no hay qué
 *                   reponer: es «normal» con poco, no una acción pendiente.
 *  · normal       — todo lo demás. */
export function calcularEstado(piso: number, almacen: number): EstadoStock {
  if (piso <= 0 && almacen <= 0) return "sin_stock";
  if (piso <= UMBRAL_REPOSICION_PISO && almacen > 0) return "reponer_piso";
  return "normal";
}
