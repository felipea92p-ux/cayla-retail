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

/** Una píldora de VARIAS opciones (Talla, Color; Felipe, 2026-10-02): nada → solo el nombre; una → «Talla: M»; dos →
 *  «Talla: M, L»; más → «Talla: M, L +2». No se corta a ciegas: los dos primeros y cuántas más. */
export function textoPildoraVarias(etiqueta: string, elegidas: readonly string[]): { etiqueta: string; valor: string | null } {
  if (elegidas.length === 0) return { etiqueta, valor: null };
  const primeras = elegidas.slice(0, 2).join(", ");
  return { etiqueta, valor: elegidas.length > 2 ? `${primeras} +${elegidas.length - 2}` : primeras };
}

/** Cómo se ve la casilla de una opción en una lista de varias que tiene jerarquía (Color: familia y tonos): `marcada` (elegida),
 *  `cubierta` (un tono dentro de una familia marcada: ya está incluido), `parcial` (una familia con algunos de sus tonos marcados, no
 *  todos) o `libre`. Una lista sin jerarquía no lo usa: la casilla sale de `valores`, como siempre. */
export type EstadoCasilla = "libre" | "marcada" | "parcial" | "cubierta";

/** Marcar o desmarcar una opción dentro de una píldora de varias. */
export function alternarEnLista(lista: readonly string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}
