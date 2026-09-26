// Encuadre de las fotos de prenda (ADR-0228). Lógica pura, sin navegador: la usan `preparar-foto.ts` (que dibuja en un
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

/** Qué parte de su propia caja llena una prenda de verdad. Medido el 2026-09-26 con MODNet (ADR-0228): una camisa
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

/** Qué tan grande tiene que ser una pieza del recorte, comparada con la más grande, para seguir siendo prenda. Un
 *  conjunto de dos prendas separadas se conserva entero; una mancha, un resto de gancho o un borde de otra prenda al
 *  costado —lo que dejó MODNet en la «Blusa V» del 2026-09-26— queda muy por debajo y se borra. */
export const FRACCION_MINIMA_PIEZA = 0.15;

/**
 * Deja en el recorte solo la prenda: busca las piezas visibles que no se tocan entre sí y borra (alfa 0) las que son
 * mucho más chicas que la mayor. Modifica `rgba` en el lugar y devuelve cuántos píxeles borró. Los píxeles casi
 * transparentes (el halo del borde, por debajo de `umbral`) no cuentan como pieza ni se tocan.
 */
export function soloLaPrenda(
  rgba: Uint8ClampedArray,
  ancho: number,
  alto: number,
  umbral = UMBRAL_ALFA,
  fraccionMinima = FRACCION_MINIMA_PIEZA,
): number {
  const total = ancho * alto;
  const pieza = new Int32Array(total); // 0 = sin pieza; 1..n = número de pieza
  const tamanos: number[] = [0];
  const cola = new Int32Array(total);
  for (let inicio = 0; inicio < total; inicio++) {
    if (pieza[inicio] !== 0 || rgba[inicio * 4 + 3] <= umbral) continue;
    const n = tamanos.length;
    let tam = 0;
    let lee = 0;
    let escribe = 0;
    cola[escribe++] = inicio;
    pieza[inicio] = n;
    while (lee < escribe) {
      const i = cola[lee++];
      tam++;
      const x = i % ancho;
      // Vecinos de los cuatro lados: una diagonal sola no une dos piezas (así un hilo de un píxel no pega una mancha
      // a la prenda). Sin arreglos intermedios: una foto de celular son millones de píxeles.
      for (let k = 0; k < 4; k++) {
        const v = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x < ancho - 1 ? i + 1 : -1) : k === 2 ? i - ancho : i + ancho;
        if (v < 0 || v >= total || pieza[v] !== 0 || rgba[v * 4 + 3] <= umbral) continue;
        pieza[v] = n;
        cola[escribe++] = v;
      }
    }
    tamanos.push(tam);
  }
  if (tamanos.length <= 2) return 0; // ninguna o una sola pieza: nada que borrar
  let mayor = 0;
  for (const t of tamanos) if (t > mayor) mayor = t; // no Math.max(...): con miles de manchas revienta la pila
  let borrados = 0;
  for (let i = 0; i < total; i++) {
    const n = pieza[i];
    if (n !== 0 && tamanos[n] < mayor * fraccionMinima) {
      rgba[i * 4 + 3] = 0;
      borrados++;
    }
  }
  return borrados;
}

/** Desde qué opacidad (0–255) un píxel del recorte cuenta como tela al buscar huecos. Más alto que `UMBRAL_ALFA` a
 *  propósito: una zona que el recortador dejó medio transparente es tela «lavada» —se ve como un manchón blanco sobre la
 *  prenda— y para la pregunta «¿quedó agujereada?» cuenta como hueco. */
export const ALFA_TELA = 128;

/** Desde qué fracción de huecos el recorte se considera agujereado y la revisión sugiere «Con fondo». Medido el
 *  2026-09-26 con seis fotos por el proceso real: las limpias dieron 0,00 % y 0,07 %; las que el recortador agujereó
 *  (jean Levi's, pantalón de museo, ropa interior, camisa en gancho) entre 1,38 % y 1,86 %. 0,5 % queda lejos de las dos.
 *  Si una prenda de verdad tiene un hueco cerrado (un asa, un escote con tira), solo cambia la SUGERENCIA: quien sube la
 *  foto puede elegir «Sin fondo» igual. */
export const HUECOS_MAXIMOS = 0.005;

/** ¿El recorte quedó agujereado? (ver `HUECOS_MAXIMOS`) */
export function recorteAgujereado(huecos: number | null): boolean {
  return huecos !== null && huecos > HUECOS_MAXIMOS;
}

/**
 * Qué parte de la prenda quedó agujereada: los píxeles transparentes ENCERRADOS dentro de la caja —los que no se pueden
 * alcanzar desde el borde de la caja pasando solo por transparencia— sobre el total (tela + huecos). El espacio entre
 * las piernas de un pantalón o bajo una manga llega al borde, así que no cuenta: solo cuentan los manchones que el
 * recortador abrió en medio de la tela (ADR-0228, «control de huecos»). 0 si no hay caja o no hay tela.
 */
export function fraccionDeHuecos(rgba: ArrayLike<number>, ancho: number, caja: Caja, alfaTela = ALFA_TELA): number {
  const { x: x0, y: y0, ancho: w, alto: h } = caja;
  const total = w * h;
  if (total === 0) return 0;
  const esTela = (cx: number, cy: number) => rgba[((y0 + cy) * ancho + (x0 + cx)) * 4 + 3] >= alfaTela;
  const alcanzado = new Uint8Array(total);
  const cola = new Int32Array(total);
  let escribe = 0;
  const sembrar = (cx: number, cy: number) => {
    const i = cy * w + cx;
    if (alcanzado[i] || esTela(cx, cy)) return;
    alcanzado[i] = 1;
    cola[escribe++] = i;
  };
  for (let cx = 0; cx < w; cx++) {
    sembrar(cx, 0);
    sembrar(cx, h - 1);
  }
  for (let cy = 0; cy < h; cy++) {
    sembrar(0, cy);
    sembrar(w - 1, cy);
  }
  for (let lee = 0; lee < escribe; lee++) {
    const i = cola[lee];
    const cx = i % w;
    const cy = (i - cx) / w;
    if (cx > 0) sembrar(cx - 1, cy);
    if (cx < w - 1) sembrar(cx + 1, cy);
    if (cy > 0) sembrar(cx, cy - 1);
    if (cy < h - 1) sembrar(cx, cy + 1);
  }
  let tela = 0;
  let huecos = 0;
  for (let cy = 0; cy < h; cy++)
    for (let cx = 0; cx < w; cx++) {
      if (esTela(cx, cy)) tela++;
      else if (!alcanzado[cy * w + cx]) huecos++;
    }
  return tela + huecos === 0 ? 0 : huecos / (tela + huecos);
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
