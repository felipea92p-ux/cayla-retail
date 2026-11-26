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
  /** El contorno fino, para cubrir la pretina sin dejar aire. Ausente en lo medido antes del 2026-11-17: sin él, la unión usa el perfil de `bajo`. */
  contorno?: ContornoDelRecorte | null;
  /** El ancho de la prenda fila por fila (ADR-0705), para medir su pecho a la altura de las axilas que dijo la IA. Ausente en lo medido antes del 2026-11-26. */
  anchos?: AnchosPorFila | null;
};

/* ======================== El pecho: la prenda de arriba se dimensiona por sus axilas, no por su bajo (ADR-0705, 2026-11-26) ======================== */

/** En cuántas filas se parte el alto de la prenda para guardar su ancho: cada una es un 2 % del alto. */
export const FILAS_DEL_ANCHO = 50;
/**
 * El ancho del torso en cada fila (fracciones del ancho de la prenda; `null`: no hay prenda que pase por el medio): el tramo que pasa por el centro, así las
 * mangas que cuelgan sueltas no se suman.
 */
export type AnchosPorFila = { centro: (number | null)[] };

export function anchosPorFila(rgba: ArrayLike<number>, ancho: number, alto: number): AnchosPorFila {
  const centro: (number | null)[] = [];
  const medio = Math.floor(ancho / 2);
  for (let i = 0; i < FILAS_DEL_ANCHO; i++) {
    const y = Math.min(alto - 1, Math.floor(((i + 0.5) / FILAS_DEL_ANCHO) * alto));
    const base = y * ancho * 4 + 3;
    let desde = -1;
    let delCentro: number | null = null;
    for (let x = 0; x <= ancho; x++) {
      const opaco = x < ancho && rgba[base + x * 4] > UMBRAL_ALFA;
      if (opaco && desde < 0) desde = x;
      if (!opaco && desde >= 0) {
        if (desde <= medio && x > medio) delCentro = x - desde;
        desde = -1;
      }
    }
    centro.push(delCentro === null ? null : Math.round((delCentro / ancho) * 1000) / 1000);
  }
  return { centro };
}

/**
 * Las prendas que se dimensionan por su pecho: SOLO las de mangas. Sus mangas abiertas y su bajo (un nudo, un fruncido, un cruce) confunden la regla del bajo;
 * las sin mangas (tirantes, halter, strapless, corset) ya se veían bien con ella y medidas por el pecho salían más anchas que la cadera (Felipe, 2026-11-26, con el
 * Top Vanessa sobre un jean): siguen con la regla de siempre.
 */
export const TIPOS_POR_EL_PECHO: readonly string[] = ["con_mangas"];
/** Cuánto bajo la axila se mide el pecho (fracción del alto): justo bajo el brazo el costado todavía se curva; un poco más abajo ya es el torso. */
const BAJO_LA_AXILA = 0.04;

/** El ancho del pecho (fracción del ancho de la prenda) un poco bajo la axila: la mediana de tres filas, para que una costura o un pliegue no lo muevan. */
export function anchoDelPecho(anchos: AnchosPorFila | null | undefined, axila: number): number | null {
  if (!anchos || !(axila >= 0) || !(axila <= 0.8)) return null;
  const fila = Math.round((axila + BAJO_LA_AXILA) * FILAS_DEL_ANCHO - 0.5);
  const vistos = [fila, fila + 1, fila + 2].flatMap((i) => {
    const v = anchos.centro[i];
    return typeof v === "number" && v > 0 ? [v] : [];
  });
  if (vistos.length === 0) return null;
  vistos.sort((a, b) => a - b);
  return vistos[Math.floor(vistos.length / 2)];
}

/** Lo que dijo la IA de un recorte (su medida guardada en la base, que la tienda lee en `retail.tienda_probador`). */
export type MedidaDeLaIA = { tipo: string; holgura: "ajustada" | "normal" | "holgada"; metida: boolean; axila: number | null };

/** El ancho plano de axila a axila de una blusa ajustada (cm). */
export const PECHO_ESTANDAR = 44;
/**
 * Cuánto más ancho se ve el pecho según la holgura. Calibrado el 2026-11-26 con las blusas de mangas que ya se veían bien en la tienda (Akira 44,5 cm y
 * TOP-0021 46,5, ajustadas; el Polo Básico 53,6, normal; la Blusa Brillo 63,2, holgada): ajustada ≈ 44, normal ≈ 48, holgada ≈ 55. La Camisa Dalia se veía de 63,7.
 */
export const HOLGURA_DEL_PECHO: Record<MedidaDeLaIA["holgura"], number> = { ajustada: 1, normal: 1.1, holgada: 1.25 };
/** Lo más que se agranda o se achica una prenda por su pecho: una medida rara no puede volverla diminuta ni enorme. */
export const FACTOR_MINIMO_DEL_PECHO = 0.7;
export const FACTOR_MAXIMO_DEL_PECHO = 1.45;

