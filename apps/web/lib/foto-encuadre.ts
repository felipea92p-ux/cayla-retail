// Lógica pura de las fotos de prenda (ADR-0228; recortada por el ADR-0442). Sin navegador: la usan `recorte-probador-reglas.ts`,
// `producto-fotos.ts` y sus pruebas. Sin imports de `@/`: vitest local no los resuelve.
//
// Desde el ADR-0442 (Felipe, 2026-10-17) la foto de una prenda se sube TAL CUAL la entrega la IA del equipo: sin encuadre de 1200×1500, sin
// quitar el fondo ni corregir la luz. Lo que queda aquí es lo que lee el canal alfa de esa imagen (la caja de la prenda, las piezas sueltas,
// los huecos) y el lugar de la foto en el bucket.

/** Opacidad (0–255) desde la que un píxel cuenta como prenda al buscar sus bordes. Por debajo es neblina o el halo suave del
 *  borde: contarlo agrandaría la caja con bruma que no se ve. */
export const UMBRAL_ALFA = 32;

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

/** Desde qué fracción de huecos el recorte se considera agujereado y queda «por revisar» (ADR-0442; antes, la sugerencia «Con fondo»).
 *  Medido el 2026-09-26 con seis fotos recortadas por MODNet: las limpias dieron 0,00 % y 0,07 %; las que el recortador agujereó
 *  entre 1,38 % y 1,86 %. Con la transparencia de la IA un hueco cerrado casi siempre es una abertura del diseño (un ojal, un cut-out):
 *  solo pide que alguien lo mire y lo confirme con «Usar en el probador». */
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

/** Los tipos de imagen que acepta el almacén y su extensión. */
const EXTENSION_DE_LA_FOTO: Readonly<Record<string, string>> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Dónde vive una foto en el bucket `retail-productos-fotos`: `fotos/<id>.<extensión>`, con la extensión de lo que es (un PNG sin fondo no
 * puede llamarse .jpg). Ya no hay «original» aparte (ADR-0442): la foto ES lo que subió el equipo. `null` si no es un tipo aceptado.
 */
export function rutaDeLaFoto(id: string, tipo: string): string | null {
  const ext = EXTENSION_DE_LA_FOTO[tipo];
  return ext ? `fotos/${id}.${ext}` : null;
}
