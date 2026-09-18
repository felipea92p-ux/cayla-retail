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
 *  pasa a «Stock bajo». Decisión de Felipe: 10 o menos — mira solo la
 *  reserva, no el piso. Bajó de 20 a 10 el 2026-09-17, probando la
 *  pantalla: con 20, casi todo el catálogo de arranque (lotes chicos de
 *  boutique) caía en «Stock bajo» de entrada — el umbral se quedó corto
 *  para distinguir "de verdad crítico" de "recién llegado, en cantidad
 *  normal". La pregunta que resuelve sigue siendo «¿a esta tienda todavía
 *  le queda de dónde sacar si el piso se vacía?», no «¿cuánto hay hoy en
 *  total?» — por eso NO suma piso.
 *
 *  Es distinto de `productos.stock_minimo` (Catálogo), que mira el total de
 *  la RED por modelo y avisa cuándo pedir al proveedor. Este mira el
 *  almacén de UNA tienda y avisa cuándo pedir un traslado. Dos preguntas
 *  distintas, dos números. */
export const UMBRAL_STOCK_BAJO_ALMACEN = 10;

/** El estado de una prenda en una tienda que separa piso de almacén, del
 *  más grave al más leve — el primero que calza gana (los ifs están en
 *  orden de severidad a propósito, no es un `switch` sin orden):
 *  · sin_stock    — no hay nada, ni en el piso ni atrás.
 *  · stock_bajo   — el ALMACÉN (la reserva) llega al umbral o menos, tenga
 *                   el piso lo que tenga. Gana sobre reponer_piso como
 *                   ETIQUETA (es la alarma más seria: hay que pedir a otra
 *                   sede) — pero NO apaga la acción local: ver
 *                   `necesitaReponerPiso` más abajo, que sigue ofreciendo
 *                   "Reponer" mientras quede algo en el almacén, aunque sea
 *                   poco. Las dos cosas son ciertas a la vez: "pide
 *                   traslado" y "mientras tanto, baja lo que quede".
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

/** Si conviene ofrecer el botón «Reponer» (bajar del almacén al piso) —
 *  independiente de qué CHIP de estado se esté mostrando. Corregido
 *  2026-09-17: hasta ahora el botón solo aparecía en el estado
 *  "reponer_piso" — pero en "Stock bajo" con algo de reserva (por poca que
 *  sea) la acción sigue teniendo sentido: pides el traslado Y bajas lo que
 *  queda, no una cosa en vez de la otra. */
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

// ============================================================================
// Umbrales de cobertura (2026-09-17, ADR-0101) — los usa `resumen-reglas.ts`
// sobre la velocidad de venta por variante y sede. Viven acá, junto a los de
// piso/almacén, para que "cuánto es poco" tenga una sola casa. Son el primer
// número razonable, NO ajustado todavía con ventas reales (a diferencia de
// los de arriba, que Felipe corrigió 3 veces probando la pantalla) — se
// espera que se toquen con los 6 meses de datos simulados.
// ============================================================================

/** Cobertura en días o menos = "se acaba en los próximos días": la variante
 *  entra a «Necesita reposición ahora», no solo a «Riesgo de quiebre». */
export const UMBRAL_COBERTURA_CRITICA_DIAS = 3;

/** Cobertura en días o menos, con demanda real detrás = riesgo de quiebre. */
export const UMBRAL_COBERTURA_RIESGO_DIAS = 7;

/** Cobertura en semanas o más = posible sobrestock (12 semanas ≈ 3 meses de
 *  venta parados en el perchero). Se expresa en semanas porque así lo lee
 *  quien decide liquidar; el cálculo lo convierte a días. */
export const UMBRAL_SOBRESTOCK_SEMANAS = 12;
export const UMBRAL_COBERTURA_SOBRESTOCK_DIAS = UMBRAL_SOBRESTOCK_SEMANAS * 7;