/**
 * La prenda de arriba, dimensionada por su PECHO (ADR-0705): el ancho de su torso bajo las axilas que dijo la IA, llevado al de una blusa de su holgura. No le
 * importa el bajo: un nudo, un fruncido o un corte cruzado ya no la agrandan. Crece o se encoge desde el centro de los hombros, sin subir, como `cajaDeArribaAjustada`.
 * `null`: sin la medida de la IA, una prenda sin mangas o sin el ancho fila por fila (entonces manda la regla del bajo). Ya en su medida, devuelve la misma caja.
 */
export function cajaPorElPecho(arriba: { caja: Caja; medida: MedidaDelRecorte | null | undefined; ia: MedidaDeLaIA | null | undefined }): Caja | null {
  const { caja: c, medida: m, ia } = arriba;
  if (!ia || ia.axila === null || !TIPOS_POR_EL_PECHO.includes(ia.tipo) || !m || !(c.w > 0) || !(c.h > 0)) return null;
  const fraccion = anchoDelPecho(m.anchos, ia.axila);
  if (fraccion === null) return null;
  const pechoCm = (c.w * fraccion) / PX_POR_CM;
  const k = Math.min(FACTOR_MAXIMO_DEL_PECHO, Math.max(FACTOR_MINIMO_DEL_PECHO, (PECHO_ESTANDAR * HOLGURA_DEL_PECHO[ia.holgura]) / pechoCm));
  // Ya en su medida: queda como está (devuelve la misma caja, no null: si no, mandaría la regla del bajo y el nudo la volvería a agrandar).
  if (Math.abs(k - 1) < BANDA_MUERTA_DEL_TORSO) return c;
  const w = c.w * k;
  return { x: Math.round(c.x + c.w / 2 - w / 2), y: c.y, w: Math.round(w), h: Math.round(c.h * k) };
}

export const SIN_MEDIDA: MedidaDelRecorte = { filaDelBorde: null, borde: null, pretina: null, bajo: null, anchoBajo: null };

/* ======================== El contorno fino: lo que permite VERIFICAR la unión, no estimarla (ADR-0449, act. 2026-11-17) ======================== */

/** En cuántas franjas verticales se parte una prenda para su contorno fino: cada una cubre ~2 px de la figura, así un bajo en V, en diagonal o una esquina redondeada se ven. */
export const FRANJAS_DEL_CONTORNO = 64;
/** Una franja de la prenda de arriba es del torso (tiene bajo) si su bajo no queda más de esto (fracción del alto) sobre el más bajo de la prenda: lo demás son tirantes,
 *  mangas o el hueco de un escote, que no cubren la pretina. */
export const SALTO_DEL_CONTORNO = 0.3;
/** Una franja de la prenda de abajo es de su pretina si la prenda empieza ahí a no más de esto (fracción del alto) bajo su punto más alto: la línea plana de la cintura
 *  y su esquina redondeada. La curva que baja hacia la cadera no cuenta: con 6 % el pantalón subía hasta asomar entre el cuerpo y la manga de una camisa corta
 *  (probado y descartado mirando, 2026-11-17). */
export const CIMA_DE_LA_PRETINA = 0.03;

/**
 * El contorno de una prenda por franjas, de izquierda a derecha (fracciones del alto; `null`: sin prenda o no cuenta). Es CONSERVADOR a propósito: `fondo` es la fila
 * más ALTA a la que termina la prenda en esa franja y `cima` la más BAJA a la que empieza, así que si la unión cubre con estos números, cubre en todos los píxeles.
 */
export type ContornoDelRecorte = {
  /** Dónde termina la prenda en cada franja (su bajo). */
  fondo: (number | null)[];
  /** Dónde empieza la prenda en cada franja, solo en las franjas de su pretina (las demás, `null`). */
  cima: (number | null)[];
};

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

