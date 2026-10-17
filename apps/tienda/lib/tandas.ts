// El catálogo en tandas (2026-10-17). «Toda la tienda» dibujaba TODAS las prendas de una vez: con 60 prendas la página ya pesaba 484 KB
// de HTML (unos 8 KB por tarjeta: foto, corazón, «Agregar» y sus datos) y con las 298 de producción se acercaba a 2,4 MB que el celular
// tenía que bajar, leer y activar antes de responder al dedo. Ahora la lista empieza con las primeras 24 y la siguiente tanda se pide
// sola antes de que el cliente llegue al final (`components/MasPrendas.tsx`). Cada tanda crece (24 → 60 → 156 → …): para llegar al
// final de 298 prendas bastan tres pedidos. Cuántas se ven va en la dirección (`?mostrar=`), así «atrás» vuelve al mismo lugar con
// las mismas tarjetas, y cambiar un filtro empieza de nuevo por la primera tanda. Lógica pura, con su prueba al lado.

/** Las tarjetas que se dibujan al entrar a una lista: tres o cuatro filas en la computadora, una docena de filas en el celular. */
export const PRIMERA_TANDA = 24;

/** Un tope para una dirección escrita a mano (`?mostrar=999999`): nunca se arma una página más grande que esto. */
const TOPE = 2000;

/** Cuántas tarjetas pide la dirección. Sin `mostrar`, con algo que no es un número o con menos que la primera tanda: la primera tanda. */
export function leerMostrar(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const n = Number.parseInt(texto ?? "", 10);
  if (!Number.isFinite(n) || n <= PRIMERA_TANDA) return PRIMERA_TANDA;
  return Math.min(n, TOPE);
}

/** La tanda siguiente crece dos veces y media, en múltiplos de 12 (cabe justo en 2, 3 y 4 columnas): 24 → 60 → 156 → 396. */
export function siguienteTanda(mostrar: number): number {
  return Math.ceil((mostrar * 2.5) / 12) * 12;
}

export type Tanda = {
  /** Cuántas tarjetas se dibujan ahora. */
  visibles: number;
  /** Cuántas quedan sin dibujar. */
  quedan: number;
  /** El `mostrar` de la tanda que sigue; `null` si ya se ven todas. */
  siguiente: number | null;
  /** Cuántas llegan con la tanda que sigue. */
  cuantasMas: number;
};

export function tandaDe(total: number, mostrar: number): Tanda {
  const visibles = Math.min(Math.max(0, total), mostrar);
  const quedan = Math.max(0, total - visibles);
  const siguiente = quedan > 0 ? Math.min(siguienteTanda(mostrar), total) : null;
  return { visibles, quedan, siguiente, cuantasMas: siguiente === null ? 0 : siguiente - visibles };
}

/** La misma dirección de la lista con otro `mostrar` (lo demás se queda igual). La primera tanda no lo escribe: la dirección de siempre. */
export function conMostrar(href: string, mostrar: number): string {
  const [ruta, consulta = ""] = href.split("?");
  const q = new URLSearchParams(consulta);
  if (mostrar > PRIMERA_TANDA) q.set("mostrar", String(mostrar));
  else q.delete("mostrar");
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}
