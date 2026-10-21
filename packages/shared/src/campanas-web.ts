// El catálogo CERRADO de ambientes de las campañas de la tienda online (Tienda web ▸ Campañas, maqueta
// docs/maquetas/campanas-tienda-2026-10/). Una sola lista para las dos apps: el ERP la muestra para elegir y la tienda la usa para
// vestir la portada con LOS MISMOS colores. El líder ELIGE y ajusta; nunca escribe CSS, y un ambiente nuevo lo agrega el equipo (aquí, en
// el CHECK de `retail.campana_disenos.plantilla` y en la hoja de estilos de la tienda, los tres a la vez).
//
// La CLAVE es lo que guarda la base y no cambia («cyber» es «Black Week» aunque el nombre se renombre); el nombre es lo que lee la
// persona.
//
// LOS COLORES. Cada ambiente trae 3 paletas de tres colores: el `fondo` de la portada y la franja, el `texto` que va encima y el
// `acento` (botón, descuento, palabra en cursiva). Las 21 paletas se miden contra el candado de lectura (`comprobarLectura`) en
// `apps/web/lib/campanas-web-diseno.test.ts`: una paleta nueva que no se lea no entra.

export type PaletaCampana = { nombre: string; fondo: string; texto: string; acento: string };

export type AmbienteDeCampana = {
  clave: string;
  nombre: string;
  /** Para qué campaña sirve, en palabras de tienda. */
  para: string;
  /** El efecto con que nace al elegirlo (el líder lo puede cambiar). */
  efecto: EfectoCampana;
  /** Cómo nace la franja de arriba. */
  franja: FranjaCampana;
  paletas: readonly [PaletaCampana, PaletaCampana, PaletaCampana];
};

export const EFECTOS_CAMPANA = ["ninguno", "destellos", "confeti", "petalos", "copos", "corazones", "estrellas", "hojas", "burbujas", "patitas"] as const;
export type EfectoCampana = (typeof EFECTOS_CAMPANA)[number];
export const FRANJAS_CAMPANA = ["rota", "marquesina", "quieta"] as const;
export type FranjaCampana = (typeof FRANJAS_CAMPANA)[number];

export const AMBIENTES_CAMPANA = [
  {
    clave: "sobrio", nombre: "Sobrio", para: "Liquidaciones y campañas cortas", efecto: "ninguno", franja: "quieta",
    paletas: [
      { nombre: "Muro", fondo: "#e1ded7", texto: "#1c1c1a", acento: "#9e1d32" },
      { nombre: "Grafito", fondo: "#1c1c1a", texto: "#ecebe7", acento: "#e47d8d" },
      { nombre: "Piedra", fondo: "#cbc7be", texto: "#1c1c1a", acento: "#7d1627" },
    ],
  },
  {
    clave: "aniversario", nombre: "Aniversario", para: "El cumpleaños de CAYLA", efecto: "destellos", franja: "rota",
    paletas: [
      { nombre: "Vino y champán", fondo: "#2b1016", texto: "#f6ecd8", acento: "#d9b878" },
      { nombre: "Cochinilla", fondo: "#7d1627", texto: "#f6ecd8", acento: "#f1d9a0" },
      { nombre: "Muro dorado", fondo: "#ecebe7", texto: "#2b1016", acento: "#8a6a2a" },
    ],
  },
  {
    clave: "patrias", nombre: "Fiestas Patrias", para: "Julio", efecto: "confeti", franja: "rota",
    paletas: [
      { nombre: "Rojo y blanco", fondo: "#f4f3f0", texto: "#1c1c1a", acento: "#b3202f" },
      { nombre: "Rojo pleno", fondo: "#9e1d32", texto: "#fbf6f2", acento: "#fbf6f2" },
      { nombre: "Grafito", fondo: "#1c1c1a", texto: "#f4f3f0", acento: "#e47d8d" },
    ],
  },
  {
    clave: "madre", nombre: "Día de la Madre", para: "Mayo", efecto: "petalos", franja: "rota",
    paletas: [
      { nombre: "Rosa empolvado", fondo: "#f0dcd8", texto: "#3a1a22", acento: "#8a3a4a" },
      { nombre: "Malva", fondo: "#d9c9d8", texto: "#2c1b2d", acento: "#6b3a6e" },
      { nombre: "Vino suave", fondo: "#5a2236", texto: "#f8e9e6", acento: "#f0b8c0" },
    ],
  },
  {
    clave: "cyber", nombre: "Black Week", para: "Noviembre, descuentos grandes", efecto: "destellos", franja: "marquesina",
    paletas: [
      { nombre: "Negro y cochinilla", fondo: "#141413", texto: "#f2f1ed", acento: "#e47d8d" },
      { nombre: "Negro y arena", fondo: "#141413", texto: "#f2f1ed", acento: "#cbc7be" },
      { nombre: "Muro y negro", fondo: "#ecebe7", texto: "#141413", acento: "#9e1d32" },
    ],
  },
  {
    clave: "gato", nombre: "Día del Gato", para: "Para los amantes de los gatos", efecto: "patitas", franja: "rota",
    paletas: [
      { nombre: "Gris humo", fondo: "#2a2c31", texto: "#f1efe9", acento: "#e8a87c" },
      { nombre: "Crema atigrada", fondo: "#f3e7d3", texto: "#33261a", acento: "#a85a16" },
      { nombre: "Negro y ámbar", fondo: "#141413", texto: "#f2f1ed", acento: "#f0b34a" },
    ],
  },
  {
    clave: "navidad", nombre: "Navidad", para: "Diciembre", efecto: "copos", franja: "rota",
    paletas: [
      { nombre: "Bosque y dorado", fondo: "#1f2e24", texto: "#f3eddc", acento: "#d9b878" },
      { nombre: "Cochinilla", fondo: "#7d1627", texto: "#f6ecd8", acento: "#d9b878" },
      { nombre: "Marfil", fondo: "#f4f0e4", texto: "#1f2e24", acento: "#9e1d32" },
    ],
  },
] as const satisfies readonly AmbienteDeCampana[];

