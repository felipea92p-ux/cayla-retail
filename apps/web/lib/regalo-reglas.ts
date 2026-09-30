// «Es para regalo»: una marca por prenda vendida (ADR-0288 D-7, D-101). La blusa talla S que la clienta compra para su
// hermana no es su talla: `venta_items.es_regalo` lo dice, `fn_clienta_compras` lo devuelve y `deducirTallas`
// (clienta-actividad-reglas.ts) salta esa prenda.
//
// En Cobrar (se integra con la pantalla, no antes: ADR-0234, «probado = en pantalla»), la regla es de una línea y la base
// no la necesita: la marca se ofrece SOLO con una clienta elegida en el ticket (sin ficha no hay talla que cuidar), y viaja
// en `p_items[].es_regalo` como `marcada && hay clienta`; quitar a la clienta apaga todas las marcas.

/** Cómo se lee la marca en la línea del ticket. */
export const TEXTO_REGALO = "Es para regalo";

/** Cómo se lee en la ficha, junto a la prenda comprada («1× Blusas (S) · regalo»). */
export const TEXTO_REGALO_FICHA = "regalo";

/** La prenda comprada, como la lista la ficha: «1× Blusas (S)», con « · regalo» si lo era. */
export function detallePrendaComprada(item: { cantidad: number; categoria: string | null; talla: string | null; esRegalo: boolean }): string {
  return `${item.cantidad}× ${item.categoria ?? "prenda"}${item.talla ? ` (${item.talla})` : ""}${item.esRegalo ? ` · ${TEXTO_REGALO_FICHA}` : ""}`;
}
