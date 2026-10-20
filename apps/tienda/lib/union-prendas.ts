import { ESCENA, PX_POR_CM, type Caja } from "./probador";

// La unión de lo de arriba con lo de abajo en la figura del probador (ADR-0449, Felipe 2026-10-17): el borde de abajo de la prenda de
// arriba y la pretina de la falda o del pantalón tienen que coincidir, como en una persona. Hasta ahora cada prenda se dibujaba a su
// largo en cm (el propio o el típico de su categoría) y su ancho salía de la proporción de su recorte: una falda de 55 cm de largo
// típico que de verdad mide 40 salía con la pretina más ancha que el polo y asomaba por los lados.
//
// Ahora la prenda de abajo se dibuja por su PRETINA, no por su largo: la pretina sigue al borde de abajo del torso de arriba, pero solo
// dentro de ±15 % de una cintura estándar (36 cm, `ANCHO_ESTANDAR_DE_LA_UNION`), y su largo sale de la forma de la foto (una mini y una maxi
// salen bien sin que nadie les anote nada). El margen existe porque una falda no cambia de tamaño al cambiar de blusa: con una blusa ajustada
// la unión coincide, y una oversize o un crop simplemente cuelga por encima de la pretina, como en una persona. Las dos medidas salen de la
// propia imagen del recorte, en el navegador (`useUnionDeLaFigura`): sin columnas nuevas y también para los recortes que ya existen.
// Lógica pura, sin navegador.

/** Opacidad (0–255) desde la que un píxel cuenta como prenda al medirla: el mismo corte con que el ERP busca la caja de la prenda. */
const UMBRAL_ALFA = 32;
/** Un tramo de prenda tiene que ocupar al menos esta fracción del ancho para contar como el torso: las mangas sueltas son más angostas. */
const TORSO_MINIMO = 0.3;
/** Una pretina ocupa al menos esta fracción del ancho de su prenda: menos es el cuello de una blusa, no la parte de arriba de una falda. */
const PRETINA_MINIMA = 0.15;

/** En cuántas franjas verticales se parte una prenda para medir su bajo: lo bastante fino para un bajo curvo o asimétrico, lo bastante corto para recordarlo. */
export const FRANJAS_DEL_BAJO = 24;
/** Una franja cuyo bajo queda más arriba que esto (fracción del alto de la prenda) del punto más bajo del torso no es el bajo: es un hombro o una manga. */
export const SALTO_MAXIMO_DEL_BAJO = 0.25;
/** Cuánto del ancho de la prenda de arriba mira la unión para encontrar su bajo más alto: ni solo el centro, ni hasta las mangas. */
export const FRANJA_MINIMA_DE_LA_UNION = 0.3;
export const FRANJA_MAXIMA_DE_LA_UNION = 0.6;
/** Una franja forma parte de la zona del bajo si su prenda termina a menos de esto (fracción del alto) del punto más bajo del torso. */
export const ZONA_DEL_BAJO = 0.12;

/** Lo que se mide de un recorte, en fracciones de su propio ancho y alto (no cambian si la imagen se achica). `null`: no se pudo medir. */
export type MedidaDelRecorte = {
  /** En qué parte del alto de la prenda termina el torso (0–1): su punto MÁS BAJO. */
  filaDelBorde: number | null;
  /** El ancho del torso justo ahí, sobre el ancho de la prenda (sin mangas sueltas). */
  borde: number | null;
  /** El ancho de la parte de arriba de la prenda (la pretina de una falda o de un pantalón), sobre su ancho. */
  pretina: number | null;
  /** Dónde termina la prenda en cada una de sus `FRANJAS_DEL_BAJO` franjas, de izquierda a derecha (0–1 del alto); `null` en una franja sin prenda.
   *  Un bajo curvo o asimétrico (un top con caída, una blusa cruzada) no termina a la misma altura en todo su ancho. */
  bajo: (number | null)[] | null;
  /** El ancho del tramo seguido más ancho en el último tramo del torso (`ZONA_DEL_BAJO` de alto sobre su fila más baja), sobre el ancho de la prenda.
   *  Como `borde`, pero mirando toda la zona del bajo y no solo su última fila (una blusa cruzada termina en una punta angosta); las mangas separadas
   *  del cuerpo no cuentan, porque la medida es por fila y no por franja. */
  anchoBajo: number | null;
};

