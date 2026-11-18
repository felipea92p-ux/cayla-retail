// ¿La página que se está dibujando es la copia que guardó el router?
//
// POR QUÉ EXISTE (medido en local el 2026-11-11). Al volver con «atrás» Next no le pregunta al servidor: dibuja la página que guardó, con los
// datos de cuando se leyó, tenga 5 segundos o 20 minutos (y por un enlace, antes de los 30 s de `staleTimes`). Una pantalla que se guarda sola
// sin `router.refresh()` volvía entonces con números viejos bajo el dedo, y el siguiente toque guardaba encima de ellos: Recibir ▸ Contar
// (ADR-0393 act. 2026-11-11) y recibir un traslado. El Conteo de inventario ya lo resolvía a su manera (`ContarConteo`, en `sessionStorage`).
//
// CÓMO. El servidor le pone a cada carga un identificador nuevo (`idDeCarga`, en la página). La pantalla lo anota al dibujarlo
// (`anotarCarga`, en un efecto): si ya estaba, es una copia y se pide la página de nuevo, sin loader. `cargaVistaEn` dice desde cuándo la vio
// esta pestaña, para poner encima lo que la pestaña guardó DESPUÉS (lo que la copia no puede traer). Las marcas son un contador de la
// pestaña: solo se comparan entre sí, no dependen del reloj del aparato.
//
// CONTRATO
//   PROMETE: que la primera vez que una pestaña dibuja una carga no es una copia y la segunda sí; que una carga vista guarda la marca de su
//            primera vez; y que las marcas solo suben.
//   ASUME: que `anotarCarga` se llama en un efecto, una vez por carga dibujada (en el render, el modo estricto la anotaría dos veces), y que
//          `idDeCarga` corre en el servidor en cada lectura.
//   NO HACE: no sobrevive a una recarga (tampoco la copia del router: llega una página nueva) ni se comparte entre pestañas.

let marca = 0;
const cargas = new Map<string, number>();

/** Un texto distinto por cada vez que el servidor arma una página. Solo se compara por igualdad: no es una hora ni se lee. */
export function idDeCarga(): string {
  return Date.now().toString(36);
}

/** Una marca de esta pestaña, mayor que todas las anteriores. */
export function marcaDeLaPestana(): number {
  marca += 1;
  return marca;
}

/** Anota que esta pestaña dibujó la carga. Devuelve si ya la había dibujado: entonces lo que se ve es una copia guardada por el router. */
export function anotarCarga(ambito: string, carga: string): boolean {
  const clave = `${ambito}:${carga}`;
  if (cargas.has(clave)) return true;
  cargas.set(clave, marcaDeLaPestana());
  return false;
}

/** Desde cuándo vio esta pestaña esa carga; `null` si es la primera vez que llega (una página nueva). No anota nada. */
export function cargaVistaEn(ambito: string, carga: string): number | null {
  return cargas.get(`${ambito}:${carga}`) ?? null;
}
