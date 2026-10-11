/**
 * Las VARIANTES del Plan del piso: de qué colores es lo que cuelga de cada grupo (Felipe, 2026-10-11: «un solo color está genial, pero mostrar las variantes»;
 * ADR-0352, actualización 2026-10-11 (c)).
 *
 * El riel de perchas pintaba cada grupo de un solo color (el del grupo). Ahora cada percha toma el color de una variante que de verdad cuelga, en proporción a
 * lo que hay: 150 polos con 60 negros, 48 blancos y 42 beige son 7,5 perchas (8 lugares) → 3 negras, 3 blancas y 2 beige. El color del grupo sigue
 * mandando donde se necesita saber DE QUÉ GRUPO es (el poste del tramo, las fichas, la mancuerna).
 *
 * LA REGLA: una percha, un color. Una percha vale 20 prendas y esas 20 pueden ser de varios colores, pero una percha con franjas a 15 px se ve como ruido. Por
 * eso un color que no llega a media percha (`MINIMO_DE_COLOR`) no gana una propia y se junta en «Otros colores», un gris neutro. Un color que no es un color
 * (Estampado, Multicolor: sin `colores.hex`) también va ahí.
 *
 * DE DÓNDE SALE EL DATO. De `LecturaDelPiso.tallas` (`fn_piso_plan_lectura`), que ya trae el color de cada variante y lo libre en el piso: la MISMA cuenta que
 * `colgadas` en `mix-piso.ts`, así que los colores de un grupo siempre suman lo que el grupo dice que cuelga. No hay datos nuevos ni migración.
 *
 * «CÓMO QUEDARÍA» NO ELIGE COLORES. La propuesta reparte lugares entre grupos, no colores; el riel de la propuesta repite la mezcla de HOY de cada grupo
 * para que se parezca a lo que ya conoces. La pantalla lo dice al pie (`NOTA_DE_COLORES`): no se lee como «compra los mismos colores».
 *
 * LÓGICA PURA: sin red ni React. El hex es DATO de la prenda, no color de la interfaz (ADR-0169, como `color-prenda-reglas.ts`).
 */
import { estiloMosaicoColor } from "./color-prenda-reglas";
import { cifraEs } from "./mix-piso-visual";

/** Un color de lo que cuelga de un grupo: su nombre, su `#rrggbb` (`null` si no es un color: Estampado, Multicolor) y cuántas prendas libres hay en el piso. */
export type ColorDelGrupo = { clave: string; nombre: string; hex: string | null; prendas: number };

/** El color de una percha: `hex: null` es «Otros colores» (el gris neutro de la interfaz, no un color de prenda). */
export type ColorDePercha = { clave: string; nombre: string; hex: string | null };

/** Lo que dice el pie del riel sobre los colores. */
export const NOTA_DE_COLORES = "Los colores son los de lo que cuelga hoy: «Cómo quedaría» repite esa mezcla, no elige colores.";

/** Los colores que no juntan al menos esta parte de una percha (0,5 = 10 prendas con una percha de 20) no ganan una propia: van a «Otros colores». */
export const MINIMO_DE_COLOR = 0.5;
/** Cuántas prendas lleva el ícono de un grupo en las fichas y las tarjetas (una por color principal): con más, a 19 px de alto, no se distinguen. */
export const MAX_COLORES_DEL_ICONO = 3;

export const OTROS_COLORES: ColorDePercha = { clave: "otros", nombre: "Otros colores", hex: null };

type TallaConColor = { colorCodigo: string | null; color: string | null; colorHex: string | null; pisoLibre: number };

/** Suma lo libre de una talla al color que le toca en `acum` (una entrada por color). Lo que no es una cuenta (NaN, negativo, cero) no suma. */
export function sumarColor(acum: Map<string, ColorDelGrupo>, t: TallaConColor): void {
  const prendas = Number.isFinite(t.pisoLibre) && t.pisoLibre > 0 ? t.pisoLibre : 0;
  if (prendas === 0) return;
  const nombre = (t.color ?? "").trim();
  const clave = (t.colorCodigo ?? "").trim() || nombre.toLowerCase() || "sin-color";
  const hex = estiloMosaicoColor(t.colorHex)?.fondo ?? null;
  const previo = acum.get(clave);
  if (previo) {
    previo.prendas += prendas;
    if (previo.hex === null && hex !== null) previo.hex = hex;
  } else acum.set(clave, { clave, nombre: nombre || "Sin color", hex, prendas });
}

/** Del que más cuelga al que menos; a igual cantidad, por nombre: el orden no depende de cómo llegó la lectura. */
const masPrimero = (a: ColorDelGrupo, b: ColorDelGrupo) => b.prendas - a.prendas || a.nombre.localeCompare(b.nombre, "es") || a.clave.localeCompare(b.clave);

/** Los colores de un grupo, del que más cuelga al que menos. */
export function ordenarColores(acum: ReadonlyMap<string, ColorDelGrupo> | undefined): ColorDelGrupo[] {
  if (!acum) return [];
  return [...acum.values()].sort(masPrimero);
}