/** El contorno fino de un recorte (ver `ContornoDelRecorte`): por franja, el bajo más alto y el inicio más bajo de sus columnas, redondeados hacia el lado que cubre más. */
export function contornoDe(rgba: ArrayLike<number>, ancho: number, alto: number): ContornoDelRecorte | null {
  if (ancho < FRANJAS_DEL_CONTORNO || alto <= 0) return null;
  const primero = new Array<number>(ancho).fill(-1);
  const ultimo = new Array<number>(ancho).fill(-1);
  for (let x = 0; x < ancho; x++) {
    for (let y = 0; y < alto; y++) {
      if (rgba[(y * ancho + x) * 4 + 3] > UMBRAL_ALFA) {
        if (primero[x] < 0) primero[x] = y;
        ultimo[x] = y;
      }
    }
  }
  const fondo: (number | null)[] = [];
  const inicio: (number | null)[] = [];
  for (let i = 0; i < FRANJAS_DEL_CONTORNO; i++) {
    const desde = Math.floor((i * ancho) / FRANJAS_DEL_CONTORNO);
    const hasta = Math.floor(((i + 1) * ancho) / FRANJAS_DEL_CONTORNO);
    let con = 0;
    let masAlto = Infinity;
    let masBajo = -1;
    for (let x = desde; x < hasta; x++) {
      if (ultimo[x] < 0) continue;
      con++;
      masAlto = Math.min(masAlto, ultimo[x] + 1);
      masBajo = Math.max(masBajo, primero[x]);
    }
    // Una franja con menos de la mitad de sus columnas con prenda es un borde o un hueco, no parte del contorno.
    if (con === 0 || con * 2 < hasta - desde) {
      fondo.push(null);
      inicio.push(null);
    } else {
      fondo.push(Math.floor((masAlto / alto) * 1000) / 1000);
      inicio.push(Math.ceil((masBajo / alto) * 1000) / 1000);
    }
  }
  if (fondo.every((v) => v === null)) return null;
  const masAlta = Math.min(1, ...inicio.map((v) => v ?? 1));
  return { fondo, cima: inicio.map((v) => (v !== null && v <= masAlta + CIMA_DE_LA_PRETINA ? v : null)) };
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

/** Hasta dónde se sube (fracción del alto de la prenda, desde su fila más baja) buscando dónde el bajo termina de abrirse: un bajo en V o en diagonal no ocupa más que eso. */
export const ALTO_MAXIMO_DEL_BAJO = 0.4;
/** El paso con que se sube (fracción del alto) y lo mínimo que tiene que ensancharse la prenda en cada paso (fracción del ancho) para seguir siendo «el bajo que se abre»:
 *  menos que eso ya es el cuerpo, que casi no cambia de ancho. */
const PASO_DEL_BAJO = 0.02;
const CRECE_MINIMO_DEL_BAJO = 0.01;
/** Un ensanche de golpe de una fila a la siguiente (fracción del ancho) no es el bajo que se abre: es una manga que se junta con el cuerpo. Ahí se deja de subir. */
const SALTO_DE_MANGA = 0.1;

/**
 * El ancho del CUERPO de la prenda a la altura donde su bajo termina de abrirse (px). Un bajo en V, en diagonal, en curva o de pañuelo es angosto en sus últimas filas y se
 * va ensanchando hacia arriba hasta llegar al cuerpo: si la prenda se midiera solo en esa zona angosta (los últimos 12 % de alto), parecería más chica de lo que es y la figura
 * la agrandaría (Felipe, 2026-11-17: el Top Glitters, de bajo en V, salía de 56 cm de ancho sobre un pantalón de cintura 39). Se sube desde el techo de esa zona mientras la
 * prenda se siga ensanchando de a poco; se deja de subir cuando el ancho se estabiliza (ya es el cuerpo), cuando salta de golpe (una manga que se junta) o al llegar al
 * tope (`ALTO_MAXIMO_DEL_BAJO`). Con un bajo recto no sube nada: devuelve el ancho de siempre.
 */
function anchoDelCuerpo(tramos: readonly number[], ancho: number, alto: number, fila: number, techo: number, enLaZona: number): number {
  const limite = Math.max(0, fila - Math.round(ALTO_MAXIMO_DEL_BAJO * alto));
  const paso = Math.max(1, Math.round(PASO_DEL_BAJO * alto));
  let z = enLaZona;
  let y = techo;
  while (y - paso >= limite) {
    let m = 0;
    let salto = false;
    for (let k = 1; k <= paso; k++) {
      if (tramos[y - k] - tramos[y - k + 1] > SALTO_DE_MANGA * ancho) {
        salto = true;
        break;
      }
      m = Math.max(m, tramos[y - k]);
    }
    if (salto || m < z + CRECE_MINIMO_DEL_BAJO * ancho) break;
    z = m;
    y -= paso;
  }
  return z;
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
    const techo = Math.max(0, fila - Math.round(ZONA_DEL_BAJO * alto));
    let z = 0;
    for (let y = techo; y <= fila; y++) z = Math.max(z, tramos[y]);
    anchoBajo = anchoDelCuerpo(tramos, ancho, alto, fila, techo, z) / ancho;
  }

  let p = 0;
  const desde = Math.floor(0.01 * alto);
  for (let y = desde; y < Math.max(desde + 1, Math.ceil(0.05 * alto)); y++) p = Math.max(p, tramos[y]);
  const pretina = p / ancho >= PRETINA_MINIMA ? p / ancho : null;

  const contorno = contornoDe(rgba, ancho, alto);
  const anchos = anchosPorFila(rgba, ancho, alto);
  return {
    filaDelBorde,
    borde,
    pretina,
    bajo: filaDelBorde === null ? null : perfilDelBajo(rgba, ancho, alto),
    anchoBajo,
    ...(contorno ? { contorno } : {}),
    ...(anchos.centro.some((v) => v !== null) ? { anchos } : {}),
  };
}

