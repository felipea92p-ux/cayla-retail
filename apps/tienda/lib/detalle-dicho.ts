/**
 * El detalle de una prenda dicho como frase: «Negro, talla M», «Talla M», «Negro, talla M, en Trujillo». Felipe, 2026-11-25: en la tienda
 * nunca «·» entre datos; los datos van como piezas o, si comparten una línea, en una frase con comas. Lo vacío se omite y la primera
 * letra va en mayúscula (sin color, «talla M» queda «Talla M»).
 */
export function detalleDicho(partes: readonly (string | null | undefined | false)[]): string {
  const texto = partes.filter((p): p is string => Boolean(p)).join(", ");
  return texto.charAt(0).toLocaleUpperCase("es") + texto.slice(1);
}
