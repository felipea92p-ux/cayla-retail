// Lo que dice una píldora de filtro (`components/ui/FiltrosPildora.tsx`), sin React: la comparten Productos, Compras,
// Por pagar, Historial de ventas, Comprobantes y «A quién pedirle».

/** El «sin selección»: en la URL "" ya significa «sin filtro»; este valor hace de puente dentro de la lista. */
export const TODOS = "__todos__";

/** Sin valor (la opción «todos») la píldora dice solo el nombre del filtro: «Categoría». Con uno, el nombre y el valor:
 *  «Categoría: Blusas» (Felipe, 2026-10-02). Antes decía solo «Todas» y se distinguía únicamente por el ícono, y «Adidas»
 *  marca no se distinguía de «Adidas» proveedor. Una opción que ya no está en la lista (una URL vieja) se lee como «sin
 *  valor», nunca como un hueco. */
export function textoPildora(etiqueta: string, elegida: { valor: string; texto: string } | null): { etiqueta: string; valor: string | null } {
  if (!elegida || elegida.valor === TODOS) return { etiqueta, valor: null };
  return { etiqueta, valor: elegida.texto };
}