export const SIN_MEDIDA: MedidaDelRecorte = { filaDelBorde: null, borde: null, pretina: null, bajo: null, anchoBajo: null };

/** Dónde termina la prenda en cada franja (0–1 del alto): la mediana del último píxel de prenda de sus columnas, para que un hilo suelto no cuente. */
function perfilDelBajo(rgba: ArrayLike<number>, ancho: number, alto: number): (number | null)[] {
  const ultimo = new Array<number>(ancho).fill(-1);
  for (let x = 0; x < ancho; x++) {
    for (let y = alto - 1; y >= 0; y--) {
      if (rgba[(y * ancho + x) * 4 + 3] > UMBRAL_ALFA) {
        ultimo[x] = y;
        break;
      }
    }
  }
  return Array.from({ length: FRANJAS_DEL_BAJO }, (_, i) => {
    const columnas = ultimo.slice(Math.floor((i * ancho) / FRANJAS_DEL_BAJO), Math.floor(((i + 1) * ancho) / FRANJAS_DEL_BAJO)).filter((v) => v >= 0);
    // Una franja con menos de la mitad de sus columnas con prenda es el borde de una manga o un hueco, no parte del bajo.
    if (columnas.length === 0 || columnas.length * 2 < Math.floor(ancho / FRANJAS_DEL_BAJO)) return null;
    columnas.sort((a, b) => a - b);
    return Math.round(((columnas[columnas.length >> 1] + 1) / alto) * 100) / 100;
  });
}

/**
 * Cuánto mide de ancho la zona del bajo (fracción del ancho de la prenda). Una blusa cruzada o con caída termina en una punta angosta: su fila más
 * baja mide poco, pero su bajo de verdad es bastante más ancho, y si la unión se fiara de la punta encogería la cintura del pantalón al mínimo y la
 * blusa parecería enorme. Se mide por filas (el tramo seguido más ancho), no por franjas: las mangas largas que cuelgan a los lados del cuerpo no son
 * parte del bajo. `null`: no hay medida.
 */
export function anchoDelBajo(m: MedidaDelRecorte): number | null {
  return m.anchoBajo;
}

/**
 * Dónde termina el torso en su punto MÁS ALTO dentro del ancho central `ancho` (fracción del ancho de la prenda, centrada): ahí empieza a
 * verse lo que hay debajo. Con un bajo recto da lo mismo que `filaDelBorde`; con uno curvo o asimétrico es la subida del bajo, y la parte
 * que cuelga más abajo simplemente tapa la pretina (la de arriba va delante). `null`: no hay perfil medido.
 */
export function filaAltaDelBorde(m: MedidaDelRecorte, ancho: number): number | null {
  const bajo = m.bajo;
  const fondo = m.filaDelBorde;
  if (!bajo || bajo.length === 0 || fondo === null) return null;
  const n = bajo.length;
  const desde = Math.max(0, Math.floor(n * (0.5 - ancho / 2)));
  const hasta = Math.min(n, Math.ceil(n * (0.5 + ancho / 2)));
  let alta: number | null = null;
  for (let i = desde; i < hasta; i++) {
    const v = bajo[i];
    if (v === null || v < fondo - SALTO_MAXIMO_DEL_BAJO) continue;
    if (alta === null || v < alta) alta = v;
  }
  return alta === null ? null : Math.min(alta, fondo);
}

