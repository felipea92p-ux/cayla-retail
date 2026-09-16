// Reglas de Inventario sin nada de servidor: las importan los componentes
// cliente y las pruebas. Las lecturas contra Postgres viven en
// `inventario-v2.ts` (mismo reparto que compras-reglas / compras).

export type EstadoStock = "normal" | "reponer_piso" | "stock_bajo" | "sin_stock";

/** Con cuántas unidades en el piso de venta la tienda ya tiene que reponer.
 *  Decisión de Felipe (2026-09-15): «Reponer piso» aparece cuando en el piso
 *  quedan 4 unidades o menos, no recién cuando llega a 0 — a esa altura la
 *  clienta ya se fue sin su talla. Una sola constante, para que el número no
 *  viva repartido entre la etiqueta, el filtro y la tarjeta de resumen. */
export const UMBRAL_REPOSICION_PISO = 4;

/** Con cuántas unidades en TODA la tienda (piso + almacén) la prenda pasa a
 *  «Stock bajo». Decisión de Felipe (2026-09-16, al integrar sus diseños de
 *  Inventario): 6 o menos — el doble del umbral de piso. La lógica: primero
 *  se agota lo de atrás bajándolo al piso; cuando ni sumando los dos alcanza,
 *  el arreglo ya no está dentro de la tienda, hay que traer de otra sede.
 *
 *  Es distinto de `productos.stock_minimo` (Catálogo), que mira el total de
 *  la RED por modelo y avisa cuándo pedir al proveedor. Este mira UNA tienda
 *  y avisa cuándo pedir un traslado. Dos preguntas distintas, dos números. */
export const UMBRAL_STOCK_BAJO_TIENDA = 6;

/** El estado de una prenda en una tienda que separa piso de almacén, del
 *  más grave al más leve — el primero que calza gana:
 *  · sin_stock    — no hay nada, ni en el piso ni atrás.
 *  · stock_bajo   — lo que queda en toda la tienda (piso + almacén) llega al
 *                   umbral o menos. Bajar del almacén no lo arregla: hay que
 *                   pedir traslado. Gana sobre reponer_piso a propósito —
 *                   una prenda con 1 en piso y 1 atrás SÍ se puede reponer,
 *                   pero eso no es lo que la encargada necesita saber.
 *  · reponer_piso — el piso está en el umbral o por debajo Y hay en el
 *                   almacén para bajar. Si el almacén está vacío no hay qué
 *                   reponer.
 *  · normal       — todo lo demás. */
export function calcularEstado(piso: number, almacen: number): EstadoStock {
  if (piso <= 0 && almacen <= 0) return "sin_stock";
  if (piso + almacen <= UMBRAL_STOCK_BAJO_TIENDA) return "stock_bajo";
  if (piso <= UMBRAL_REPOSICION_PISO && almacen > 0) return "reponer_piso";
  return "normal";
}

/** Si conviene ofrecer «Reponer» (bajar del almacén al piso) — independiente
 *  del estado: una prenda en «Stock bajo» con algo atrás igual se puede bajar
 *  mientras llega el traslado. El estado dice el problema; esto dice si la
 *  acción local tiene sentido. */
export function necesitaReponerPiso(piso: number, almacen: number): boolean {
  return piso <= UMBRAL_REPOSICION_PISO && almacen > 0;
}

export const ETIQUETA_ESTADO_STOCK: Record<EstadoStock, string> = {
  normal: "Normal",
  reponer_piso: "Reponer piso",
  stock_bajo: "Stock bajo",
  sin_stock: "Sin stock",
};

/** Qué hacer con cada estado, en una línea — la leyenda de la tabla y el
 *  `title` del chip. */
export const ACCION_ESTADO_STOCK: Record<EstadoStock, string> = {
  normal: "Cubre piso y almacén",
  reponer_piso: "Bajar del almacén al piso",
  stock_bajo: "Pedir traslado de otra sede",
  sin_stock: "Nada en esta tienda — ver dónde hay",
};

/** Orden de urgencia para ordenar la tabla: lo que pide acción primero. */
export const ORDEN_ESTADO_STOCK: Record<EstadoStock, number> = {
  sin_stock: 0,
  stock_bajo: 1,
  reponer_piso: 2,
  normal: 3,
};
