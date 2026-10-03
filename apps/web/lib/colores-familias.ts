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

/**
 * El nombre de una familia. Una que este archivo no conoce (la base la agregó antes de que el código se desplegara, o un Líder la
 * creó sin deploy) se lee por su propio valor, con mayúscula —«Turquesa»—, y no «Sin familia»: «Sin familia» es solo para el color
 * que de verdad no tiene. Así un desfase entre la base y la web degrada a un orden distinto, nunca a una mentira.
 */
export function textoDeFamilia(valor: string | null | undefined): string {
  const conocida = FAMILIAS_COLOR.find((f) => f.valor === valor);
  if (conocida) return conocida.texto;
  return valor ? valor.charAt(0).toLocaleUpperCase("es") + valor.slice(1) : "Sin familia";
}

/**
 * Agrupa colores por familia, UNA sola vez para todas las pantallas (Nuevo producto, Atributos y el filtro de Productos): primero
 * las familias que el código conoce, en su orden de espectro; luego cada familia desconocida con su propio nombre; al final, los
 * colores sin familia. Nunca se pierde ni se repite un color. Una familia sin colores no aparece.
 */
export function agruparPorFamilia<C>(
  colores: readonly C[],
  familiaDe: (c: C) => string | null | undefined,
  familias: readonly { valor: string; texto: string }[] = FAMILIAS_COLOR,
): { familia: string; texto: string; colores: C[] }[] {
  const grupos = familias
    .map((f) => ({ familia: f.valor, texto: f.texto, colores: colores.filter((c) => familiaDe(c) === f.valor) }))
    .filter((g) => g.colores.length > 0);
  const conocidas = new Set(familias.map((f) => f.valor));
  const ajenas = [...new Set(colores.map(familiaDe).filter((v): v is string => !!v && !conocidas.has(v)))];
  for (const v of ajenas) grupos.push({ familia: v, texto: textoDeFamilia(v), colores: colores.filter((c) => familiaDe(c) === v) });
  const sin = colores.filter((c) => !familiaDe(c));
  if (sin.length > 0) grupos.push({ familia: "sin-familia", texto: "Sin familia", colores: [...sin] });
  return grupos;
}

/** Una mota de luz (crema) o de sombra (tinta) a cierta opacidad: con lo único que se dibuja el jaspeado sobre el #hex. */
const luz = (pct: number) => `color-mix(in srgb, var(--color-crema) ${pct}%, transparent)`;
const sombra = (pct: number) => `color-mix(in srgb, var(--color-tinta) ${pct}%, transparent)`;

/**
 * El jaspeado de una tela melange (`colores.tipo = 'textura'`): motas de luz (crema) y de sombra (tinta) regadas sobre el hex, como
 * las fibras claras y oscuras que se hilan juntas. Un fondo CSS no puede tirar dados, así que el «azar» sale de apilar OCHO capas de
 * puntos, cada una rala y de baja opacidad, con baldosas de lado primo (5, 7, 11, 13, 17, 19, 23 y 29 px: el patrón junto no se repite
 * en ninguna muestra) y con el punto en un lugar distinto de su baldosa. Se probó con 3 a 6 capas de baldosas chicas y densas: cada
 * una es una rejilla regular y juntas se leen como malla o moiré, no como fibra (2026-10-02, ADR-0312 act. b).
 *
 * Medido en el navegador (300×300 px, el CSS real renderizado a un canvas): sobre el hex de Gris melange (#A2A2A1) el color promedio
 * se mueve +1 de 255 —el liso ya se aceptó con 0,9 de diferencia— y la desviación de la claridad es de 14 (grano visible, no sucio).
 * El equilibrio entre luz y sombra es el de un tono medio: sobre un azul marino (#1F2A44) el promedio sube 9 y sobre un perla
 * (#EAE6DD) baja 3. Hoy el único `textura` es un gris medio; el día que haya una textura muy oscura o muy clara, la mezcla se ajusta
 * por su claridad (`claridadDeHex`).
 */
const MOTAS: ReadonlyArray<readonly [color: string, enLaBaldosa: string, baldosa: number, pleno: number, suave: number]> = [
  [luz(46), "23% 31%", 5, 0.5, 0.95],
  [sombra(31), "66% 71%", 7, 0.55, 1],
  [luz(36), "31% 82%", 11, 0.6, 1.1],
  [sombra(26), "81% 24%", 13, 0.65, 1.15],
  [luz(41), "52% 46%", 17, 0.7, 1.2],
  [sombra(29), "12% 60%", 19, 0.7, 1.2],
  [luz(34), "64% 14%", 23, 0.8, 1.3],
  [sombra(24), "38% 67%", 29, 0.85, 1.35],
];
const JASPEADO = MOTAS.map(
  ([color, en, lado, pleno, suave]) => `radial-gradient(circle at ${en}, ${color} 0 ${pleno}px, transparent ${suave}px) 0 0 / ${lado}px ${lado}px`
);

/**
 * Fondo CSS de una muestra de color. Un color liso va EXACTO, sin velo ni degradado: es el #hex que guarda la base (medido el
 * 2026-10-02 contra una captura convertida a sRGB: diferencia media de 0,9 sobre 255). Un metálico lleva además el reflejo de un
 * metal cepillado —una banda de luz cerca del borde, otra más tenue al centro y sombra al fondo— sobre su hex: pintado plano,
 * «Plata vieja» es el mismo gris que «Gris» y «Champán» el mismo beige que «Beige» (ΔE2000 3 y 4, revisión del 2026-09-25), y la
 * muestra tiene que decir «esto es metal» antes de que alguien lea el nombre. El reflejo sale de los tokens de la paleta (crema y
 * tinta), no de un color suelto.
 *
 * Lo mismo pasa con `tipo` (`colores.tipo`, ADR-0312 act. b): «Gris melange» es una textura y «Gris» es liso, y con el mismo
 * tono eran dos círculos iguales. Una `textura` lleva el jaspeado de arriba sobre su hex. `estampado` no se dibuja: un dibujo no
 * se deduce de un #hex (esa foto es `imagen_muestra_url`, aún sin leer) y se queda liso. Si el color cumple dos acabados manda el
 * metálico, la misma prioridad con que se eligió su familia: una muestra dice UNA cosa. Sin `tipo` (o 'solido') va liso.
 */
export function fondoDeMuestra(hex: string | null, familiaColor?: string | null, tipo?: string | null): string | undefined {
  if (!hex) return undefined;
  if (familiaColor === "metalico") {
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
  if (tipo === "textura") return [...JASPEADO, hex].join(", ");
  return hex;
}

/**
 * El borde de una muestra: el MISMO color, más oscuro. Un borde gris fijo se pierde sobre un negro y le quita vida a un amarillo;
 * uno del propio tono da a cada círculo un filo limpio —y a los claros (Blanco, Crudo, Perla, Vainilla) el filo que los separa del
 * fondo de la carta— sin cambiar el color que se ve adentro. Sin hex válido no hay borde propio: quien llama deja el suyo.
 */
export function bordeDeMuestra(hex: string | null | undefined): string | undefined {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? `color-mix(in srgb, ${hex} 68%, black)` : undefined;
}