/** La cintura estándar de una pretina, plana (cm): la mitad de una cintura de 72 cm. Lo que se le deja de ancho a la pretina cuando la prenda de
 *  arriba no la pide. */
export const ANCHO_ESTANDAR_DE_LA_UNION = 36;
/** Cuánto puede alejarse la pretina de la cintura estándar para seguir al borde de la prenda de arriba (±15 %). */
export const HOLGURA_DE_LA_UNION = 0.15;
/** El largo más corto y el más largo (cm) que se le deja a una prenda de abajo al igualarla con la de arriba: una foto rara no dibuja un pantalón de 20 cm. */
export const LARGO_MINIMO_DE_ABAJO = 20;
export const LARGO_MAXIMO_DE_ABAJO = 120;
/** Cuánto más ancha que la prenda de arriba puede verse una FALDA (×1,05). Una blusa con vuelo abajo (un peplum) lleva la pretina al máximo de
 *  la holgura, y una falda acampanada se abría hasta verse 20 % más ancha que la blusa (FAL-0011 con CMS-0026, 2026-10-22). Solo vale para faldas
 *  (Felipe, 2026-11-09): un pantalón, un short o un jean se abre en las piernas, y medirlo contra la blusa encogía su pretina hasta 8 cm por debajo
 *  del bajo de la blusa. */
export const ANCHO_MAXIMO_DE_ABAJO_SOBRE_ARRIBA = 1.05;
/** Hasta dónde puede ese tope encoger la pretina de una falda: nunca por debajo del 92 % del bajo de la blusa (Felipe eligió mirando, 2026-11-09:
 *  sin tope la falda del peplum se ve muy grande; con el tope entero, la pretina queda 11 cm más angosta que el bajo y se ve el escalón). */
export const PRETINA_MINIMA_DE_LA_FALDA = 0.92;
/** Cuánto entra la pretina bajo el borde del torso (px de la escena), para que no quede una línea de aire entre las dos. */
export const SOLAPE_DE_LA_UNION = 3;
/** Cuánto puede crecer, a lo más, una prenda de arriba que se dibuja con el bajo demasiado angosto (×1,3). Nunca se encoge: una prenda ancha es ancha a propósito. */
export const AJUSTE_MAXIMO_DE_ARRIBA = 1.3;

/** El ancho del bajo (cm) de una blusa o un polo «típico», plano. Contra él se mide el bajo de cada blusa para saber si se dibujó grande o chica. */
export const ANCHO_ESTANDAR_DEL_TORSO = 40;
/** Cuánto de lo que falta o sobra se corrige (0,8 de la razón entre el ancho típico y el medido): el largo típico de la categoría se equivoca en un sentido, pero la
 *  forma de la foto también se mueve (un poco de vuelo, una manga), así que no se llega al 100 %. */
export const PESO_DEL_TORSO = 0.8;
/** Lo más que se encoge o se agranda una blusa por su torso (×0,75 a ×1,35). */
export const FACTOR_MINIMO_DEL_TORSO = 0.75;
export const FACTOR_MAXIMO_DEL_TORSO = 1.35;
/** El ancho del bajo (cm) que se cree: fuera de 18 a 62 cm la medida es de una foto rara (un corsé, una capa) y no se toca la prenda. */
export const BAJO_CREIBLE_MINIMO = 18;
export const BAJO_CREIBLE_MAXIMO = 62;
/** Una corrección menor a esto (3 %) no se aplica: lo que ya se ve bien no se mueve ni un píxel. */
export const BANDA_MUERTA_DEL_TORSO = 0.03;

/**
 * Cuánto hay que escalar una blusa para que su torso (el ancho de su bajo) mida lo de una blusa típica. Cada categoría se dibuja con UN largo típico
 * (60 cm un polo, 65 una camisa), y una blusa corta o larga de verdad sale dibujada demasiado grande o chica: el torso, que se mide de su propio recorte, lo corrige
 * (el bajo dibujado = largo típico × proporción × fracción del bajo, y el bajo real es el mismo con el largo real: la razón entre los dos es la del largo).
 * `null`: sin cambio (medida increíble, o ya dentro de la banda muerta).
 */
export function factorDelTorso(bajoCm: number): number | null {
  if (!(bajoCm >= BAJO_CREIBLE_MINIMO) || !(bajoCm <= BAJO_CREIBLE_MAXIMO)) return null;
  const k = Math.min(FACTOR_MAXIMO_DEL_TORSO, Math.max(FACTOR_MINIMO_DEL_TORSO, (ANCHO_ESTANDAR_DEL_TORSO / bajoCm) ** PESO_DEL_TORSO));
  return Math.abs(k - 1) < BANDA_MUERTA_DEL_TORSO ? null : k;
}

