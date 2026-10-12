/**
 * La parte VISUAL de la propuesta del mix (ADR-0329): el color de cada grupo, las cifras como se escriben en Perú y la escala de la mancuerna.
 * Lógica pura y sin React, para probar sin pintar nada: lo que se ve en pantalla no puede decir otra cosa que lo que dicen las cifras.
 * (El riel de perchas —cuántas perchas, qué frases— vive en `lib/plan-piso-percha.ts`; los ganchos de canvas y las barras de ADR-0352 (b) ya no existen.)
 */

/**
 * El color de un grupo del plan del piso, para barras (Historia), íconos y cuadritos: sale de su posición en la lista del riel y vive en UN solo lugar,
 * `app/estilos/plan-piso.css` (`--grupo-0` … `--grupo-5`, solo tokens, con su versión oscura). Con más de seis grupos los colores se repiten; el rojo
 * (acento sagrado, máx. 2 por pantalla) nunca pinta un grupo.
 */
export const colorDeGrupo = (indice: number): string => `var(--grupo-${((indice % 6) + 6) % 6})`;

/** Una cifra como se escribe en Perú: coma de miles y punto decimal («1,800», «4.5»); la misma convención de `resumen-formato.ts`. */
export const cifraEs = (x: number): string => x.toLocaleString("es-PE", { maximumFractionDigits: 1 });

/** Un porcentaje como se lee en la pantalla: «4 %», con espacio duro para que la cifra y el signo no se partan en dos renglones. */
export const pctEs = (x: number): string => `${cifraEs(x)}\u00a0%`;

/** «1 prenda», «30 prendas»: la palabra concuerda con la cifra. */
export const prendasEs = (x: number): string => `${cifraEs(x)} ${x === 1 ? "prenda" : "prendas"}`;

/** El máximo del eje de la mancuerna: el mayor valor redondeado hacia arriba a un múltiplo de 10, entre 20 y 100. Sin valores, 20. */
export function escalaDeMancuerna(valores: readonly (number | null | undefined)[]): number {
  const mayor = valores.reduce<number>((m, v) => (typeof v === "number" && Number.isFinite(v) && v > m ? v : m), 0);
  return Math.min(100, Math.max(20, Math.ceil(mayor / 10) * 10));
}

/** La posición de un valor en el eje, de 0 a 100 %. Lo que se sale del eje queda en el borde, no fuera de la tarjeta. */
export function posicionEnEscala(valor: number, maximo: number): number {
  if (!(maximo > 0) || !Number.isFinite(valor)) return 0;
  return Math.min(100, Math.max(0, (valor / maximo) * 100));
}