export type AmbienteCampana = (typeof AMBIENTES_CAMPANA)[number]["clave"];

/** El ambiente de una clave, o `null` si no es del catálogo (la lista nunca inventa uno). */
export const ambienteDeCampana = (clave: string | null | undefined): AmbienteDeCampana | null =>
  AMBIENTES_CAMPANA.find((a) => a.clave === clave) ?? null;

/** El nombre de un ambiente, o `null` si la clave no es del catálogo. */
export const nombreDeAmbiente = (clave: string | null | undefined): string | null => ambienteDeCampana(clave)?.nombre ?? null;

// ---------------------------------------------------------------- Colores de una campaña

export type ColoresDeCampana = { fondo: string; texto: string; acento: string };

/** Los tres colores con que se viste una campaña: los de su paleta y, si el líder eligió uno propio, su acento. `null` si la clave o la
 *  paleta no existen. */
export function coloresDeCampana(plantilla: string | null | undefined, paleta: number, acentoPropio: string | null = null): ColoresDeCampana | null {
  const p = ambienteDeCampana(plantilla)?.paletas[paleta];
  if (!p) return null;
  return { fondo: p.fondo, texto: p.texto, acento: acentoPropio && esColorHex(acentoPropio) ? acentoPropio.toLowerCase() : p.acento };
}

/** `#rrggbb` en minúscula o mayúscula (la base guarda minúscula). */
export const esColorHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

// ---------------------------------------------------------------- Candado de lectura (WCAG)

const luminancia = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** El contraste WCAG entre dos colores `#rrggbb`: de 1 (iguales) a 21 (negro sobre blanco). */
export function ratioContraste(a: string, b: string): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const GRAFITO = "#141413";
const MARFIL = "#fbf6f2";

/** El texto (grafito o marfil) que mejor se lee sobre un color: el de las letras de un botón. */
export const textoSobre = (fondo: string): string => (ratioContraste(fondo, GRAFITO) >= ratioContraste(fondo, MARFIL) ? GRAFITO : MARFIL);

/** La foto de una prenda es siempre clara: sobre ella va el sello «−25 %». */
const FONDO_DE_FOTO = "#e1ded7";
const GRAFITO_DEL_SELLO = "#1c1c1a";

/** El color del sello «−25 %» de cada prenda: el primero de {acento, fondo, grafito} que se lee sobre la foto (3:1), con el texto que mejor se
 *  lee encima. Se ajusta solo: el líder nunca lo elige. */
export function colorDelSello(c: ColoresDeCampana): { fondo: string; texto: string } {
  const fondo = [c.acento, c.fondo, GRAFITO_DEL_SELLO].find((x) => ratioContraste(x, FONDO_DE_FOTO) >= 3) ?? GRAFITO_DEL_SELLO;
  return { fondo, texto: textoSobre(fondo) };
}

export type ComprobacionDeLectura = { nombre: string; ratio: number; minimo: number; ok: boolean };

/** Lo que mira el candado de lectura de una campaña con ambiente: el titular sobre el fondo (4,5:1: texto), el acento sobre el fondo (3:1:
 *  botón y palabra grande) y el sello sobre la foto (3:1, se ajusta solo). Si alguna falla, la campaña no se programa. */
export function comprobarLectura(c: ColoresDeCampana): { ok: boolean; items: ComprobacionDeLectura[] } {
  const sello = colorDelSello(c);
  const items: ComprobacionDeLectura[] = [
    { nombre: "Titular y bajada sobre el fondo", ratio: ratioContraste(c.texto, c.fondo), minimo: 4.5 },
    { nombre: "Botón y palabra de color sobre el fondo", ratio: ratioContraste(c.acento, c.fondo), minimo: 3 },
    { nombre: "Sello de descuento sobre la foto (se ajusta solo)", ratio: ratioContraste(sello.fondo, FONDO_DE_FOTO), minimo: 3 },
  ].map((x) => ({ ...x, ok: x.ratio >= x.minimo }));
  return { ok: items.every((x) => x.ok), items };
}