/**
 * La prenda de arriba, ajustada a su propia forma.
 * - Una blusa, camisa, polo o top (`porTorso`): se escala por su torso (`factorDelTorso`), crece o se encoge desde el centro de los hombros, sin subir. Es lo que
 *   hace que una blusa corta no se vea del tamaño de una larga (el largo típico de la categoría es el mismo para todas).
 * - Lo demás (casacas, chalecos, blazers, abrigos): solo crece, y solo si su bajo es implausiblemente angosto: si mide menos que la cintura más angosta que
 *   admite la unión (`ANCHO_ESTANDAR_DE_LA_UNION` menos su holgura, 30,6 cm), crece lo justo hasta alcanzarla, a lo más `AJUSTE_MAXIMO_DE_ARRIBA`. No encoge nunca:
 *   una prenda de abrigo es ancha a propósito. Continua: justo en el umbral crece 1,0.
 * `null`: sin cambio (sin medida, metida, o ya en rango).
 */
export function cajaDeArribaAjustada(arriba: { caja: Caja; medida: MedidaDelRecorte | null | undefined; metida: boolean; porTorso?: boolean }): Caja | null {
  const m = arriba.medida;
  const c = arriba.caja;
  if (arriba.metida || !m || m.borde === null || !(c.w > 0) || !(c.h > 0)) return null;
  const bajoPx = c.w * Math.max(m.borde, anchoDelBajo(m) ?? 0);
  if (!(bajoPx > 0)) return null;
  let k: number;
  if (arriba.porTorso) {
    const porElTorso = factorDelTorso(bajoPx / PX_POR_CM);
    if (porElTorso === null) return null;
    k = porElTorso;
  } else {
    const minimoPx = ANCHO_ESTANDAR_DE_LA_UNION * (1 - HOLGURA_DE_LA_UNION) * PX_POR_CM;
    if (bajoPx >= minimoPx) return null;
    k = Math.min(AJUSTE_MAXIMO_DE_ARRIBA, minimoPx / bajoPx);
  }
  const w = c.w * k;
  return { x: Math.round(c.x + c.w / 2 - w / 2), y: c.y, w: Math.round(w), h: Math.round(c.h * k) };
}

/**
 * Dónde va la prenda de abajo para que su pretina siga al borde de abajo de la de arriba (dentro de ±15 % de la cintura estándar). `null` si no se puede (sin medidas, o
 * la prenda de arriba va metida —un body—): entonces se queda la caja de siempre, por su largo en cm. Lo que se fija es la pretina; el largo sale de la forma
 * de la foto, entre `LARGO_MINIMO_DE_ABAJO` y `LARGO_MAXIMO_DE_ABAJO`. Un pantalón, un short o un jean calza su pretina con el bajo de la blusa; una falda
 * (`falda`) además no se ve más de ×1,05 el ancho de la blusa, sin que su pretina baje del 92 % de ese bajo.
 */
export function cajaDeAbajoUnida(
  arriba: { caja: Caja; medida: MedidaDelRecorte | null | undefined; metida: boolean; porElPecho?: boolean },
  abajo: { proporcion: number; medida: MedidaDelRecorte | null | undefined; falda?: boolean },
): Caja | null {
  const a = arriba.medida;
  const b = abajo.medida;
  if (arriba.metida || !a || a.borde === null || a.filaDelBorde === null || !b || b.pretina === null) return null;
  if (!(abajo.proporcion > 0) || !(arriba.caja.w > 0) || !(arriba.caja.h > 0)) return null;
  const estandar = ANCHO_ESTANDAR_DE_LA_UNION * PX_POR_CM;
  // El ancho del bajo es el mayor entre el de su última fila y el de toda su zona del bajo (ver `anchoDelBajo`).
  const bordeAncho = Math.max(a.borde, anchoDelBajo(a) ?? 0);
  const pretinaMinima = estandar * (1 - HOLGURA_DE_LA_UNION);
  // ADR-0705: si la de arriba ya se dimensionó por su pecho, el cuerpo manda: la pretina es la cintura estándar y NO sigue al bajo de la blusa (un nudo
  // angosta ese bajo y arrastraba al pantalón: la blusa se achicaba y el jean con ella, y la proporción no cambiaba). La blusa cuelga encima, como en una persona.
  const pretinaSegunElBorde = arriba.porElPecho
    ? estandar
    : Math.min(Math.max(arriba.caja.w * bordeAncho, pretinaMinima), estandar * (1 + HOLGURA_DE_LA_UNION));
  // Una falda, además, no se ve mucho más ancha que la blusa: el tope la encoge, pero su pretina no baja del 92 % del bajo (ni de la cintura mínima).
  const pretinaPx = abajo.falda
    ? Math.max(
        pretinaMinima,
        Math.min(pretinaSegunElBorde, Math.max(arriba.caja.w * ANCHO_MAXIMO_DE_ABAJO_SOBRE_ARRIBA * b.pretina, pretinaSegunElBorde * PRETINA_MINIMA_DE_LA_FALDA)),
      )
    : pretinaSegunElBorde;
  // El bajo de la prenda de arriba no siempre es recto: la pretina arranca donde el bajo está más ALTO dentro de su ancho (sin aire en ese lado)
  // y la parte del bajo que cuelga más abajo la tapa. Sin perfil medido, el punto más bajo de siempre.
  const franja = Math.min(Math.max(pretinaPx / arriba.caja.w, FRANJA_MINIMA_DE_LA_UNION), FRANJA_MAXIMA_DE_LA_UNION);
  const filaDelBorde = filaAltaDelBorde(a, franja) ?? a.filaDelBorde;
  const h = Math.min(Math.max(pretinaPx / b.pretina / abajo.proporcion, LARGO_MINIMO_DE_ABAJO * PX_POR_CM), LARGO_MAXIMO_DE_ABAJO * PX_POR_CM);
  const w = h * abajo.proporcion;
  const x = Math.round(ESCENA.ancho / 2 - w / 2);
  const yEstimada = arriba.caja.y + arriba.caja.h * filaDelBorde - SOLAPE_DE_LA_UNION;
  // Con el contorno fino de las dos prendas la posición no se estima: se CALCULA la que deja el bajo de arriba cubriendo la pretina en cada columna.
  const yCubierta = alturaQueCubreLaPretina(arriba.caja, a.contorno, a.filaDelBorde, { x, w, h }, b.contorno);
  return { x, y: Math.round(yCubierta ?? yEstimada), w: Math.round(w), h: Math.round(h) };
}

