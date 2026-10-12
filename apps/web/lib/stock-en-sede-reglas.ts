// Stock de un modelo EN LA SEDE de quien mira, para la ficha de variantes de Productos ▸ Tabla y para no abrir
// Etiquetas de precio cuando no hay nada que imprimir. Lógica pura; la lectura vive en `components/useStockEnSede.ts`.
//
// Por qué la sede y no el total de la red: la etiqueta sale UNA POR PRENDA EN LA TIENDA (`lib/etiquetas-precio.ts`,
// `stockEnTienda`). Una talla con 12 en Arequipa y 0 aquí no tiene nada que imprimir aquí. Si la ficha mostrara el
// total, diría «12» y el botón de imprimir se negaría: el número y el botón se contradirían.

/** Unidades en la sede de esas prendas (variantes). Una prenda sin fila de stock tiene 0: `stock` solo guarda lo que hay. */
export function unidadesEnSede(stock: ReadonlyMap<string, number>, varianteIds: readonly string[]): number {
  return varianteIds.reduce((total, id) => total + Math.max(0, stock.get(id) ?? 0), 0);
}

/**
 * DÓNDE está cada unidad dentro de la sede (Felipe 2026-10-12: «no sé si esa cantidad es del almacén o la tienda»). `stock` guarda una
 * fila por prenda y sububicación (ADR-0044): colgada en el piso (`piso_venta`), guardada en el almacén (`almacen_tienda`), dañada en
 * cuarentena (`cuarentena`) o sin sububicación (el Taller, o una fila vieja de antes de separar). Las cuatro partes suman EXACTAMENTE lo
 * que `sumarEntradas` cuenta con las mismas filas: el «Todo» de la ficha no cambia; solo se reparte.
 */
export type LugaresDeVariante = { piso: number; almacen: number; danadas: number; sinLugar: number };
export type FilaStockConLugar = { variante_id: string; cantidad: number; sububicacion: { tipo: string | null } | null };

export function lugaresEnSede(filas: readonly FilaStockConLugar[]): Map<string, LugaresDeVariante> {
  const porVariante = new Map<string, LugaresDeVariante>();
  for (const f of filas) {
    const l = porVariante.get(f.variante_id) ?? { piso: 0, almacen: 0, danadas: 0, sinLugar: 0 };
    const tipo = f.sububicacion?.tipo;
    if (tipo === "piso_venta") l.piso += f.cantidad;
    else if (tipo === "almacen_tienda") l.almacen += f.cantidad;
    else if (tipo === "cuarentena") l.danadas += f.cantidad;
    else l.sinLugar += f.cantidad;
    porVariante.set(f.variante_id, l);
  }
  return porVariante;
}

/** El aviso cuando se pide imprimir algo que no está en la tienda: qué pasó y qué hacer para poder imprimirla. */
export function avisoSinStock(que: string, sede: string, varias = false): { texto: string; detalle: string } {
  const donde = sede.trim() || "tu sede";
  return {
    texto: `${que} no ${varias ? "tienen" : "tiene"} stock en ${donde}`,
    detalle: "Sale una etiqueta por prenda que hay en la tienda. Cuando entre (Recibir, un traslado o Ajustar inventario), vuelve a imprimirla.",
  };
}
