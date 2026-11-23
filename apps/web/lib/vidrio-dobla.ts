// El vidrio que dobla (ADR-0681, Felipe 2026-11-18; maqueta docs/maquetas/vidrio-que-dobla-2026-11/, preset «E · Elegido»).
//
// El problema: un vidrio que solo desenfoca lo de atrás se ve como una placa lechosa. El vidrio de verdad DOBLA la luz en su canto: lo que
// pasa por el borde se ve corrido hacia adentro, como en el borde de una gota. Eso no lo hace `backdrop-filter: blur()`.
//
// Cómo se hace: un filtro SVG de desplazamiento (`feDisplacementMap`) dentro de `backdrop-filter`. El filtro necesita un MAPA: una imagen
// del tamaño de la pieza donde el rojo dice cuánto correr cada punto en horizontal y el verde en vertical (128 = no se mueve). Aquí se
// calcula ese mapa con la forma del canto y la ley de Snell. Hoy solo Chrome y Edge aceptan un filtro SVG ahí; los demás navegadores se
// quedan con el vidrio de siempre, así que nadie pierde nada.
//
// Este archivo es la parte PURA (números y texto, sin navegador), con su prueba. Lo que toca el DOM vive en
// `components/ui/useVidrioQueDobla.ts`.

/** Por dónde dobla la pieza: una cápsula o una hoja, por todo su contorno; una barra pegada a un borde de la pantalla, solo por su lado libre. */
export type LadosDelCanto = "todos" | "abajo" | "derecha";

/**
 * Qué relleno lleva la pieza mientras dobla.
 * - `claro`: una pieza de CONTROL (la cabecera, la isla del celular). Pierde casi todo su blanco y deja ver el color de lo que pasa por detrás.
 * - `propio`: una pieza que se LEE (un aviso, una hoja con su formulario). Conserva su relleno y su desenfoque de siempre, y solo dobla en el canto.
 */
export type RellenoDelVidrio = "claro" | "propio";

export type TemaDelVidrio = "claro" | "oscuro";

/** El índice de refracción del vidrio común (el aire es 1). */
const INDICE_DEL_VIDRIO = 1.5;

/** Lo que Felipe dejó puesto en la maqueta: cuánto dobla el canto, cuánto se separan los colores (el «arcoíris del canto») y la saturación. */
export const ELEGIDO = {
  curva: 0.9,
  /** Rojo, verde y azul se doblan un poco distinto, como en un prisma. */
  separacionDeColor: [1.14, 1, 0.86],
  saturacion: 1.6,
  /** El relleno claro engrosa el vidrio: al verse más lo de atrás, el canto tiene que doblar más para notarse. */
  engrosaClaro: 1.3,
} as const;

/**
 * Cuánto de lo de atrás deja pasar el relleno claro: `salida = entrada × pendiente + corte`.
 *
 * El corte es un PISO, y no es de gusto: garantiza que la letra en tinta se lea (4.5:1, WCAG 1.4.3) con CUALQUIER cosa detrás. En la maqueta
 * el piso era más bajo y se veía bien sobre prendas de colores, pero en el ERP por detrás de la cabecera pasan fotos de producto: en oscuro,
 * una foto de fondo blanco dejaba la letra en 2,4:1. Lo mide `lib/vidrio-dobla.test.ts` contra el relleno de `recetas.css`.
 *
 * Aun con el piso, pasa el doble de lo de atrás que con el vidrio de siempre (que deja pasar el 26 % en claro y el 12 % en oscuro).
 */
export const LUMINOSIDAD: Record<TemaDelVidrio, { pendiente: number; corte: number }> = {
  claro: { pendiente: 0.48, corte: 0.5 },
  oscuro: { pendiente: 0.31, corte: 0.05 },
};

/** El desenfoque del centro de una pieza de relleno claro, en px. El vidrio de siempre usa 24. */
export const DESENFOQUE_CLARO = { barra: 13, capsula: 4 } as const;