/** Lo más que puede subir la pretina (fracción del alto de la prenda de arriba) sobre donde la pondría la estimación, para taparse bajo el bajo de arriba. Más que eso es una foto
 *  rara (un bajo con un hueco enorme), y es mejor un poco de aire que un pantalón subido hasta el pecho. */
export const SUBIDA_MAXIMA_DE_LA_PRETINA = 0.3;

/**
 * La altura (px de la escena) a la que hay que poner la prenda de abajo para que el bajo de la de arriba cubra su pretina en TODAS sus columnas: sin un triángulo de fondo entre el
 * bajo en V de un top y la esquina del pantalón. Es la más baja de las que cubren (lo de abajo no sube más de lo necesario). `null` si falta algún contorno o no hay columna que
 * cubrir: entonces manda la estimación.
 */
export function alturaQueCubreLaPretina(
  arriba: Caja,
  contornoArriba: ContornoDelRecorte | null | undefined,
  /** Dónde termina el TORSO de la prenda de arriba (`filaDelBorde`): la referencia del bajo, y no su punto más bajo, que puede ser el puño de una manga larga. */
  bajoDelTorso: number | null,
  abajo: { x: number; w: number; h: number },
  contornoAbajo: ContornoDelRecorte | null | undefined,
): number | null {
  if (!contornoArriba || !contornoAbajo || bajoDelTorso === null || !(arriba.w > 0) || !(abajo.w > 0)) return null;
  const n = FRANJAS_DEL_CONTORNO;
  const masBajo = bajoDelTorso;
  let tope = Infinity;
  for (let i = 0; i < n; i++) {
    const cima = contornoAbajo.cima[i];
    if (cima === null || cima === undefined) continue;
    // La franja de la pretina, vista desde la prenda de arriba: sus dos bordes, para no dejar sin mirar un pedazo de bajo.
    const izquierda = abajo.x + (i / n) * abajo.w;
    const derecha = abajo.x + ((i + 1) / n) * abajo.w;
    const desde = Math.max(0, Math.floor(((izquierda - arriba.x) / arriba.w) * n));
    const hasta = Math.min(n - 1, Math.floor(((derecha - arriba.x) / arriba.w) * n));
    for (let j = desde; j <= hasta; j++) {
      const fondo = contornoArriba.fondo[j];
      if (fondo === null || fondo === undefined || fondo < masBajo - SALTO_DEL_CONTORNO) continue;
      tope = Math.min(tope, arriba.y + fondo * arriba.h - SOLAPE_DE_LA_UNION - cima * abajo.h);
    }
  }
  if (!Number.isFinite(tope)) return null;
  // Nunca por encima del límite: la prenda de abajo no sube más de lo razonable, aunque el contorno de arriba diga lo contrario.
  return Math.max(tope, arriba.y + masBajo * arriba.h - SUBIDA_MAXIMA_DE_LA_PRETINA * arriba.h - SOLAPE_DE_LA_UNION - 0);
}

/* ======================== El hilo de la espera (B1, Felipe 2026-10-22) ======================== */

