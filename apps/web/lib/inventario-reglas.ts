// Reglas de Inventario sin nada de servidor: las importan los componentes
// cliente y las pruebas. Las lecturas contra Postgres viven en
// `inventario-v2.ts` (mismo reparto que compras-reglas / compras).

export type EstadoStock = "normal" | "reponer_piso" | "stock_bajo" | "sin_stock";

/** Con cuántas unidades en el piso de venta la tienda ya tiene que reponer.
 *  Decisión de Felipe: «Reponer piso» aparece cuando en el piso quedan 7
 *  unidades o menos, no recién cuando llega a 0 — a esa altura la clienta ya
 *  se fue sin su talla. Subido de 4 a 7 el 2026-09-16, probando la pantalla
 *  con datos reales: con 4 el aviso llegaba demasiado tarde para alcanzar a
 *  reponer antes de que se notara en el piso. Una sola constante, para que
 *  el número no viva repartido entre la etiqueta, el filtro y la tarjeta de
 *  resumen. */
export const UMBRAL_REPOSICION_PISO = 7;

/** Con cuántas unidades en el ALMACÉN de la tienda (no el total) la prenda
 *  pasa a «Stock bajo». Decisión de Felipe (2026-09-16, corrigiendo el
 *  primer diseño): 20 o menos — mira solo la reserva, no el piso. La
 *  pregunta que resuelve es «¿a esta tienda todavía le queda de dónde sacar
 *  si el piso se vacía?», no «¿cuánto hay hoy en total?» — por eso NO suma
 *  piso: una prenda con el piso lleno y el almacén en 15 igual necesita
 *  pedido, porque cuando el piso se agote no habrá con qué reponerlo.
 *
 *  Es distinto de `productos.stock_minimo` (Catálogo), que mira el total de
 *  la RED por modelo y avisa cuándo pedir al proveedor. Este mira el
 *  almacén de UNA tienda y avisa cuándo pedir un traslado. Dos preguntas
 *  distintas, dos números. */
export const UMBRAL_STOCK_BAJO_ALMACEN = 20;

/** El estado de una prenda en una tienda que separa piso de almacén, del
 *  más grave al más leve — el primero que calza gana (los ifs están en
 *  orden de severidad a propósito, no es un `switch` sin orden):
 *  · sin_stock    — no hay nada, ni en el piso ni atrás.
 *  · stock_bajo   — el ALMACÉN (la reserva) llega al umbral o menos, tenga
 *                   el piso lo que tenga. Gana sobre reponer_piso a
 *                   propósito — si la reserva ya está baja, mover del
 *                   almacén al piso es un parche de días, no la solución;
 *                   lo que hace falta es pedir a otra sede.
 *  · reponer_piso — el piso está en el umbral o por debajo, Y el almacén
 *                   TODAVÍA tiene una reserva sana (por encima del umbral
 *                   de stock bajo) para cubrirlo. Acción local, sin pedir
 *                   nada a nadie.
 *  · normal       — todo lo demás: piso y almacén cubiertos. */
export function calcularEstado(piso: number, almacen: number): EstadoStock {
  if (piso <= 0 && almacen <= 0) return "sin_stock";
  if (almacen <= UMBRAL_STOCK_BAJO_ALMACEN) return "stock_bajo";
  if (piso <= UMBRAL_REPOSICION_PISO) return "reponer_piso";
  return "normal";
}

export const ETIQUETA_ESTADO_STOCK: Record<EstadoStock, string> = {
  normal: "Normal",
  reponer_piso: "Reponer piso",
  stock_bajo: "Stock bajo",
  sin_stock: "Sin stock",
};

/** Qué hacer con cada estado, en una línea — la leyenda de la tabla y el
 *  `title` del chip (y del propio «Normal», que no lleva chip pero sí
 *  tooltip). */
export const ACCION_ESTADO_STOCK: Record<EstadoStock, string> = {
  normal: "Cubre piso y almacén, todo correcto",
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