/** Cuánto se corre la luz a cada distancia del borde, de 0 (el borde) a `bisel` (donde el vidrio ya es plano), y el corrimiento máximo. */
export function perfilDelCanto(bisel: number, grosor: number, muestras = 128): { desvio: Float32Array; max: number } {
  const desvio = new Float32Array(muestras);
  let max = 0;
  for (let i = 0; i < muestras; i++) {
    // El canto es convexo, como una gota: alto = (1 − (1 − t)⁴)^¼. Pegado al borde la pendiente se va a infinito, por eso t no baja de 0,02.
    const t = Math.max(0.02, i / (muestras - 1));
    const u = 1 - (1 - t) ** 4;
    const alto = u ** 0.25;
    const pendiente = (1 - t) ** 3 * u ** -0.75;
    // Snell: n₁·sen(θ₁) = n₂·sen(θ₂). El rayo llega derecho (de frente a la pantalla) y entra a un vidrio inclinado.
    const entra = Math.atan((pendiente * grosor) / bisel);
    const sale = Math.asin(Math.sin(entra) / INDICE_DEL_VIDRIO);
    desvio[i] = Math.tan(entra - sale) * (alto * grosor + grosor * 0.5);
    if (desvio[i] > max) max = desvio[i];
  }
  return { desvio, max };
}

export type MedidasDeLaPieza = { ancho: number; alto: number; radio: number; bisel: number; grosor: number; lados: LadosDelCanto };

/** Las medidas del canto de una pieza: lo que pidió, o lo de fábrica según su forma. Una barra a ras tiene el canto más fino que una cápsula. */
export function medidasDelCanto(pieza: { ancho: number; alto: number; radio: number; lados: LadosDelCanto; relleno: RellenoDelVidrio; bisel?: number; grosor?: number }): MedidasDeLaPieza {
  const suelta = pieza.lados === "todos";
  const radio = suelta ? Math.max(0, Math.min(pieza.radio, pieza.ancho / 2, pieza.alto / 2)) : 0;
  const bisel = pieza.bisel ?? (suelta ? Math.max(6, Math.min(radio, 18)) : 14);
  const grosor = (pieza.grosor ?? (suelta ? 30 : 22)) * (pieza.relleno === "claro" ? ELEGIDO.engrosaClaro : 1);
  return { ancho: pieza.ancho, alto: pieza.alto, radio, bisel, grosor: Math.round(grosor * 10) / 10, lados: pieza.lados };
}

/** Lo que distingue un mapa de otro: dos piezas con las mismas medidas comparten el suyo. */
export const claveDelMapa = (m: MedidasDeLaPieza): string => [m.ancho, m.alto, m.radio, m.bisel, m.grosor, m.lados].join("|");

/**
 * El mapa de desplazamiento y la máscara del canto de una pieza, como píxeles RGBA (fila por fila).
 * - `mapa`: rojo = cuánto correr en horizontal, verde = en vertical; 128 no mueve. La luz entra hacia el centro de la pieza.
 * - `mascara`: blanca, opaca en el borde y transparente donde el vidrio ya es plano. Deja ver lo doblado solo en el canto.
 * - `max`: el corrimiento más grande, en px. Con eso se escala el filtro.
 */