/** En qué parte del alto de la prenda de arriba se supone su borde de abajo mientras todavía no se midió su recorte. */
export const FILA_ESTIMADA_DEL_BORDE = 0.9;
/**
 * Dónde va la prenda de abajo mientras la unión no tiene sus medidas (todavía no llegan, o no se pudieron leer): con su tamaño de siempre, pero
 * arrancando en el bajo de la prenda de arriba (el medido si ya se midió; si no, `FILA_ESTIMADA_DEL_BORDE`), donde corre el hilo. Antes se quedaba en la
 * cintura fija de la figura: con una blusa larga, la falda quedaba escondida detrás y asomaba por los costados de la cintura (Felipe, 2026-11-10).
 * `null`: no hay nada que mover (la de arriba va metida, o la caja es rara).
 */
export function cajaDeAbajoSinMedida(arriba: { caja: Caja; medida: MedidaDelRecorte | null | undefined; metida: boolean }, abajo: Caja): Caja | null {
  if (arriba.metida || !(arriba.caja.h > 0) || !(abajo.h > 0)) return null;
  const fila = arriba.medida?.filaDelBorde ?? FILA_ESTIMADA_DEL_BORDE;
  return { ...abajo, y: Math.round(arriba.caja.y + arriba.caja.h * fila - SOLAPE_DE_LA_UNION) };
}

/** Cuánto sobresale el hilo por cada lado de la cintura estándar (px de la escena). */
export const MARGEN_DEL_HILO = 14;

/** Por dónde corre el hilo mientras se espera la medida: una línea en el borde de abajo de la prenda de arriba, que es donde la unión va a poner la pretina. */
export type HiloDeLaEspera = { y: number; x0: number; x1: number };

/**
 * Dónde se «cose» mientras la unión espera su medida (la etiqueta «Ajustando tu look…» y el velo van aparte). La altura es la del borde de abajo de la prenda
 * de arriba (medido si ya se midió; si no, `FILA_ESTIMADA_DEL_BORDE`) y el largo, el de una cintura estándar con `MARGEN_DEL_HILO` por lado, centrado en la
 * escena. No es la caja final de la falda —esa todavía no se conoce—: solo dice «aquí se está uniendo».
 */
export function hiloDeLaEspera(arriba: { caja: Caja; medida: MedidaDelRecorte | null | undefined }): HiloDeLaEspera {
  const fila = arriba.medida?.filaDelBorde ?? FILA_ESTIMADA_DEL_BORDE;
  const mitad = (ANCHO_ESTANDAR_DE_LA_UNION * PX_POR_CM) / 2 + MARGEN_DEL_HILO;
  const centro = ESCENA.ancho / 2;
  return { y: Math.round(arriba.caja.y + arriba.caja.h * fila), x0: centro - mitad, x1: centro + mitad };
}

/** Lo que se ve mientras se ajusta: nada, la espera (hilo, velo y «Ajustando tu look…») o el «Listo» con que se cierra. */
export type FaseDelAjuste = "quieto" | "espera" | "listo";

/** Cuánto dura el «Listo» a la vista (ms): lo justo para leerlo, sin que estorbe. */
export const MS_DEL_LISTO = 1100;

/** La fase que sigue según si la unión está esperando su medida: quien esperaba pasa a «listo» (un cierre, no un corte); lo demás sigue como estaba. */
export function siguienteFase(fase: FaseDelAjuste, ajustando: boolean): FaseDelAjuste {
  if (ajustando) return "espera";
  return fase === "espera" ? "listo" : fase;
}

/* ======================== Para medir rápido: a qué ancho se mide, y lo que se recuerda entre visitas ======================== */

/** El ancho (px) al que la ruta baja un recorte para medirlo. Las medidas son fracciones de la imagen, así que no cambian por bajarla más chica. */
export const ANCHO_PARA_MEDIR = 256;
/** Cuántos recortes medidos se recuerdan en el navegador (los más nuevos): son tres números por prenda. */
export const MEDIDAS_QUE_SE_RECUERDAN = 300;

/* ======================== La medida la saca la tienda, no el navegador (2026-11-10) ======================== */

// Safari 26 (macOS y iOS) trae encendida para toda la navegación su protección contra la huella digital: le mete ruido a lo que una página lee de
// un lienzo (`getImageData`). Esa lectura era la medida de la unión, así que en Safari la blusa y el pantalón quedaban sin unir o mal unidos, y en
// Chrome no (Felipe, 2026-11-10, desde Safari en su Mac). La medida ahora la saca el servidor de la tienda con la MISMA función (`medirRecorte`),
// una vez por recorte: `app/api/medida/[archivo]/route.ts`. Todo navegador recibe el mismo número, y ninguna protección de privacidad lo toca.

