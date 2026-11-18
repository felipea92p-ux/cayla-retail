/* La regla de «buscar mientras se escribe» cuando lo escrito va a la base (ERP y tienda).
 *
 * Una pantalla que busca en la URL se vuelve a pedir ENTERA en cada búsqueda: por eso se espera una pausa, y por eso una letra sola
 * no se manda (la «a» encuentra casi todo: era recargar la página sin filtrar nada). Un dígito solo sí, porque «7» es un número de orden. */

/** Cuánto se espera tras la última tecla antes de consultar. */
export const PAUSA_BUSQUEDA_MS = 350;

/** Lo que de verdad se manda a buscar: sin espacios en los bordes y `""` si todavía es una letra sola (`""` = sin búsqueda). */
export function terminoParaBuscar(texto: string, largoMaximo?: number): string {
  const limpio = texto.trim().slice(0, largoMaximo);
  return /^\p{L}$/u.test(limpio) ? "" : limpio;
}