/** El tramo contiguo de prenda más ancho de una fila de la imagen (en píxeles). */
function tramoMasAncho(rgba: ArrayLike<number>, ancho: number, y: number): number {
  let mejor = 0;
  let tramo = 0;
  const base = y * ancho * 4 + 3;
  for (let x = 0; x < ancho; x++) {
    if (rgba[base + x * 4] > UMBRAL_ALFA) {
      tramo++;
      if (tramo > mejor) mejor = tramo;
    } else {
      tramo = 0;
    }
  }
  return mejor;
}

/**
 * Mide un recorte (un PNG RGBA, 4 bytes por píxel): dónde termina el torso y cuánto mide ahí, y cuánto mide su parte de arriba. Se queda con
 * el tramo más ancho de cada fila, así dos mangas colgando a los lados del cuerpo no se suman al torso (si las mangas tocan el torso, el
 * borde sale más ancho y `cajaDeAbajoUnida` lo acota). Una imagen vacía o sin torso no se puede medir: todo `null`.
 */
export function medirRecorte(rgba: ArrayLike<number>, ancho: number, alto: number): MedidaDelRecorte {
  if (ancho <= 0 || alto <= 0 || rgba.length < ancho * alto * 4) return SIN_MEDIDA;
  const tramos = new Array<number>(alto);
  for (let y = 0; y < alto; y++) tramos[y] = tramoMasAncho(rgba, ancho, y);

  let fila = -1;
  for (let y = alto - 1; y >= 0; y--) {
    if (tramos[y] >= TORSO_MINIMO * ancho) {
      fila = y;
      break;
    }
  }
  let borde: number | null = null;
  let filaDelBorde: number | null = null;
  let anchoBajo: number | null = null;
  if (fila >= 0) {
    // Un borde curvo (un bajo redondeado) es más angosto en su última fila: se toma el más ancho de las filas de arriba.
    let m = 0;
    for (let y = Math.max(0, fila - Math.round(0.04 * alto)); y <= fila; y++) m = Math.max(m, tramos[y]);
    borde = m / ancho;
    filaDelBorde = (fila + 1) / alto;
    let z = 0;
    for (let y = Math.max(0, fila - Math.round(ZONA_DEL_BAJO * alto)); y <= fila; y++) z = Math.max(z, tramos[y]);
    anchoBajo = z / ancho;
  }

  let p = 0;
  const desde = Math.floor(0.01 * alto);
  for (let y = desde; y < Math.max(desde + 1, Math.ceil(0.05 * alto)); y++) p = Math.max(p, tramos[y]);
  const pretina = p / ancho >= PRETINA_MINIMA ? p / ancho : null;

  return { filaDelBorde, borde, pretina, bajo: filaDelBorde === null ? null : perfilDelBajo(rgba, ancho, alto), anchoBajo };
}

/** La cintura estándar de una pretina, plana (cm): la mitad de una cintura de 72 cm. Lo que se le deja de ancho a la pretina cuando la prenda de
 *  arriba no la pide. */
export const ANCHO_ESTANDAR_DE_LA_UNION = 36;
/** Cuánto puede alejarse la pretina de la cintura estándar para seguir al borde de la prenda de arriba (±15 %). */
export const HOLGURA_DE_LA_UNION = 0.15;
/** El largo más corto y el más largo (cm) que se le deja a una prenda de abajo al igualarla con la de arriba: una foto rara no dibuja un pantalón de 20 cm. */
export const LARGO_MINIMO_DE_ABAJO = 20;
export const LARGO_MAXIMO_DE_ABAJO = 120;
/** Cuánto entra la pretina bajo el borde del torso (px de la escena), para que no quede una línea de aire entre las dos. */
export const SOLAPE_DE_LA_UNION = 3;
/** Cuánto puede crecer, a lo más, una prenda de arriba que se dibuja con el bajo demasiado angosto (×1,3). Nunca se encoge: una prenda ancha es ancha a propósito. */
export const AJUSTE_MAXIMO_DE_ARRIBA = 1.3;

