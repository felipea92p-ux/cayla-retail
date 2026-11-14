// Los colores de una prenda, leídos de su foto (ADR-0663, Felipe 2026-11-13: «ya no se debe seleccionar los colores sino que a partir
// de la foto se colocarían»).
//
// PROMETE: dados los píxeles de una foto (RGBA, ya achicada) y la carta de colores, dice de qué colores de la carta es la prenda y cuánto
//   ocupa cada uno, y qué clase de prenda parece: de un color (`liso`), de 2 a 4 en zonas grandes (`mezcla`, ADR-0643), con un dibujo
//   que se repite (`estampado`, ADR-0634), de más de 4 (`muchos`) o una foto donde no se encontró la prenda (`sin-prenda`). Es la misma
//   respuesta para la misma foto: sin azar, sin red, sin IA, en el navegador (< 1 s).
// ASUME: la foto ya viene achicada (~220 px de lado: ver `pixelesDeLaFoto`); la carta trae el hex de cada color.
// NO HACE: no elige por la persona lo que no está claro. Una parte que queda lejos de todo color de la carta (`distancia` > `carta`)
//   sale sin color propuesto (`propuestaInicial` → null) y la pantalla pregunta. No crea colores ni mezclas: eso lo hace quien llama.
//
// Cómo lee, en cinco pasos:
//   1. Solo la prenda: lo opaco del PNG sin fondo (la foto de la IA); si la foto tiene fondo, se recorre desde el borde hacia adentro con
//      lo que se parece al borde, y se frena en el contorno de la prenda (una blusa crema sobre papel blanco no se borra entera).
//   2. k-medias en Lab con k = 8 y arranque determinista (el punto más lejano): los tonos que hay.
//   3. Los tonos del mismo color se juntan: ΔE2000 con la luz a la mitad (kL = 2, la regla CMC 2:1 de los textiles) bajo `tono`. La luz y
//      los pliegues no vuelven una blusa vino «Vino con marsala».
//   4. Cada grupo va al color más parecido de la carta (por su promedio), y dos grupos que caen en el mismo color son uno. Probado en la
//      maqueta: comparar el tono que más se repite en vez del promedio arregla un negro con brillo y oscurece un vino con sombra.
//   5. Lo que ocupa menos de `detalle` (botones, etiqueta) no cuenta. Si más de `dibujo` de los píxeles vecinos cambia de color, parece
//      un dibujo: estampado.
//
// DESCARTÉ: pedirle los colores a la IA (25 s y costo por foto, y responde con nombres sueltos que igual habría que llevar a la carta);
// mediana o «el tono que más se repite» como representante del grupo (ver paso 4).

import { componentesDeMezcla, esCombinado } from "./color-combinado";
import { esEstampado } from "./color-estampado-reglas";
import { deltaE2000, esHexValido, hexALab, UMBRAL_PARECIDO, type Lab } from "./color-parecido";

export type PixelesRGBA = { ancho: number; alto: number; datos: ArrayLike<number> };

export type ColorDeCarta = {
  codigo: string;
  nombre: string;
  hex: string | null;
  familiaColor?: string | null;
  tipo?: string | null;
  componentes?: readonly string[] | null;
  activo?: boolean;
};

export type Umbrales = {
  /** Lo que ocupa menos que esto (0 a 1) es un detalle: un botón, una etiqueta. */
  detalle: number;
  /** Dos tonos bajo esta distancia (ΔE2000 con kL = 2) son el mismo color con otra luz. */
  tono: number;
  /** Si cambia de color más que esto (0 a 1) entre píxeles vecinos, parece un dibujo. */
  dibujo: number;
  /** Una parte a más de esto (ΔE2000) del color más parecido no está en la carta. El «casi igual» de todo el ERP. */
  carta: number;
};

/** Calibrados con la maqueta (docs/maquetas/colores-desde-la-foto-2026-11/). La actividad 2 de ADR-0663 los mide con fotos reales. */
export const UMBRALES: Umbrales = { detalle: 0.08, tono: 10, dibujo: 0.04, carta: UMBRAL_PARECIDO };

export type ParteLeida<C extends ColorDeCarta = ColorDeCarta> = {
  /** El color más parecido de la carta. */
  color: C;
  /** Cuán lejos queda de ese color (ΔE2000). */
  distancia: number;
  /** Cuánto de la prenda ocupa (0 a 1). */
  parte: number;
  /** El tono que se ve en la foto, como #rrggbb (el promedio de sus píxeles). */
  visto: string;
};

