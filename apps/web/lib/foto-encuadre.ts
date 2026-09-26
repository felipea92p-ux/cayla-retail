// Encuadre de las fotos de prenda (ADR-0220). Lógica pura, sin navegador: la usan `preparar-foto.ts` (que dibuja en un
// canvas) y sus pruebas. Sin imports de `@/`: vitest local no los resuelve.
//
// El problema que resuelve: cada foto llegaba con su tamaño, su encuadre y su fondo, y la grilla de Productos las
// recortaba a 4:5 como caían — una blusa ocupaba toda la tarjeta y la de al lado un tercio. Ahora TODA foto sale en el
// mismo lienzo (1200×1500, el 4:5 de la grilla), sobre blanco, con la prenda centrada y del mismo tamaño relativo.

/** El lienzo de toda foto de prenda: el 4:5 de las tarjetas de Productos, con resolución para verse bien en pantalla grande. */
export const LIENZO_FOTO = { ancho: 1200, alto: 1500 } as const;

/** Aire alrededor de la prenda recortada, como fracción del lienzo por lado. Con 8 % la prenda ocupa el 84 % del lado que
 *  la limita — cerca del borde sin tocarlo, igual en todas. */
export const MARGEN_PRENDA = 0.08;

/** El lado más largo del ORIGINAL que se guarda. Una foto de celular pasa de 4000 px y de los 5 MB del almacén; 2400 px
 *  sobra para volver a procesarla y entra holgado. */
export const LADO_MAX_ORIGINAL = 2400;

/** Opacidad (0–255) desde la que un píxel cuenta como prenda al buscar sus bordes. Por debajo es el halo suave del
 *  recorte: contarlo agrandaría la caja con bruma que no se ve. */
export const UMBRAL_ALFA = 32;

/** Si lo recortado ocupa menos que esto de la foto, el modelo no encontró la prenda (un botón suelto, un gancho). */
export const AREA_MINIMA_PRENDA = 0.02;

/** Qué parte de su propia caja llena una prenda de verdad. Medido el 2026-09-26 con MODNet (ADR-0220): una camisa
 *  en gancho llenó el 79 % de la caja que la encierra; los pedazos que dejó en una foto de una tienda llena de ropa,
 *  el 15 %. El umbral queda en medio, lejos de los dos. */
export const RELLENO_MINIMO_PRENDA = 0.3;

export type Caja = { x: number; y: number; ancho: number; alto: number };
/** La caja de lo visible y cuántos píxeles visibles hay adentro. */
export type Contenido = Caja & { pixeles: number };

/**
 * La caja que encierra lo que el recorte dejó visible, leyendo el canal alfa de una imagen RGBA (4 bytes por píxel).
 * `null` si no quedó nada visible.
 */
export function cajaDeContenido(rgba: ArrayLike<number>, ancho: number, alto: number, umbral = UMBRAL_ALFA): Contenido | null {
  let pixeles = 0;
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < alto; y++) {
    const fila = y * ancho * 4;
    for (let x = 0; x < ancho; x++) {
      if (rgba[fila + x * 4 + 3] > umbral) {
        pixeles++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1, pixeles };
}

/** ¿El recorte encontró UNA prenda? Tiene que ocupar algo de la foto (`AREA_MINIMA_PRENDA`) y llenar su caja
 *  (`RELLENO_MINIMO_PRENDA`): mirar solo la caja confunde unos pedazos desparramados con una prenda grande. */
export function recorteUtil(c: Contenido | null, ancho: number, alto: number): c is Contenido {
  if (!c || ancho <= 0 || alto <= 0) return false;
  return c.pixeles / (ancho * alto) >= AREA_MINIMA_PRENDA && c.pixeles / (c.ancho * c.alto) >= RELLENO_MINIMO_PRENDA;
}

/**
 * Dónde dibujar algo de `origen.ancho × origen.alto` dentro del lienzo: escalado para caber en el área útil (el lienzo
 * menos `margen` por lado), sin deformarlo, y centrado. Sirve igual para la prenda recortada (con margen) que para la
 * foto entera con su fondo (sin margen: ocupa el ancho o el alto y el resto queda en blanco).
 */
export function encuadrar(
  origen: { ancho: number; alto: number },
  lienzo: { ancho: number; alto: number } = LIENZO_FOTO,
  margen = MARGEN_PRENDA,
): Caja {
  const utilAncho = lienzo.ancho * (1 - 2 * margen);
  const utilAlto = lienzo.alto * (1 - 2 * margen);
  const escala = Math.min(utilAncho / origen.ancho, utilAlto / origen.alto);
  const ancho = Math.round(origen.ancho * escala);
  const alto = Math.round(origen.alto * escala);
  return { x: Math.round((lienzo.ancho - ancho) / 2), y: Math.round((lienzo.alto - alto) / 2), ancho, alto };
}

/** Tamaño para reducir una imagen a `ladoMax` en su lado largo, sin agrandarla nunca. */
export function reducirA(ancho: number, alto: number, ladoMax = LADO_MAX_ORIGINAL): { ancho: number; alto: number } {
  const escala = Math.min(1, ladoMax / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/**
 * Dónde vive cada foto en el bucket `retail-productos-fotos`. La foto que se muestra y su original comparten el mismo
 * id, así que desde la URL de una se llega a la otra sin una columna nueva: es lo que permite volver a procesar el
 * catálogo el día que cambie el fondo o el tamaño, sin volver a fotografiar nada.
 */
export function rutasFotoPrenda(id: string): { foto: string; original: string } {
  return { foto: `fotos/${id}.jpg`, original: `originales/${id}.jpg` };
}

/** ¿Esta URL ya es una foto encuadrada con este sistema? Las de antes viven en la raíz del bucket. */
export function esFotoEncuadrada(url: string): boolean {
  return /\/retail-productos-fotos\/fotos\/[^/]+\.jpg(\?|$)/.test(url);
}
