// El dibujo de cada insignia (Catálogo ▸ Insignias): UN solo vocabulario para el ERP y la tienda online (ADR-0489, Felipe 2026-10-23: «en la
// insignia de Halloween, además de decir Halloween, que ponga la calabaza, tal y como se ve en el retail»).
//
// Hasta el 2026-10-23 vivía en el ERP (`lib/etiqueta-visual.ts` y `components/MuestraEtiqueta.tsx`) y la tienda no podía usarlo: no importa
// de `apps/web`. Se mudó aquí, como el logo (`marca.ts`): un dibujo, compartido, y cada app lo pinta en su marco.
//
// PROMETE: (1) `iconoDeInsignia(nombre)`: de qué familia es una insignia por su NOMBRE (un Líder puede crear insignias nuevas, así que el
//   nombre es lo único estable; «Para liquidar — Tienda AQP» comparte el dibujo de «Para liquidar»); `null` si no se reconoce, y entonces
//   se dibuja `generico` (una etiqueta es siempre «una etiqueta»: no es un dibujo falso). (2) `DIBUJOS_DE_INSIGNIA`: cada familia, como DATOS
//   (nunca React: el ERP y la tienda lo pintan con su propio componente), centrado en (0,0) dentro de ±14 unidades.
// ASUME: quien lo pinta resuelve los tres colores con nombre —`$acento` (el trazo o relleno principal), `$hueco` (lo que se ve «recortado»:
//   la cara de la calabaza, la crema de la bandera) y `$tinta` (el negro fijo del Black Friday)— y respeta el ORDEN de los atributos de cada
//   pieza (el ERP lo comprobó byte a byte contra el dibujo anterior). Sin ningún color suelto aquí: el color lo pone cada lugar.
// SE ROMPE SI: se agrega una familia en `REGLAS` y no en `DIBUJOS_DE_INSIGNIA` (TypeScript lo impide: el `Record` es total) o si dos reglas
//   pueden coincidir y la más específica queda detrás (el orden importa: «galentine» antes de «valentin»).

export type IconoInsignia =
  | "nuevo"
  | "ultimas"
  | "top"
  | "liquidar"
  | "manual"
  | "unica"
  | "reedicion"
  | "valentin"
  | "galentine"
  | "madre"
  | "mujer"
  | "halloween"
  | "navidad"
  | "findeano"
  | "patrias"
  | "blackfriday"
  | "cyberwow"
  | "aniversario"
  | "gato"
  | "perro"
  | "tierra";

/** Sin tildes, minúsculas y sin dobles espacios: «  Animal  PRINT » y «animal print» son el mismo nombre (como `fn_clave_texto`, en la base). */
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// El orden importa cuando dos reglas pueden coincidir: "galentine" antes que "valentin" (Galentine's Day es la fiesta de amigas, no la de
// pareja) y "black friday"/"cyber" antes que cualquier regla de rebaja genérica.
const REGLAS: ReadonlyArray<readonly [IconoInsignia, RegExp]> = [
  ["galentine", /\bgalentine/],
  ["valentin", /\bvalentin\b/],
  ["blackfriday", /\bblack\s*friday\b/],
  ["cyberwow", /\bcyber/],
  ["aniversario", /\baniversario\b/],
  ["madre", /\bdia de la madre\b/],
  ["mujer", /\bdia de la mujer\b/],
  ["tierra", /\bdia de la tierra\b/],
  ["gato", /\bgato\b/],
  ["perro", /\bperro\b/],
  ["patrias", /\b(fiestas patrias|patrias|independencia)\b/],
  ["halloween", /\b(halloween|noche de brujas)\b/],
  ["navidad", /\b(navidad|navideno|navidena)\b/],
  ["findeano", /\b(fin de ano|ano nuevo|nochevieja|noche vieja)\b/],
  ["ultimas", /\bultimas?\b/],
  ["top", /\b(top ventas|mas vendid[oa]s?|best ?seller)\b/],
  ["liquidar", /\b(liquidar|liquidacion|outlet|rebaja|remate)\b/],
  ["manual", /\b(hecho a mano|artesanal|handmade)\b/],
  ["unica", /\b(pieza unica|unica)\b/],
  ["reedicion", /\b(reedicion|reedit|re-edicion)\b/],
  ["nuevo", /\b(nuevo|nueva|nuevos|nuevas|novedad|novedades)\b/],
];