export type Lectura<C extends ColorDeCarta = ColorDeCarta> =
  | { tipo: "sin-prenda"; transparente: boolean }
  | {
      tipo: "liso" | "mezcla" | "estampado" | "muchos";
      /** Las partes que cuentan, de la que más ocupa a la que menos. */
      partes: ParteLeida<C>[];
      /** Lo que no cuenta por chico. */
      detalles: ParteLeida<C>[];
      /** Cuánto cambia de color entre píxeles vecinos (0 a 1). */
      dibujo: number;
      /** Cuántos tonos vio antes de juntarlos. */
      tonosVistos: number;
      /** La foto venía sin fondo (PNG transparente). */
      transparente: boolean;
      /** Con fondo: el color de la carta al que se parece el fondo, si se parece a uno. Lo de ese color en la prenda pudo quedar fuera. */
      fondoComo: C | null;
    };

/** Con qué colores de la carta se compara: los de un solo tono, con su muestra. Una mezcla o un estampado no se ven en un píxel. */
export function cartaComparable<C extends ColorDeCarta>(carta: readonly C[]): C[] {
  return carta.filter((c) => c.activo !== false && esHexValido(c.hex) && !esCombinado(c) && !esEstampado(c));
}

// sRGB (D65) → CIELAB, con las mismas constantes que `hexALab` (un píxel no pasa por texto: son ~48 000 por foto).
const LINEAL = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
function rgbALab(R: number, G: number, B: number): Lab {
  const r = LINEAL[R],
    g = LINEAL[G],
    b = LINEAL[B];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x),
    fy = f(y),
    fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const d76 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** Opaco de verdad: lo que la IA deja a medias en el borde de la prenda no cuenta (ADR-0442 usa 240 para lo mismo). */
const OPACO = 240;
/** El fondo se recorre hasta este ΔE76 del color del borde. */
const FONDO = 12;
/** Si al quitar el fondo queda menos que esto de la foto, la foto no tenía fondo (la tela llena el cuadro). */
const QUEDA_PRENDA = 0.05;
const K = 8;
const VUELTAS = 10;
const MUESTRA = 12000;
/** Con menos píxeles de prenda que esto, no hay prenda que leer. */
const MINIMO = 150;

type Grupo = { peso: number; L: number; a: number; b: number; r: number; g: number; bl: number; tonos: number[] };

