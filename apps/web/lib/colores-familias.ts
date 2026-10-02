import { enEscala, type ColorEnEscala } from "./color-escala";

// Familias de color: la agrupación que ven todas las pantallas que muestran colores (Nuevo producto, Agregar colores,
// Atributos → Colores) y la que valida la API. Vive aparte, UNA sola vez, para que agrupen igual (ADR-0312).
//
// EL ORDEN DE LAS FILAS es el del espectro: los dos neutros primero (la base de casi toda prenda), luego rosado → rojo →
// naranja → amarillo → verde → azul → morado, que es el círculo cromático, y al final lo que no es un matiz (metálico y
// estampado). Dentro de cada fila, el orden lo da `color-escala.ts` (gama y claridad).
//
// QUÉ ENTRA EN CADA FAMILIA — tres criterios con una prioridad escrita, de mayor a menor:
//   1. ACABADO: metálico (el color es el metal; da igual su matiz) y estampado (no tiene un tono).
//   2. ROL: neutro (sin matiz, o un blanco/arena roto: de Blanco a Negro, con Crudo, Nude, Beige y Arena) y tierra (los
//      marrones apagados de matiz cálido, de Caqui a Chocolate). Entre uno y otro no hay un hueco natural de matiz —es un
//      continuo— y la frontera se puso donde el salto entre vecinos es mayor (Arena→Camel, ΔE2000 9,3), no en medio de una
//      pareja que se confunde (Beige–Arena, 6,0).
//   3. MATIZ: todo lo demás, por el ángulo que ocupa en el círculo (OKLCH). Rosado = rojos claros o magenta vivo; naranja =
//      el matiz entre el rojo y el amarillo, vivo o pastel.
// Si un color cumple dos, manda el de menor número.
//
// ESTE ES EL ÚNICO LUGAR de la lista en código; el candado de la base (`colores_familia_color_check`) es su par y cambia
// con una migración (`20261002180000_colores_familias_rosado_naranja.sql`).
export const FAMILIAS_COLOR = [
  { valor: "neutro", texto: "Neutro" },
  { valor: "tierra", texto: "Tierra" },
  { valor: "rosado", texto: "Rosado" },
  { valor: "rojo", texto: "Rojo" },
  { valor: "naranja", texto: "Naranja" },
  { valor: "amarillo", texto: "Amarillo" },
  { valor: "verde", texto: "Verde" },
  { valor: "azul", texto: "Azul" },
  { valor: "morado", texto: "Morado" },
  { valor: "metalico", texto: "Metálico" },
  { valor: "estampado", texto: "Estampado" },
] as const;

export type FamiliaColor = (typeof FAMILIAS_COLOR)[number]["valor"];

/** ¿Es una de las familias permitidas? La API lo usa para no tener su propia copia de la lista. */
export function esFamiliaDeColor(valor: unknown): valor is FamiliaColor {
  return typeof valor === "string" && FAMILIAS_COLOR.some((f) => f.valor === valor);
}

/**
 * El orden de TODA la paleta en una sola lista plana: las familias en el orden del espectro (`FAMILIAS_COLOR`; una familia que
 * este archivo no conoce, al final) y, dentro de cada una, la escala. Es lo que usa Atributos → Colores; la carta de Nuevo
 * producto agrupa por su cuenta con `ordenarColores`, pero con la misma `enEscala`, así que las dos pantallas coinciden.
 */
export function enLaCarta(a: ColorEnEscala, b: ColorEnEscala): number {
  const fa = FAMILIAS_COLOR.findIndex((f) => f.valor === a.familiaColor);
  const fb = FAMILIAS_COLOR.findIndex((f) => f.valor === b.familiaColor);
  return (fa < 0 ? FAMILIAS_COLOR.length : fa) - (fb < 0 ? FAMILIAS_COLOR.length : fb) || enEscala(a, b);
}

export function textoDeFamilia(valor: string | null | undefined): string {
  return FAMILIAS_COLOR.find((f) => f.valor === valor)?.texto ?? "Sin familia";
}

/**
 * Fondo CSS de una muestra de color. Un color liso va EXACTO, sin velo ni degradado: es el #hex que guarda la base (medido el
 * 2026-10-02 contra una captura convertida a sRGB: diferencia media de 0,9 sobre 255). Un metálico lleva además el reflejo de un
 * metal cepillado —una banda de luz cerca del borde, otra más tenue al centro y sombra al fondo— sobre su hex: pintado plano,
 * «Plata vieja» es el mismo gris que «Gris» y «Champán» el mismo beige que «Beige» (ΔE2000 3 y 4, revisión del 2026-09-25), y la
 * muestra tiene que decir «esto es metal» antes de que alguien lea el nombre. El reflejo sale de los tokens de la paleta (crema y
 * tinta), no de un color suelto.
 */
export function fondoDeMuestra(hex: string | null, familiaColor?: string | null): string | undefined {
  if (!hex) return undefined;
  if (familiaColor !== "metalico") return hex;
  return [
    "linear-gradient(115deg,",
    "color-mix(in srgb, var(--color-crema) 78%, transparent) 0%,",
    "transparent 24%,",
    "color-mix(in srgb, var(--color-crema) 52%, transparent) 40%,",
    "transparent 54%,",
    "color-mix(in srgb, var(--color-tinta) 20%, transparent) 76%,",
    `color-mix(in srgb, var(--color-tinta) 38%, transparent) 100%), ${hex}`,
  ].join(" ");
}

/**
 * El borde de una muestra: el MISMO color, más oscuro. Un borde gris fijo se pierde sobre un negro y le quita vida a un amarillo;
 * uno del propio tono da a cada círculo un filo limpio —y a los claros (Blanco, Crudo, Perla, Vainilla) el filo que los separa del
 * fondo de la carta— sin cambiar el color que se ve adentro. Sin hex válido no hay borde propio: quien llama deja el suyo.
 */
export function bordeDeMuestra(hex: string | null | undefined): string | undefined {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? `color-mix(in srgb, ${hex} 68%, black)` : undefined;
}