/** La familia de una insignia por su nombre, o `null` si no se reconoce (se dibuja `generico`). */
export function iconoDeInsignia(nombre: string): IconoInsignia | null {
  const limpio = normalizarNombre(nombre);
  for (const [icono, regla] of REGLAS) {
    if (regla.test(limpio)) return icono;
  }
  return null;
}

/** Los colores con nombre de un dibujo: quien lo pinta los resuelve a lo que le toca en su marco. */
export type ColorDeInsignia = "$acento" | "$hueco" | "$tinta";

/** Una pieza SVG: su etiqueta y sus atributos en el orden en que se escriben (los nombres son los de React: `strokeWidth`, no `stroke-width`). */
export type PiezaDeInsignia = {
  tag: "path" | "rect" | "circle" | "ellipse" | "g";
  props: Readonly<Record<string, string | number>>;
  hijos?: readonly PiezaDeInsignia[];
};

const A: ColorDeInsignia = "$acento";
const H: ColorDeInsignia = "$hueco";
const T: ColorDeInsignia = "$tinta";

const path = (props: PiezaDeInsignia["props"]): PiezaDeInsignia => ({ tag: "path", props });
const rect = (props: PiezaDeInsignia["props"]): PiezaDeInsignia => ({ tag: "rect", props });
const circle = (props: PiezaDeInsignia["props"]): PiezaDeInsignia => ({ tag: "circle", props });
const ellipse = (props: PiezaDeInsignia["props"]): PiezaDeInsignia => ({ tag: "ellipse", props });
const g = (props: PiezaDeInsignia["props"], hijos: readonly PiezaDeInsignia[]): PiezaDeInsignia => ({ tag: "g", props, hijos });

const CORAZON = "M0 11 C-15 1 -12 -10 -5.5 -10 C-2.5 -10 0 -8 0 -5.5 C0 -8 2.5 -10 5.5 -10 C12 -10 15 1 0 11 Z";