export function leerColores<C extends ColorDeCarta>(pix: PixelesRGBA, carta: readonly C[], u: Umbrales = UMBRALES): Lectura<C> {
  const { ancho: W, alto: H, datos: d } = pix;
  const N = W * H;
  const comparables = cartaComparable(carta).map((c) => ({ c, lab: hexALab(c.hex!) }));
  const masParecido = (l: Lab) => {
    let mejor = comparables[0];
    let dist = Infinity;
    for (const x of comparables) {
      const e = deltaE2000(l, x.lab);
      if (e < dist) {
        dist = e;
        mejor = x;
      }
    }
    return { color: mejor?.c, distancia: dist };
  };

  // 1. Solo la prenda.
  const borde: number[] = [];
  for (let x = 0; x < W; x++) borde.push(x, (H - 1) * W + x);
  for (let y = 1; y < H - 1; y++) borde.push(y * W, y * W + W - 1);
  const transparente = borde.filter((i) => d[i * 4 + 3] < OPACO).length > borde.length * 0.2;
  const lab: (Lab | undefined)[] = new Array(N);
  const mascara = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (d[i * 4 + 3] < OPACO) continue;
    lab[i] = rgbALab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    mascara[i] = 1;
  }
  let fondo: Lab | null = null;
  if (!transparente) {
    const delBorde = borde.filter((i) => mascara[i]).map((i) => lab[i]!).sort((a, b) => a[0] - b[0]);
    fondo = delBorde[Math.floor(delBorde.length / 2)] ?? null;
    if (fondo) {
      const antes = mascara.slice();
      const pila = borde.filter((i) => mascara[i] && d76(lab[i]!, fondo!) < FONDO * FONDO);
      for (const i of pila) mascara[i] = 0;
      while (pila.length) {
        const i = pila.pop()!;
        const x = i % W,
          y = (i - x) / W;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
          if (j >= 0 && mascara[j] && d76(lab[j]!, fondo) < FONDO * FONDO) {
            mascara[j] = 0;
            pila.push(j);
          }
        }
      }
      // Si «el fondo» se llevó casi toda la foto, no había fondo: es una foto de cerca y la tela llena el cuadro.
      let quedan = 0;
      for (let i = 0; i < N; i++) quedan += mascara[i];
      if (quedan < N * QUEDA_PRENDA) {
        mascara.set(antes);
        fondo = null;
      }
    }
  }
  const prenda: number[] = [];
  for (let i = 0; i < N; i++) if (mascara[i]) prenda.push(i);
  if (prenda.length < MINIMO || comparables.length === 0) return { tipo: "sin-prenda", transparente };

  // 2. Los tonos que hay: k-medias con arranque determinista.
  const paso = Math.max(1, Math.floor(prenda.length / MUESTRA));
  const muestra = prenda.filter((_, j) => j % paso === 0);
  const media: Lab = [0, 1, 2].map((k) => muestra.reduce((s, i) => s + lab[i]![k], 0) / muestra.length) as unknown as Lab;
  const candidatos = muestra.filter((_, j) => j % Math.max(1, Math.floor(muestra.length / 1500)) === 0);
  let centros: Lab[] = [lab[candidatos.reduce((m, i) => (d76(lab[i]!, media) < d76(lab[m]!, media) ? i : m), candidatos[0])]!];
  while (centros.length < Math.min(K, candidatos.length)) {
    let lejos = candidatos[0];
    let dmax = -1;
    for (const i of candidatos) {
      let dm = Infinity;
      for (const c of centros) dm = Math.min(dm, d76(lab[i]!, c));
      if (dm > dmax) {
        dmax = dm;
        lejos = i;
      }
    }
    if (dmax <= 0) break;
    centros.push(lab[lejos]!);
  }
  const masCerca = (l: Lab) => {
    let m = 0;
    let dm = Infinity;
    for (let k = 0; k < centros.length; k++) {
      const e = d76(l, centros[k]);
      if (e < dm) {
        dm = e;
        m = k;
      }
    }
    return m;
  };
  for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
    const s = centros.map(() => [0, 0, 0, 0]);
    for (const i of muestra) {
      const k = masCerca(lab[i]!);
      s[k][0] += lab[i]![0];
      s[k][1] += lab[i]![1];
      s[k][2] += lab[i]![2];
      s[k][3]++;
    }
    centros = centros.map((c, k) => (s[k][3] ? ([s[k][0] / s[k][3], s[k][1] / s[k][3], s[k][2] / s[k][3]] as const) : c));
  }
  const tonoDe = new Int16Array(N).fill(-1);
  const tonos = centros.map(() => ({ peso: 0, L: 0, a: 0, b: 0, r: 0, g: 0, bl: 0 }));
  for (const i of prenda) {
    const k = masCerca(lab[i]!);
    tonoDe[i] = k;
    const t = tonos[k];
    t.peso++;
    t.L += lab[i]![0];
    t.a += lab[i]![1];
    t.b += lab[i]![2];
    t.r += d[i * 4];
    t.g += d[i * 4 + 1];
    t.bl += d[i * 4 + 2];
  }
  const vivos = tonos.map((t, k) => ({ ...t, k, lab: [t.L / t.peso, t.a / t.peso, t.b / t.peso] as Lab })).filter((t) => t.peso > 0);

  // 3. Los tonos del mismo color, juntos.
  const padre = vivos.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < vivos.length; i++) {
    for (let j = i + 1; j < vivos.length; j++) if (deltaE2000(vivos[i].lab, vivos[j].lab, 2) < u.tono) padre[raiz(j)] = raiz(i);
  }
  const grupos = new Map<number, Grupo>();
  vivos.forEach((t, i) => {
    const r = raiz(i);
    const g = grupos.get(r) ?? { peso: 0, L: 0, a: 0, b: 0, r: 0, g: 0, bl: 0, tonos: [] };
    g.peso += t.peso;
    g.L += t.L;
    g.a += t.a;
    g.b += t.b;
    g.r += t.r;
    g.g += t.g;
    g.bl += t.bl;
    g.tonos.push(t.k);
    grupos.set(r, g);
  });

  // 4. Cada grupo, a su color de la carta; dos grupos en el mismo color son uno.
  const porColor = new Map<string, { color: C; distancia: number } & Grupo>();
  for (const g of grupos.values()) {
    const { color, distancia } = masParecido([g.L / g.peso, g.a / g.peso, g.b / g.peso]);
    const x = porColor.get(color!.codigo);
    if (x) {
      x.peso += g.peso;
      x.L += g.L;
      x.a += g.a;
      x.b += g.b;
      x.r += g.r;
      x.g += g.g;
      x.bl += g.bl;
      x.tonos.push(...g.tonos);
    } else porColor.set(color!.codigo, { color: color!, distancia, ...g, tonos: [...g.tonos] });
  }
  // La distancia de un color que juntó dos grupos es la de su promedio, no la del grupo más cercano.
  const todas = [...porColor.values()]
    .map((x) => ({
      color: x.color,
      distancia: deltaE2000([x.L / x.peso, x.a / x.peso, x.b / x.peso], hexALab(x.color.hex!)),
      parte: x.peso / prenda.length,
      visto: `#${hex2(x.r / x.peso)}${hex2(x.g / x.peso)}${hex2(x.bl / x.peso)}`,
      tonos: x.tonos,
    }))
    .sort((a, b) => b.parte - a.parte || (a.color.codigo < b.color.codigo ? -1 : 1));
  const cuentan = todas.filter((x) => x.parte >= u.detalle);
  const detalles = todas.filter((x) => x.parte < u.detalle);

  // 5. ¿Un dibujo? Cuántas veces cambia de parte entre dos píxeles vecinos de la prenda (los detalles no cuentan).
  const parteDelTono = new Int16Array(centros.length).fill(-1);
  cuentan.forEach((x, p) => x.tonos.forEach((k) => (parteDelTono[k] = p)));
  let pares = 0;
  let cambia = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mascara[i]) continue;
      const pi = parteDelTono[tonoDe[i]];
      if (pi < 0) continue;
      for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1]) {
        if (j < 0 || !mascara[j]) continue;
        const pj = parteDelTono[tonoDe[j]];
        if (pj < 0) continue;
        pares++;
        if (pi !== pj) cambia++;
      }
    }
  }
  const dibujo = pares ? cambia / pares : 0;
  const tipo = cuentan.length > 4 ? "muchos" : cuentan.length >= 2 && dibujo > u.dibujo ? "estampado" : cuentan.length >= 2 ? "mezcla" : "liso";
  const sinTonos = (x: (typeof todas)[number]): ParteLeida<C> => ({ color: x.color, distancia: x.distancia, parte: x.parte, visto: x.visto });
  const fondoComo = fondo ? masParecido(fondo) : null;
  return {
    tipo,
    partes: cuentan.map(sinTonos),
    detalles: detalles.map(sinTonos),
    dibujo,
    tonosVistos: vivos.length,
    transparente,
    fondoComo: fondoComo && fondoComo.distancia <= u.carta ? fondoComo.color! : null,
  };
}

/**
 * El color que se propone para cada parte, en orden (la base primero): el de la carta si está cerca; `null` si queda lejos y hay que
 * preguntar («Usar X» o «Crear este color»). Un estampado, «muchos» o una foto sin prenda no proponen partes: preguntan otra cosa.
 */
export function propuestaInicial(lectura: Lectura, u: Umbrales = UMBRALES): (string | null)[] {
  if (lectura.tipo !== "liso" && lectura.tipo !== "mezcla") return [];
  return lectura.partes.slice(0, 4).map((p) => (p.distancia <= u.carta ? p.color.codigo : null));
}

/**
 * La llave de un color de la prenda, para juntar en una sola tarjeta las fotos del mismo color (la espalda no es otro color): un color
 * es su código; una mezcla, sus componentes como los guarda la base (la base primero y los acompañantes ordenados: `componentesDeMezcla`).
 */
export function llaveDelColor(codigos: readonly string[]): string {
  const unicos = codigos.filter((c, i) => codigos.indexOf(c) === i);
  if (unicos.length <= 1) return unicos[0] ?? "";
  return componentesDeMezcla(unicos[0], unicos.slice(1)).join(",");
}
