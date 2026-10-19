// El catálogo en páginas (2026-10-19, Felipe). Antes, «Toda la tienda» se dibujaba en tandas que crecían solas (24 → 60 → 156…): con el
// scroll sin fondo nadie sabía cuánto faltaba, «atrás» volvía a medias y el pie y el Club quedaban fuera de alcance. Ahora toda lista de
// prendas —toda la tienda, la ropa, los accesorios, lo nuevo, las ofertas, los más vendidos, los favoritos— se parte en páginas de 30
// (`POR_PAGINA`: quince filas de dos en el celular, diez de tres en la computadora: filas completas), y la lista del probador de
// «Arma el tuyo», en páginas de 8 (`POR_PAGINA_PROBADOR`: dos filas de cuatro, para que todas las opciones entren en una sola vista sin
// bajar). La página va en la dirección (`?pagina=`): «atrás» vuelve a la misma página y se puede compartir. Cambiar un filtro, el orden o la
// tienda empieza de nuevo por la página 1 (el enlace de cada filtro no trae `pagina`). Lógica pura, con su prueba al lado.

/** Las tarjetas de una página del catálogo. */
export const POR_PAGINA = 30;

/** Las opciones de una página en la tira de «Arma el tuyo»: dos filas de cuatro columnas. */
export const POR_PAGINA_PROBADOR = 8;

/** Un tope para una dirección escrita a mano (`?pagina=999999`): nunca se pide una página que no cabe en un número razonable. */
const TOPE = 500;

/** Qué página pide la dirección. Sin `pagina`, con algo que no es un número o menor que 1: la primera. */
export function leerPagina(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const n = Number.parseInt(texto ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, TOPE);
}

export type Pagina = {
  /** La página que se ve (la pedida, o la última si la dirección pidió una que ya no existe). */
  pagina: number;
  /** Cuántas páginas tiene la lista (al menos 1, aunque esté vacía). */
  paginas: number;
  /** Desde qué posición (0 es la primera) y hasta cuál (sin incluir) se dibujan: `lista.slice(desde, hasta)`. */
  desde: number;
  hasta: number;
};

/** La página `pedida` de una lista de `total` elementos. Una página que ya no existe (el stock bajó, un enlace viejo) cae en la última. */
export function paginaDe(total: number, pedida: number, porPagina: number): Pagina {
  const paginas = Math.max(1, Math.ceil(Math.max(0, total) / porPagina));
  const pagina = Math.min(Math.max(1, pedida), paginas);
  const desde = (pagina - 1) * porPagina;
  return { pagina, paginas, desde, hasta: Math.min(Math.max(0, total), desde + porPagina) };
}

/** La misma dirección de la lista en otra página (lo demás se queda igual). La primera no la escribe: la dirección de siempre. */
export function conPagina(href: string, pagina: number): string {
  const [ruta, consulta = ""] = href.split("?");
  const q = new URLSearchParams(consulta);
  if (pagina > 1) q.set("pagina", String(pagina));
  else q.delete("pagina");
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}

/**
 * Los números que se dibujan en la barra de páginas: siempre la primera, la última y las que rodean a la actual, con «…» donde se salta.
 * Hasta 7 páginas salen todas; con más: `1 … 4 5 6 … 12`. Nunca se salta una sola página (un «…» que esconde un número sería peor que el número).
 */
export function numerosDePaginas(actual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const cerca = new Set([1, total, actual - 1, actual, actual + 1].filter((n) => n >= 1 && n <= total));
  // Pegada al borde, se muestra un tramo más largo para que la barra no cambie de largo al pasar de página.
  if (actual <= 3) [2, 3, 4].forEach((n) => cerca.add(n));
  if (actual >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => cerca.add(n));
  const orden = [...cerca].sort((a, b) => a - b);
  const salida: (number | "…")[] = [];
  orden.forEach((n, i) => {
    const antes = orden[i - 1];
    if (antes !== undefined && n - antes === 2) salida.push(antes + 1);
    else if (antes !== undefined && n - antes > 2) salida.push("…");
    salida.push(n);
  });
  return salida;
}
