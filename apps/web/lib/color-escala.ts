// La escala de un color: en qué gama de su familia cae y qué tan claro es (Felipe, 2026-10-02, ADR-0312).
//
// PROMETE: un único orden para toda pantalla que muestre colores de una familia — la carta de Nuevo producto, Agregar
//   colores y Atributos → Colores. Dentro de una familia, de MENOR a MAYOR matiz (las gamas, como el círculo cromático) y,
//   dentro de cada gama, del más claro al más oscuro. Es una función del color (su #hex), no de un número guardado:
//   `colores.orden` ya no decide cómo se ve nada, así que un color recién creado cae en su lugar sin que nadie lo ubique.
// ASUME: el hex en sRGB (#RGB o #RRGGBB). Un color sin hex válido no tiene tono: va al final de su familia.
// NO HACE: no decide a qué FAMILIA pertenece un color (eso es dato: `colores.familia_color`) ni toca la base. Tampoco
//   corrige el hex: si un tono está mal puesto, la escala lo muestra mal puesto.
//
// POR QUÉ OKLCH Y NO EL BRILLO DE RGB: el orden anterior usaba brillo 0.299R+0.587G+0.114B sobre el RGB de pantalla, que
// subestima los azules y sobreestima los verdes. OKLab (Ottosson, 2020) está construido para que la «claridad» L coincida con
// lo que ve el ojo, y de él sale también el matiz (grados), que es lo que parte una familia ancha en gamas.
//
// POR QUÉ GAMAS: Azul, Verde y Morado abarcan 46–69° de matiz. Ordenadas solo por claridad, sus vecinos saltaban ~25° de matiz
// entre uno y otro (un cian junto a un ultramar, un oliva junto a un esmeralda) y la fila no se leía como escala. Con gamas el
// salto baja a 10–16° (medido sobre los 75 colores de producción, 2026-10-02). Los cortes (`CORTES_DE_GAMA`) caen en los
// huecos naturales del círculo. Los tres colores más cercanos a un corte son casi grises —Lavanda a 6°, Salvia y Azul
// Intermedio a 8°, intensidad menor de 4—: justo donde el matiz pesa menos y cualquiera de los dos lados se ve bien.

export type ColorEnEscala = { nombre: string; hex: string | null; familiaColor?: string | null };

type Oklch = { L: number; C: number; h: number };

/** Matiz (grados OKLCH) donde cada familia ancha cambia de gama. Una familia que no está aquí es de una sola gama. */
const CORTES_DE_GAMA: Readonly<Record<string, number>> = {
  verde: 135, // oliva y limón (113–127°) | verde y agua (144–177°)
  azul: 240, //  cian y petróleo (205–229°) | azul (248–274°)
  morado: 325, // violeta (307–319°) | ciruela y mora (336–353°)
};

/** El hex como OKLCH: claridad 0–1, intensidad y matiz 0–360°. `null` si no es un #hex válido. */
export function oklchDeHex(hex: string | null | undefined): Oklch | null {
  if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const c = hex.length === 4 ? hex.slice(1).replace(/./g, "$&$&") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return { L, C: Math.hypot(a, bb), h: h < 0 ? h + 360 : h };
}

/**
 * ¿El color es lo bastante claro para que encima se lea tinta oscura? Es el cruce de contraste entre tinta y crema (la claridad
 * OKLab ≈ 0,6): por encima, el ✓ de un color elegido va en tinta; por debajo, en crema. Sin hex válido, se trata como claro.
 * Reemplaza al brillo del RGB, que ponía un ✓ blanco sobre el turquesa (contraste 2,2) y el esmeralda.
 */
export function esColorClaro(hex: string | null | undefined): boolean {
  const o = oklchDeHex(hex);
  return !o || o.L > 0.6;
}

/** La gama dentro de su familia: 0 (la de menor matiz) o 1. Sin hex válido cae en la última, junto al final de la fila. */
export function gamaDeColor(familiaColor: string | null | undefined, hex: string | null | undefined): number {
  const corte = familiaColor ? CORTES_DE_GAMA[familiaColor] : undefined;
  if (corte === undefined) return 0;
  const o = oklchDeHex(hex);
  return !o ? 1 : o.h >= corte ? 1 : 0;
}

/**
 * Comparador de la carta: gama, luego del más claro al más oscuro, luego por nombre (para que el orden sea siempre el mismo
 * con la lista al derecho o al revés). Sin hex válido, al final.
 */
export function enEscala(a: ColorEnEscala, b: ColorEnEscala): number {
  const oa = oklchDeHex(a.hex);
  const ob = oklchDeHex(b.hex);
  if (!oa && !ob) return a.nombre.localeCompare(b.nombre, "es");
  if (!oa) return 1;
  if (!ob) return -1;
  return gamaDeColor(a.familiaColor, a.hex) - gamaDeColor(b.familiaColor, b.hex) || ob.L - oa.L || a.nombre.localeCompare(b.nombre, "es");
}

/**
 * Parte los colores de UNA familia —ya ordenados con `enEscala`— en sus gamas, para que la pantalla deje un respiro entre una y
 * otra. Concatenar los bloques devuelve exactamente la entrada: nunca se pierde ni se repite un color.
 */
export function partirEnGamas<C extends ColorEnEscala>(colores: readonly C[]): C[][] {
  const bloques: C[][] = [];
  let anterior: number | null = null;
  for (const c of colores) {
    const gama = gamaDeColor(c.familiaColor, c.hex);
    if (gama !== anterior) bloques.push([]);
    bloques[bloques.length - 1].push(c);
    anterior = gama;
  }
  return bloques;
}
