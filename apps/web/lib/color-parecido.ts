// ¿Este color se confunde con uno que ya existe? (revisión de la paleta, 2026-09-25)
//
// PROMETE: dado un hex y el vocabulario, devuelve los colores que a simple vista se ven casi iguales
//   (ΔE2000 por debajo del umbral), del más parecido al menos. Los metálicos se comparan solo entre sí y
//   los demás solo entre sí: una muestra plana de «Plata vieja» siempre se parece a «Gris», y ahí el
//   nombre y su fila son los que distinguen.
// ASUME: hex en forma #RRGGBB; los colores sin hex (o con uno mal formado) no participan.
// NO HACE: no bloquea nada. Avisa; decide la persona (Blanco y Crudo se parecen en pantalla y son dos
//   colores de verdad en textil).
//
// Por qué ΔE2000 y no «restar RGB»: es la distancia que usa la industria textil para aprobar un lote
// contra su estándar, y se parece a cómo ve el ojo (dos grises casi iguales en RGB pueden verse distintos,
// y dos azules lejanos en RGB, iguales). Por debajo de ~8, dos muestras en pantalla se confunden: con ese
// criterio se armó la paleta esencial (20260926100000).

export const UMBRAL_PARECIDO = 8;

type Lab = readonly [number, number, number];

export function esHexValido(hex: string | null | undefined): hex is string {
  return typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex);
}

/** sRGB (D65) → CIELAB. */
export function hexALab(hex: string): Lab {
  const lineal = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lineal;
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 (Sharma, Wu y Dalal, 2005), con kL = kC = kH = 1. */
export function deltaE2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const matiz = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1 = matiz(a1p, b1);
  const h2 = matiz(a2p, b2);

  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);

  const Lm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hm = h1 + h2;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) <= 180) hm = (h1 + h2) / 2;
    else hm = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cpm;
  const SH = 1 + 0.015 * Cpm * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

export function distanciaEntreHex(a: string, b: string): number {
  return deltaE2000(hexALab(a), hexALab(b));
}

type ColorComparable = { codigo: string; nombre: string; hex: string | null; familiaColor: string | null };

export function coloresParecidos<C extends ColorComparable>(
  hex: string | null,
  familiaColor: string | null,
  colores: readonly C[],
  { excluir, umbral = UMBRAL_PARECIDO }: { excluir?: string; umbral?: number } = {}
): { color: C; distancia: number }[] {
  if (!esHexValido(hex)) return [];
  const metalico = familiaColor === "metalico";
  const lab = hexALab(hex);
  return colores
    .filter((c) => c.codigo !== excluir && esHexValido(c.hex) && (c.familiaColor === "metalico") === metalico)
    .map((color) => ({ color, distancia: deltaE2000(lab, hexALab(color.hex!)) }))
    .filter((p) => p.distancia < umbral)
    .sort((a, b) => a.distancia - b.distancia);
}
