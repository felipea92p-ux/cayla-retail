// La lista dicha en castellano: «a», «a y b», «a, b y c». Caso 7 de la regla «Separar sin punto» (ADR-0716, Felipe 2026-11-27).
//
// Uno de cada cinco «·» del panel salía de un `.join(" · ")`: una lista armada en el código («3 negro · 2 beige · 1 crudo»). Se
// lee como una tira, no dice que es una lista y un lector de pantalla la lee pegada (NVDA calla el «·» sin pausa). Dicha como se
// habla, «3 negro, 2 beige y 1 crudo», se entiende de una vez y suena bien en todos los lectores.
//
// Antes cada pantalla armaba su propio `new Intl.ListFormat("es", …)`: veinte copias del mismo formato. Esta es la única. Pura y sin
// React: viaja igual a CAYLA Dynamic (docs/familia/README.md, «Separar sin punto»).

/** Se arma una vez por tipo: crear un `Intl.ListFormat` cuesta, y una lista larga lo pide en cada fila. */
const FORMATO = {
  y: new Intl.ListFormat("es", { style: "long", type: "conjunction" }),
  o: new Intl.ListFormat("es", { style: "long", type: "disjunction" }),
} as const;

/** Los elementos de la lista en castellano, sin los vacíos: `listaDicha(["Ana", null, "Luis"])` → «Ana y Luis»;
 *  con `"o"`, «Ana o Luis». Una lista vacía da «». */
export function listaDicha(elementos: readonly (string | null | undefined | false)[], union: keyof typeof FORMATO = "y"): string {
  return FORMATO[union].format(elementos.filter((e): e is string => typeof e === "string" && e.trim() !== ""));
}

/** Una prenda dicha en castellano, como lo hace la tienda online («Negro, talla M»): «Blusa Emma, negro, talla M». El color va en
 *  minúscula cuando no abre la frase (es un nombre común: «azul marino»), la talla lleva su palabra y lo vacío no se dice. */
export function prendaDicha({ nombre, color, talla }: { nombre?: string | null; color?: string | null; talla?: string | null }): string {
  const limpio = (x: string | null | undefined) => (x && x.trim() ? x.trim() : null);
  const n = limpio(nombre);
  const c = limpio(color);
  const t = limpio(talla);
  const partes = [n, c && (n ? c.toLocaleLowerCase("es") : c), t && `talla ${t}`].filter((x): x is string => x !== null);
  const frase = partes.join(", ");
  return frase.charAt(0).toLocaleUpperCase("es") + frase.slice(1);
}