/**
 * La prenda de arriba que se dibuja con el bajo más angosto de lo que una persona puede llevar: si su bajo mide menos que la cintura más
 * angosta que admite la unión (`ANCHO_ESTANDAR_DE_LA_UNION` menos su holgura, 30,6 cm), la blusa está dibujada demasiado chica (su largo en cm
 * es el típico de su categoría, igual para todas las blusas, y no encaja con su forma): crece desde el centro de los hombros, sin subir, lo justo
 * hasta alcanzar esa cintura (proporcional a lo que le falta, y a lo más `AJUSTE_MAXIMO_DE_ARRIBA`). Todo lo demás queda EXACTAMENTE como estaba:
 * no encoge nunca (los oversize, las casacas y los cardigans son anchos a propósito) y desde la cintura mínima hacia arriba no toca nada, así lo que
 * ya se ve bien no se mueve ni un píxel. Continua: justo en el umbral crece 1,0. `null`: sin cambio (sin medida, metida, o ya en rango).
 */
export function cajaDeArribaAjustada(arriba: { caja: Caja; medida: MedidaDelRecorte | null | undefined; metida: boolean }): Caja | null {
  const m = arriba.medida;
  const c = arriba.caja;
  if (arriba.metida || !m || m.borde === null || !(c.w > 0) || !(c.h > 0)) return null;
  const bajoPx = c.w * Math.max(m.borde, anchoDelBajo(m) ?? 0);
  const minimoPx = ANCHO_ESTANDAR_DE_LA_UNION * (1 - HOLGURA_DE_LA_UNION) * PX_POR_CM;
  if (!(bajoPx > 0) || bajoPx >= minimoPx) return null;
  const k = Math.min(AJUSTE_MAXIMO_DE_ARRIBA, minimoPx / bajoPx);
  const w = c.w * k;
  return { x: Math.round(c.x + c.w / 2 - w / 2), y: c.y, w: Math.round(w), h: Math.round(c.h * k) };
}

/**
 * Dónde va la prenda de abajo para que su pretina siga al borde de abajo de la de arriba (dentro de ±15 % de la cintura estándar). `null` si no se puede (sin medidas, o
 * la prenda de arriba va metida —un body—): entonces se queda la caja de siempre, por su largo en cm. Es la misma regla para una falda, un
 * short y un pantalón: lo que se fija es la pretina; el largo sale de la forma de la foto, entre `LARGO_MINIMO_DE_ABAJO` y
 * `LARGO_MAXIMO_DE_ABAJO`.
 */
export function cajaDeAbajoUnida(
  arriba: { caja: Caja; medida: MedidaDelRecorte | null | undefined; metida: boolean },
  abajo: { proporcion: number; medida: MedidaDelRecorte | null | undefined },
): Caja | null {
  const a = arriba.medida;
  const b = abajo.medida;
  if (arriba.metida || !a || a.borde === null || a.filaDelBorde === null || !b || b.pretina === null) return null;
  if (!(abajo.proporcion > 0) || !(arriba.caja.w > 0) || !(arriba.caja.h > 0)) return null;
  const estandar = ANCHO_ESTANDAR_DE_LA_UNION * PX_POR_CM;
  // El ancho del bajo es el mayor entre el de su última fila y el de toda su zona del bajo (ver `anchoDelBajo`).
  const bordeAncho = Math.max(a.borde, anchoDelBajo(a) ?? 0);
  const pretinaPx = Math.min(Math.max(arriba.caja.w * bordeAncho, estandar * (1 - HOLGURA_DE_LA_UNION)), estandar * (1 + HOLGURA_DE_LA_UNION));
  // El bajo de la prenda de arriba no siempre es recto: la pretina arranca donde el bajo está más ALTO dentro de su ancho (sin aire en ese lado)
  // y la parte del bajo que cuelga más abajo la tapa. Sin perfil medido, el punto más bajo de siempre.
  const franja = Math.min(Math.max(pretinaPx / arriba.caja.w, FRANJA_MINIMA_DE_LA_UNION), FRANJA_MAXIMA_DE_LA_UNION);
  const filaDelBorde = filaAltaDelBorde(a, franja) ?? a.filaDelBorde;
  const h = Math.min(Math.max(pretinaPx / b.pretina / abajo.proporcion, LARGO_MINIMO_DE_ABAJO * PX_POR_CM), LARGO_MAXIMO_DE_ABAJO * PX_POR_CM);
  const w = h * abajo.proporcion;
  return {
    x: Math.round(ESCENA.ancho / 2 - w / 2),
    y: Math.round(arriba.caja.y + arriba.caja.h * filaDelBorde - SOLAPE_DE_LA_UNION),
    w: Math.round(w),
    h: Math.round(h),
  };
}

