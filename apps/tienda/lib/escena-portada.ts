// La escena de la portada (ADR-0615): tres prendas sobre sus pedestales. Lógica pura: qué tan grande va cada una y cuál va al centro.

/** Cuánto del alto disponible puede ocupar una prenda, según su categoría: un pantalón largo no puede dominar sobre un top. */
const TOPE: Record<string, number> = {
  Pantalones: 0.76,
  Jeans: 0.76,
  Vestidos: 0.86,
  Conjuntos: 0.86,
  Enterizos: 0.86,
  Faldas: 0.56,
  Shorts: 0.5,
  Polos: 0.7,
  Tops: 0.68,
  Bodys: 0.68,
};
const TOPE_DE_FABRICA = 0.74;
const ESCALA_MINIMA = 0.44;
/** Para que todas pesen parecido: cuanto más angosta es la foto, más alto puede ir (área visual pareja). */
const AREA = 0.62;

export const topeDeCategoria = (categoria: string | null): number => (categoria ? TOPE[categoria] : undefined) ?? TOPE_DE_FABRICA;

/** La escala de una prenda según su categoría y la forma de su foto (ancho ÷ alto). Nunca deforma: solo cambia el tamaño del lugar. */
export function escalaDePrenda(categoria: string | null, forma: number): number {
  if (!(forma > 0)) return topeDeCategoria(categoria);
  return Math.max(ESCALA_MINIMA, Math.min(topeDeCategoria(categoria), AREA / Math.sqrt(forma)));
}

/** La más chica va al centro, sobre el pedestal alto: las tres quedan en una línea que sube al medio y baja a los lados. */
export function ordenDeLaEscena<T extends { categoria: string | null }>(prendas: readonly T[]): T[] {
  const orden = [...prendas].sort((a, b) => topeDeCategoria(a.categoria) - topeDeCategoria(b.categoria));
  if (orden.length < 3) return orden;
  return [orden[1], orden[0], ...orden.slice(2)];
}