const CARPETA_DE_RECORTES = "/storage/v1/object/public/retail-productos-fotos/recortes/";
/**
 * El nombre de un recorte del almacén: el id de la foto y un sufijo (b5595d2a-…-d73355d476fb-7ee8fc70.png). Es lo único que acepta la ruta.
 * El recorte de una foto de «Catálogo con IA» (ADR-0659) lleva en medio el nombre de su foto, que es la real más `.ia.png`
 * (`fotos/<id>.jpg.ia.png` → `recortes/<id>.jpg.ia-<sello>.png`, `rutaDelRecorte` del ERP): sin ese tramo, la ruta respondía 404 a toda prenda
 * con foto de IA y esas prendas nunca se unían con la de abajo (Felipe, 2026-11-16: el Polo Hilo sobre un pantalón más ancho que él).
 */
const NOMBRE_DE_RECORTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.[a-z0-9]{2,5}\.ia)?(?:-[0-9a-f]{1,32})?\.(?:png|webp)$/i;
/** La medida se guarda un año por su dirección: si cambia cómo se mide (`medirRecorte`), se sube este número para que se vuelva a calcular. */
export const VERSION_DE_LA_MEDIDA = 3; // 3: el ancho fila por fila para el pecho (ADR-0705)

/** ¿Es el nombre de un recorte del almacén? Nada de carpetas ni de otras direcciones. */
export const esNombreDeRecorte = (archivo: string): boolean => NOMBRE_DE_RECORTE.test(archivo);

/** La dirección del recorte en el almacén de la tienda (`origen`, el de `TIENDA_FOTOS_ORIGEN`). */
export const urlDelRecorte = (origen: string, archivo: string): string => `${origen.replace(/\/$/, "")}${CARPETA_DE_RECORTES}${archivo}`;

/** Dónde pide el navegador la medida de un recorte; `null` si la foto no es un recorte del almacén (entonces no hay unión: queda la caja de siempre). */
export function direccionDeLaMedida(url: string): string | null {
  const i = url.indexOf(CARPETA_DE_RECORTES);
  if (i < 0) return null;
  const archivo = url.slice(i + CARPETA_DE_RECORTES.length);
  return esNombreDeRecorte(archivo) ? `/api/medida/${archivo}?v=${VERSION_DE_LA_MEDIDA}` : null;
}

const esFraccion = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1);

function contornoDesdeDato(c: unknown): ContornoDelRecorte | null {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const { fondo, cima } = c as Record<string, unknown>;
  const bien = (v: unknown): v is (number | null)[] => Array.isArray(v) && v.length === FRANJAS_DEL_CONTORNO && v.every(esFraccion);
  return bien(fondo) && bien(cima) ? { fondo, cima } : null;
}

function anchosDesdeDato(a: unknown): AnchosPorFila | null {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const { centro } = a as Record<string, unknown>;
  const bien = (v: unknown): v is (number | null)[] => Array.isArray(v) && v.length === FILAS_DEL_ANCHO && v.every(esFraccion);
  return bien(centro) ? { centro } : null;
}

/** Una medida bien formada (la que responde la ruta o la que se recordó), o `null` si no lo es: un dato roto o de otra versión no rompe nada. */
export function medidaDesdeDato(m: unknown): MedidaDelRecorte | null {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const { filaDelBorde, borde, pretina, bajo, anchoBajo, contorno, anchos } = m as Record<string, unknown>;
  const perfil = Array.isArray(bajo) && bajo.length === FRANJAS_DEL_BAJO && bajo.every(esFraccion) ? (bajo as (number | null)[]) : null;
  if (esFraccion(filaDelBorde) && esFraccion(borde) && esFraccion(pretina) && (bajo == null || perfil) && (anchoBajo == null || esFraccion(anchoBajo))) {
    // Un contorno mal formado no tira la medida: sin él, la unión usa el perfil de siempre.
    const fino = contornoDesdeDato(contorno);
    // Lo mismo el ancho fila por fila: sin él, la prenda de arriba se dimensiona por su bajo, como antes.
    const porFila = anchosDesdeDato(anchos);
    return { filaDelBorde, borde, pretina, bajo: perfil, anchoBajo: anchoBajo ?? null, ...(fino ? { contorno: fino } : {}), ...(porFila ? { anchos: porFila } : {}) };
  }
  return null;
}

/** Lo que se recordó de visitas anteriores: solo lo bien formado (un texto roto o de otra versión no rompe nada). */
export function medidasDesdeTexto(texto: string | null): Map<string, MedidaDelRecorte> {
  const salida = new Map<string, MedidaDelRecorte>();
  if (!texto) return salida;
  try {
    const dato: unknown = JSON.parse(texto);
    if (!dato || typeof dato !== "object" || Array.isArray(dato)) return salida;
    for (const [url, m] of Object.entries(dato)) {
      const medida = medidaDesdeDato(m);
      if (medida) salida.set(url, medida);
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