/* ======================== Para medir rápido: qué se baja, y lo que se recuerda entre visitas ======================== */

/** El ancho (px) al que se baja un recorte para medirlo: uno de los anchos que el optimizador de imágenes de la tienda ya sirve (`imageSizes`). */
export const ANCHO_PARA_MEDIR = 256;
/** Cuántos recortes medidos se recuerdan en el navegador (los más nuevos): son tres números por prenda. */
export const MEDIDAS_QUE_SE_RECUERDAN = 300;

/**
 * De dónde se baja un recorte para medirlo. Una foto del almacén de CAYLA pasa por el optimizador (misma dirección que ya usa la figura, 256 px
 * de ancho): pesa una fracción del PNG entero, sale de la caché del CDN y es del mismo origen, sin pedir permisos de lectura. Cualquier otra se
 * baja tal cual. Las medidas son fracciones de la imagen, así que no cambian por bajarla más chica.
 */
export function direccionParaMedir(foto: { url: string; optimizar: boolean }): string {
  return foto.optimizar ? `/_next/image?url=${encodeURIComponent(foto.url)}&w=${ANCHO_PARA_MEDIR}&q=75` : foto.url;
}

const esFraccion = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1);

/** Lo que se recordó de visitas anteriores: solo lo bien formado (un texto roto o de otra versión no rompe nada). */
export function medidasDesdeTexto(texto: string | null): Map<string, MedidaDelRecorte> {
  const salida = new Map<string, MedidaDelRecorte>();
  if (!texto) return salida;
  try {
    const dato: unknown = JSON.parse(texto);
    if (!dato || typeof dato !== "object" || Array.isArray(dato)) return salida;
    for (const [url, m] of Object.entries(dato)) {
      if (!m || typeof m !== "object") continue;
      const { filaDelBorde, borde, pretina, bajo, anchoBajo } = m as Record<string, unknown>;
      const perfil = Array.isArray(bajo) && bajo.length === FRANJAS_DEL_BAJO && bajo.every(esFraccion) ? (bajo as (number | null)[]) : null;
      if (esFraccion(filaDelBorde) && esFraccion(borde) && esFraccion(pretina) && (bajo == null || perfil) && (anchoBajo == null || esFraccion(anchoBajo))) {
        salida.set(url, { filaDelBorde, borde, pretina, bajo: perfil, anchoBajo: anchoBajo ?? null });
      }
    }
  } catch {
    // Un texto que no es JSON se ignora: se vuelve a medir.
  }
  return salida;
}

/** Lo que se guarda: solo recortes que sí se pudieron medir, y los últimos `MEDIDAS_QUE_SE_RECUERDAN`. */
export function medidasATexto(medidas: ReadonlyMap<string, MedidaDelRecorte | null>): string {
  const buenas = [...medidas].filter((e): e is [string, MedidaDelRecorte] => e[1] !== null && (e[1].borde !== null || e[1].pretina !== null));
  return JSON.stringify(Object.fromEntries(buenas.slice(-MEDIDAS_QUE_SE_RECUERDAN)));
}