/** Cada dibujo, centrado en (0,0) dentro de ±14 unidades (el gato y la llama de la vela se asoman hasta 15). */
export const DIBUJOS_DE_INSIGNIA: Readonly<Record<IconoInsignia | "generico", readonly PiezaDeInsignia[]>> = {
  // Destello de cuatro puntas + uno chico.
  nuevo: [
    path({ d: "M0 -13 Q1.6 -1.6 13 0 Q1.6 1.6 0 13 Q-1.6 1.6 -13 0 Q-1.6 -1.6 0 -13 Z", fill: A }),
    path({ d: "M10 -12 Q10.6 -10.6 12 -10 Q10.6 -9.4 10 -8 Q9.4 -9.4 8 -10 Q9.4 -10.6 10 -12 Z", fill: A }),
  ],

  // Reloj de arena con la arena ya abajo: quedan pocas.
  ultimas: [
    path({ d: "M-8 -12 H8 M-8 12 H8", stroke: A, strokeWidth: 2, strokeLinecap: "round", fill: "none" }),
    path({
      d: "M-5.5 -12 C-5.5 -3 0 -1.5 0 0 C0 1.5 -5.5 3 -5.5 12 M5.5 -12 C5.5 -3 0 -1.5 0 0 C0 1.5 5.5 3 5.5 12",
      stroke: A,
      strokeWidth: 1.8,
      strokeLinecap: "round",
      fill: "none",
    }),
    path({ d: "M-4.2 11 L0 5 L4.2 11 Z", fill: A }),
  ],

  // Podio con estrella arriba: lo más vendido.
  top: [
    rect({ x: -4.5, y: -3, width: 9, height: 15, rx: 1, fill: A }),
    rect({ x: -13.5, y: 3, width: 9, height: 9, rx: 1, fill: A, opacity: 0.55 }),
    rect({ x: 4.5, y: 6, width: 9, height: 6, rx: 1, fill: A, opacity: 0.55 }),
    path({ d: "M0 -13 Q0.8 -9.2 4.6 -8.4 Q0.8 -7.6 0 -3.8 Q-0.8 -7.6 -4.6 -8.4 Q-0.8 -9.2 0 -13 Z", fill: A }),
  ],

  // Etiqueta de precio con símbolo de porcentaje.
  liquidar: [
    path({ d: "M-10 -12 H4 L12 -4 V12 H-10 Z", fill: A, opacity: 0.14, stroke: A, strokeWidth: 1.8, strokeLinejoin: "round" }),
    circle({ cx: -5, cy: -7, r: 1.5, fill: A }),
    circle({ cx: -4.5, cy: 3, r: 2, stroke: A, strokeWidth: 1.6, fill: "none" }),
    circle({ cx: 4.5, cy: 8, r: 2, stroke: A, strokeWidth: 1.6, fill: "none" }),
    path({ d: "M5.5 1 L-5.5 10", stroke: A, strokeWidth: 1.6, strokeLinecap: "round" }),
  ],

  // Aguja con hilo.
  manual: [
    path({ d: "M-8 11 L9 -8", stroke: A, strokeWidth: 2, strokeLinecap: "round" }),
    ellipse({ cx: 8.6, cy: -8.6, rx: 1.3, ry: 2.2, transform: "rotate(45 8.6 -8.6)", fill: H, stroke: A, strokeWidth: 1.2 }),
    path({
      d: "M8.6 -8.6 C15 -3 8 5 3 3 C-2 1 -5 6 -10 12",
      stroke: A,
      strokeWidth: 1.4,
      strokeLinecap: "round",
      fill: "none",
      strokeDasharray: "0.1 3",
    }),
  ],

  // Gema: una sola pieza.
  unica: [
    path({ d: "M-12 -4 L-6 -11 H6 L12 -4 L0 12 Z", fill: A, opacity: 0.18, stroke: A, strokeWidth: 1.8, strokeLinejoin: "round" }),
    path({ d: "M-12 -4 H12 M-6 -11 L-3 -4 L0 12 M6 -11 L3 -4 L0 12", stroke: A, strokeWidth: 1.4, strokeLinejoin: "round", fill: "none" }),
  ],

  // Dos flechas circulares: vuelve.
  reedicion: [
    path({ d: "M-10 0 A10 10 0 0 1 7 -7.2", stroke: A, strokeWidth: 2, strokeLinecap: "round", fill: "none" }),
    path({ d: "M10 0 A10 10 0 0 1 -7 7.2", stroke: A, strokeWidth: 2, strokeLinecap: "round", fill: "none" }),
    path({ d: "M4 -12 L10.5 -8 L3 -3.5 Z", fill: A }),
    path({ d: "M-4 12 L-10.5 8 L-3 3.5 Z", fill: A }),
  ],

  valentin: [path({ d: CORAZON, fill: A })],

  // Dos corazones, uno detrás del otro: las amigas.
  galentine: [
    g({ transform: "translate(6 -3) scale(0.7)" }, [path({ d: CORAZON, fill: A, opacity: 0.5 })]),
    g({ transform: "translate(-4 3) scale(0.85)" }, [path({ d: CORAZON, fill: A })]),
  ],

  // Tulipán.
  madre: [
    path({ d: "M0 5 V13", stroke: A, strokeWidth: 2, strokeLinecap: "round" }),
    path({ d: "M0 11 C-7 11 -9 6 -9 3 C-4 3 0 6 0 11 Z", fill: A, opacity: 0.5 }),
    path({ d: "M-7 -3 C-7.5 -12 -3 -13 0 -11 C3 -13 7.5 -12 7 -3 C7 3 3 5.5 0 5.5 C-3 5.5 -7 3 -7 -3 Z", fill: A }),
    path({ d: "M-2.4 -10.4 L0 -3.5 L2.4 -10.4", stroke: H, strokeWidth: 1.2, strokeLinejoin: "round", fill: "none", opacity: 0.85 }),
  ],

  // Símbolo de Venus.
  mujer: [
    circle({ cx: 0, cy: -4.5, r: 7, stroke: A, strokeWidth: 2.2, fill: "none" }),
    path({ d: "M0 2.5 V13 M-4.5 8 H4.5", stroke: A, strokeWidth: 2.2, strokeLinecap: "round" }),
  ],

  // Calabaza con cara.
  halloween: [
    path({ d: "M0 -8 C0 -10 1 -12 3 -13", stroke: A, strokeWidth: 2, strokeLinecap: "round", fill: "none" }),
    ellipse({ cx: 0, cy: 2, rx: 12.5, ry: 9.5, fill: A }),
    path({ d: "M-4.5 -6.5 C-8.5 -1 -8.5 5 -4.5 10 M4.5 -6.5 C8.5 -1 8.5 5 4.5 10", stroke: H, strokeWidth: 1, opacity: 0.4, fill: "none" }),
    path({ d: "M-7 0 H-3 L-5 -3.4 Z M3 0 H7 L5 -3.4 Z", fill: H }),
    path({
      d: "M-5.5 5.5 L-3 3.5 L-1 5.5 L1 3.5 L3 5.5 L5.5 3.5",
      stroke: H,
      strokeWidth: 1.4,
      strokeLinejoin: "round",
      strokeLinecap: "round",
      fill: "none",
    }),
  ],

  // Arbolito de tres pisos con estrella.
  navidad: [
    path({ d: "M0 -10 L-7 -1 H7 Z M0 -5 L-9 5 H9 Z M0 0 L-11 10 H11 Z", fill: A }),
    rect({ x: -2, y: 10, width: 4, height: 3.5, fill: A, opacity: 0.6 }),
    path({ d: "M0 -14 Q0.6 -12.4 2.2 -12 Q0.6 -11.6 0 -10 Q-0.6 -11.6 -2.2 -12 Q-0.6 -12.4 0 -14 Z", fill: A }),
  ],

  // Dos copas de brindis que se inclinan una hacia la otra, con una chispa arriba.
  findeano: [
    g({ transform: "translate(-6 1) rotate(16)" }, [
      path({ d: "M-2.9 -5 H2.9 L2.6 -1 Q0 1.2 -2.6 -1 Z", fill: A, opacity: 0.45 }),
      path({ d: "M-3.2 -10 H3.2 L2.6 -1 Q0 1.2 -2.6 -1 Z", stroke: A, strokeWidth: 1.6, strokeLinejoin: "round", fill: "none" }),
      path({ d: "M0 1 V9 M-3.5 9.5 H3.5", stroke: A, strokeWidth: 1.6, strokeLinecap: "round", fill: "none" }),
    ]),
    g({ transform: "translate(6 1) rotate(-16)" }, [
      path({ d: "M-2.9 -5 H2.9 L2.6 -1 Q0 1.2 -2.6 -1 Z", fill: A, opacity: 0.45 }),
      path({ d: "M-3.2 -10 H3.2 L2.6 -1 Q0 1.2 -2.6 -1 Z", stroke: A, strokeWidth: 1.6, strokeLinejoin: "round", fill: "none" }),
      path({ d: "M0 1 V9 M-3.5 9.5 H3.5", stroke: A, strokeWidth: 1.6, strokeLinecap: "round", fill: "none" }),
    ]),
    path({ d: "M0 -14 Q0.6 -12 2.4 -11.4 Q0.6 -10.8 0 -9 Q-0.6 -10.8 -2.4 -11.4 Q-0.6 -12 0 -14 Z", fill: A }),
  ],

  // Bandera en tres franjas verticales. Sin rojo: franjas del acento del grupo y el hueco al centro.
  patrias: [
    path({ d: "M-13 -12 V13", stroke: A, strokeWidth: 1.8, strokeLinecap: "round" }),
    rect({ x: -11, y: -11, width: 7.5, height: 15, fill: A }),
    rect({ x: -3.5, y: -11, width: 7.5, height: 15, fill: H, stroke: A, strokeWidth: 1 }),
    rect({ x: 4, y: -11, width: 7.5, height: 15, fill: A }),
  ],

  // Etiqueta negra llena con cordón: Black Friday.
  blackfriday: [
    path({ d: "M-10 -9 H4 L12 -1 V13 H-10 Z", fill: T }),
    circle({ cx: -5, cy: -4, r: 1.6, fill: H }),
    path({ d: "M-5 -4 C-5 -12 3 -14 8 -12", stroke: T, strokeWidth: 1.4, strokeLinecap: "round", fill: "none" }),
    path({ d: "M-3 7 H6 M-3 10 H3", stroke: H, strokeWidth: 1.4, strokeLinecap: "round", opacity: 0.7 }),
  ],

  // Rayo dentro de un aro: la oferta relámpago online.
  cyberwow: [
    circle({ cx: 0, cy: 0, r: 12.5, stroke: A, strokeWidth: 1.4, opacity: 0.4, fill: "none" }),
    path({ d: "M3 -11 L-7 2 H-1 L-3.5 11 L8 -3 H2 Z", fill: A }),
  ],

  // Pastel de dos pisos con vela.
  aniversario: [
    rect({ x: -11, y: 2, width: 22, height: 9, rx: 2, fill: A }),
    rect({ x: -7.5, y: -4, width: 15, height: 6.5, rx: 2, fill: A, opacity: 0.6 }),
    rect({ x: -1, y: -11, width: 2, height: 7, fill: A }),
    path({ d: "M0 -15 Q2.4 -12.6 0 -10.6 Q-2.4 -12.6 0 -15 Z", fill: A }),
    path({ d: "M-11 6.5 Q-7.3 4 -3.7 6.5 T3.7 6.5 T11 6.5", stroke: H, strokeWidth: 1.2, fill: "none", opacity: 0.7 }),
  ],

  // Cabeza de gato.
  gato: [
    path({ d: "M-10.5 -1 L-10.5 -12 L-3.5 -7 Q0 -8 3.5 -7 L10.5 -12 L10.5 -1 Q10.5 10.5 0 10.5 Q-10.5 10.5 -10.5 -1 Z", fill: A }),
    circle({ cx: -4, cy: 0, r: 1.5, fill: H }),
    circle({ cx: 4, cy: 0, r: 1.5, fill: H }),
    path({ d: "M-1.6 3 H1.6 L0 4.8 Z", fill: H }),
    path({ d: "M-15 1.5 L-9.5 2.6 M-15 5.5 L-9.5 4.6 M15 1.5 L9.5 2.6 M15 5.5 L9.5 4.6", stroke: A, strokeWidth: 1.2, strokeLinecap: "round" }),
  ],

  // Huella de perro.
  perro: [
    path({ d: "M0 2.5 C-6.5 2.5 -10 8 -6.8 11.5 C-4 13.6 -1.8 11.6 0 11.6 C1.8 11.6 4 13.6 6.8 11.5 C10 8 6.5 2.5 0 2.5 Z", fill: A }),
    ellipse({ cx: -9.4, cy: -1.6, rx: 2.6, ry: 3.7, transform: "rotate(-18 -9.4 -1.6)", fill: A }),
    ellipse({ cx: -3.6, cy: -7.6, rx: 2.6, ry: 3.9, transform: "rotate(-6 -3.6 -7.6)", fill: A }),
    ellipse({ cx: 3.6, cy: -7.6, rx: 2.6, ry: 3.9, transform: "rotate(6 3.6 -7.6)", fill: A }),
    ellipse({ cx: 9.4, cy: -1.6, rx: 2.6, ry: 3.7, transform: "rotate(18 9.4 -1.6)", fill: A }),
  ],

  // Globo terráqueo: aro, meridiano y ecuador (para que no parezca una galleta) y tres continentes.
  tierra: [
    circle({ cx: 0, cy: 0, r: 12, fill: A, opacity: 0.14 }),
    circle({ cx: 0, cy: 0, r: 12, stroke: A, strokeWidth: 1.8, fill: "none" }),
    ellipse({ cx: 0, cy: 0, rx: 5.2, ry: 12, stroke: A, strokeWidth: 0.9, fill: "none", opacity: 0.45 }),
    path({ d: "M-12 0 H12", stroke: A, strokeWidth: 0.9, opacity: 0.45 }),
    path({ d: "M-7.5 -6.5 C-4.5 -10 1 -9 -0.5 -5 C-2.5 -2.8 -7.8 -3 -7.5 -6.5 Z", fill: A }),
    path({ d: "M2.5 2 C7 0.5 10 4 7.5 8 C4.5 9.8 1 7.5 2.5 2 Z", fill: A }),
    path({ d: "M-9 2.5 C-6.5 1.5 -4.5 4 -6.5 7.5 C-8.8 6.8 -9.8 5 -9 2.5 Z", fill: A }),
  ],

  // Etiqueta genérica en contorno, para nombres que no reconocemos: una etiqueta es siempre «una etiqueta», así que esto no es un dibujo falso.
  generico: [
    path({ d: "M-10 -12 H4 L12 -4 V12 H-10 Z", fill: A, opacity: 0.12, stroke: A, strokeWidth: 1.8, strokeLinejoin: "round" }),
    circle({ cx: -5, cy: -7, r: 1.6, fill: A }),
    path({ d: "M-5 3 H5 M-5 7 H1", stroke: A, strokeWidth: 1.6, strokeLinecap: "round", opacity: 0.6 }),
  ],
};