export function mapasDelCanto(m: MedidasDeLaPieza): { mapa: Uint8ClampedArray; mascara: Uint8ClampedArray; max: number } {
  const { ancho, alto, radio, bisel, grosor, lados } = m;
  const { desvio, max } = perfilDelCanto(bisel, grosor);
  const mapa = new Uint8ClampedArray(ancho * alto * 4);
  const mascara = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const k = (y * ancho + x) * 4;
      // `hondo`: cuántos px hay hasta el borde más cercano. `nx, ny`: hacia dónde queda ese borde.
      let hondo: number;
      let nx: number;
      let ny: number;
      if (lados === "abajo") {
        hondo = alto - 0.5 - y;
        nx = 0;
        ny = 1;
      } else if (lados === "derecha") {
        hondo = ancho - 0.5 - x;
        nx = 1;
        ny = 0;
      } else {
        // Un rectángulo de esquinas redondas: en las esquinas el borde es un arco, y su normal apunta desde el centro del arco.
        const px = x + 0.5 - ancho / 2;
        const py = y + 0.5 - alto / 2;
        const qx = Math.abs(px) - (ancho / 2 - radio);
        const qy = Math.abs(py) - (alto / 2 - radio);
        hondo = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio);
        if (qx > 0 && qy > 0) {
          const largo = Math.hypot(qx, qy) || 1;
          nx = (Math.sign(px) * qx) / largo;
          ny = (Math.sign(py) * qy) / largo;
        } else if (qx > qy) {
          nx = Math.sign(px);
          ny = 0;
        } else {
          nx = 0;
          ny = Math.sign(py);
        }
      }
      mapa[k] = 128;
      mapa[k + 1] = 128;
      mapa[k + 2] = 128;
      mapa[k + 3] = 255;
      if (hondo < 0 || hondo >= bisel) continue;
      const t = hondo / bisel;
      const cuanto = max > 0 ? desvio[Math.round(t * (desvio.length - 1))] / max : 0;
      mapa[k] = 128 - nx * cuanto * 127;
      mapa[k + 1] = 128 - ny * cuanto * 127;
      mascara[k] = 255;
      mascara[k + 1] = 255;
      mascara[k + 2] = 255;
      mascara[k + 3] = 255 * (1 - t) ** 1.4;
    }
  }
  return { mapa, mascara, max };
}

const num = (n: number): string => String(Math.round(n * 100) / 100);

/** Deja pasar un solo canal de color (0 rojo, 1 verde, 2 azul) y conserva la opacidad. */
const soloCanal = (canal: number): string => `${[0, 1, 2].map((c) => (c === canal ? "1 0 0 0 0" : "0 0 0 0 0")).join(" ")} 0 0 0 1 0`;

/**
 * Lo que va dentro del `<filter>` de una pieza.
 * - El centro: lo de atrás desenfocado, como siempre.
 * - El canto: lo de atrás casi nítido y DOBLADO, tres veces (una por color, cada una un poco distinta), recortado con la máscara.
 * - Con `luminosidad`, todo se recoge hacia el claro (o hacia el oscuro) para que la letra de encima siempre se lea.
 */
export function cuerpoDelFiltro(o: {
  ancho: number;
  alto: number;
  mapa: string;
  mascara: string;
  max: number;
  desenfoque: number;
  luminosidad: { pendiente: number; corte: number } | null;
}): string {
  const imagen = (url: string, nombre: string) => `<feImage href="${url}" x="0" y="0" width="${o.ancho}" height="${o.alto}" result="${nombre}"/>`;
  const escala = o.max * 2 * ELEGIDO.curva;
  const [rojo, verde, azul] = ELEGIDO.separacionDeColor.map((s, canal) => {
    const n = ["r", "g", "b"][canal];
    return `<feDisplacementMap in="fino" in2="mapa" scale="${num(escala * s)}" xChannelSelector="R" yChannelSelector="G" result="d${n}"/><feColorMatrix in="d${n}" type="matrix" values="${soloCanal(canal)}" result="${n}"/>`;
  });
  const luz = o.luminosidad
    ? `<feComponentTransfer in="vivo">${["R", "G", "B"].map((c) => `<feFunc${c} type="linear" slope="${num(o.luminosidad!.pendiente)}" intercept="${num(o.luminosidad!.corte)}"/>`).join("")}</feComponentTransfer>`
    : "";
  return [
    imagen(o.mapa, "mapa"),
    `<feGaussianBlur in="SourceGraphic" stdDeviation="1.1" result="fino"/>`,
    rojo,
    verde,
    azul,
    `<feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/><feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" result="doblado"/>`,
    imagen(o.mascara, "mascara"),
    `<feComposite in="doblado" in2="mascara" operator="in" result="canto"/>`,
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${num(o.desenfoque)}" result="centro"/>`,
    `<feMerge result="todo"><feMergeNode in="centro"/><feMergeNode in="canto"/></feMerge>`,
    `<feColorMatrix in="todo" type="saturate" values="${num(ELEGIDO.saturacion)}"${luz ? ' result="vivo"' : ""}/>`,
    luz,
  ].join("");
}
