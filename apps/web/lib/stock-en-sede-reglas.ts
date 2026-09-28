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

/** El aviso cuando se pide imprimir algo que no está en la tienda: qué pasó y qué hacer para poder imprimirla. */
export function avisoSinStock(que: string, sede: string, varias = false): { texto: string; detalle: string } {
  const donde = sede.trim() || "tu sede";
  return {
    texto: `${que} no ${varias ? "tienen" : "tiene"} stock en ${donde}`,
    detalle: "Sale una etiqueta por prenda que hay en la tienda. Cuando entre (Recibir, un traslado o Ajustar inventario), vuelve a imprimirla.",
  };
}