/**
 * El color de cada percha de un tramo, de izquierda a derecha: `llenas` perchas enteras y, si `resto > 0`, una angosta al final. Es un reparto de resto mayor (el
 * mismo de `repartirEnPrendas`): cada color se lleva las perchas que le tocan por lo que cuelga, la suma da EXACTAMENTE las perchas del tramo y ningún color se
 * aparta de su parte en más de una percha. Los más abundantes van primero y «Otros colores» al final, así un color es siempre un bloque seguido.
 *
 * Un color con al menos media percha (`MINIMO_DE_COLOR`) tiene SIEMPRE una percha propia, aunque el redondeo se la quitara: quien ve un tramo sin ese color sabe que
 * hay menos de media percha de él. Lo que no llega, y lo que no es un color (sin hex), se junta en «Otros colores». Sin mezcla (grupo sin colores conocidos), todas
 * quedan en `null`: quien dibuja usa el color del grupo, como antes.
 */
export function coloresDeLasPerchas(mezcla: readonly ColorDelGrupo[], llenas: number, resto: number): (ColorDePercha | null)[] {
  const enteras = Number.isFinite(llenas) && llenas > 0 ? Math.floor(llenas) : 0;
  const lugares = enteras + (resto > 0 ? 1 : 0);
  const total = mezcla.reduce((s, c) => s + (c.prendas > 0 ? c.prendas : 0), 0);
  if (lugares === 0 || !(total > 0)) return Array.from({ length: lugares }, () => null);

  // Quiénes tienen percha propia: los colores de verdad que juntan al menos media. Si ninguno llega (un tramo de una sola percha con colores parejos), el mayor.
  const conColor = mezcla.filter((c) => c.hex !== null && c.prendas > 0).sort(masPrimero);
  let propios = conColor.filter((c) => (c.prendas / total) * lugares >= MINIMO_DE_COLOR);
  if (propios.length === 0 && conColor.length > 0) propios = [conColor[0]!];
  const prendasPropias = propios.reduce((s, c) => s + c.prendas, 0);
  const entradas: { color: ColorDePercha; prendas: number; propio: boolean }[] = propios.map((c) => ({ color: { clave: c.clave, nombre: c.nombre, hex: c.hex }, prendas: c.prendas, propio: true }));
  if (total - prendasPropias > 0) entradas.push({ color: OTROS_COLORES, prendas: total - prendasPropias, propio: false });

  // Resto mayor: cada entrada se lleva la parte entera de su cuota y las perchas que faltan van a quienes tienen el resto más grande (a igual resto, el más abundante).
  const cuotas = entradas.map((e) => (e.prendas / total) * lugares);
  const cuenta = cuotas.map((q) => Math.floor(q + 1e-9));
  let faltan = lugares - cuenta.reduce((a, b) => a + b, 0);
  const porResto = cuotas.map((q, i) => ({ i, resto: q - cuenta[i]! })).sort((a, b) => b.resto - a.resto || entradas[b.i]!.prendas - entradas[a.i]!.prendas || a.i - b.i);
  for (const { i } of porResto) {
    if (faltan <= 0) break;
    cuenta[i]!++;
    faltan--;
  }
  // La garantía: un color propio nunca queda sin su percha. La toma de quien más tiene (y le sobra: más de una).
  entradas.forEach((e, i) => {
    if (!e.propio || cuenta[i]! > 0) return;
    let donante = -1;
    cuenta.forEach((c, k) => {
      if (c > 1 && (donante === -1 || c > cuenta[donante]!)) donante = k;
    });
    if (donante === -1) return;
    cuenta[donante]!--;
    cuenta[i]!++;
  });

  return entradas.flatMap((e, i) => Array.from({ length: cuenta[i]! }, () => e.color));
}

/**
 * Los colores del ícono de un grupo en las fichas y las tarjetas: sus colores principales (hasta `MAX_COLORES_DEL_ICONO`), del que más cuelga al que menos, cada uno
 * un `#rrggbb` de verdad (un color que no es un color, Estampado o Multicolor, no se dibuja). El ícono los pone como hasta tres prendas pequeñas superpuestas, como
 * las perchas del riel; vacío si el grupo no tiene ni un color conocido y el ícono queda del color del grupo.
 */
export function coloresDelIcono(mezcla: readonly ColorDelGrupo[]): string[] {
  const hexes: string[] = [];
  for (const c of [...mezcla].sort(masPrimero)) {
    if (c.hex !== null && c.prendas > 0 && !hexes.includes(c.hex)) hexes.push(c.hex);
    if (hexes.length === MAX_COLORES_DEL_ICONO) break;
  }
  return hexes;
}

/** Cuántos colores nombra el texto de un grupo antes de juntar el resto en «otros colores». */
export const MAX_COLORES_EN_TEXTO = 4;

/** «Negro 60 · Blanco 45 · Beige 45 · otros colores 12»: lo que dice el tramo al pasar por él. Vacío si no hay colores. */
export function textoDeColores(mezcla: readonly ColorDelGrupo[]): string {
  const con = mezcla.filter((c) => c.prendas > 0);
  if (con.length === 0) return "";
  const primeros = con.slice(0, MAX_COLORES_EN_TEXTO);
  const otros = con.slice(MAX_COLORES_EN_TEXTO).reduce((s, c) => s + c.prendas, 0);
  const partes = primeros.map((c) => `${c.nombre} ${cifraEs(c.prendas)}`);
  if (otros > 0) partes.push(`otros colores ${cifraEs(otros)}`);
  return partes.join(" · ");
}
