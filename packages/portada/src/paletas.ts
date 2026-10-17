import { conAlfa, luminancia, mezclar } from "./contraste";

// Los colores de la portada de una campaña (ADR-0436; maqueta docs/maquetas/campanas-diseno-2026-10). Una paleta trae su fondo, el
// segundo tono del degradado, la letra y el acento, con el contraste ya medido (`paletas.test.ts` lo exige en claro y en oscuro). Son
// COLORES DE DATO, como el de una prenda: no siguen el tema del ERP ni de la tienda; solo se oscurecen de noche, para no encandilar.

/** Los cuatro colores con que se pinta una portada. */
export type Colores = { fondo: string; fondo2: string; letra: string; acento: string };

export type Paleta = Colores & {
  id: string;
  nombre: string;
  /** Su versión de noche, si la de siempre (el fondo un 30 % más oscuro) no alcanza: las claras pasan a un fondo oscuro con su letra. */
  noche?: Partial<Colores>;
};

export type Tema = "claro" | "oscuro";

/** Las paletas curadas, en el orden en que se ofrecen. La primera es la de siempre: la portada de hoy, sin diseño. */
export const PALETAS: readonly Paleta[] = [
  // La de siempre: son los `--t-hero*` de la tienda (apps/tienda/app/globals.css), y una prueba exige que sigan siendo iguales.
  { id: "cayla", nombre: "Rojo CAYLA", fondo: "#6a2118", fondo2: "#92301f", letra: "#f6efe6", acento: "#f4c3b3", noche: { fondo: "#4a1712", fondo2: "#6b2318" } },
  { id: "noche", nombre: "Noche", fondo: "#171614", fondo2: "#2d2a26", letra: "#f5f0e8", acento: "#d9a46b" },
  { id: "caramelo", nombre: "Caramelo", fondo: "#5a3a22", fondo2: "#7d5233", letra: "#f7efe4", acento: "#f2c48d" },
  { id: "calabaza", nombre: "Calabaza", fondo: "#1d1612", fondo2: "#3d2316", letra: "#f5ece0", acento: "#f39a4a" },
  { id: "bosque", nombre: "Bosque", fondo: "#1f3a2b", fondo2: "#2f5640", letra: "#f3efe4", acento: "#e3c27a" },
  { id: "medianoche", nombre: "Medianoche", fondo: "#1c2a3d", fondo2: "#2c4260", letra: "#f2eee6", acento: "#a9c4e4" },
  { id: "oliva", nombre: "Oliva", fondo: "#454a27", fondo2: "#626a36", letra: "#f5f1e6", acento: "#e7d9a8" },
  { id: "terracota", nombre: "Terracota", fondo: "#8f4229", fondo2: "#a9532f", letra: "#fff7ee", acento: "#ffd9bf" },
  { id: "negro-rojo", nombre: "Negro y rojo", fondo: "#0d0d0c", fondo2: "#211f1d", letra: "#f5f0e8", acento: "#ff5a45" },
  { id: "patria", nombre: "Rojo y blanco", fondo: "#a8231c", fondo2: "#c13026", letra: "#fffaf3", acento: "#ffe0d6" },
  {
    id: "arena",
    nombre: "Arena",
    fondo: "#e6dccb",
    fondo2: "#f5eee3",
    letra: "#1a1a18",
    acento: "#8b2a1f",
    noche: { fondo: "#2a2622", fondo2: "#3a342d", letra: "#f5f0e8", acento: "#e8b39d" },
  },
  {
    id: "rosa",
    nombre: "Rosa empolvado",
    fondo: "#e6c4bb",
    fondo2: "#f3dcd5",
    letra: "#3a1d1a",
    acento: "#8b2a1f",
    noche: { fondo: "#3a2522", fondo2: "#533430", letra: "#f6ebe7", acento: "#f0b3a6" },
  },
  {
    id: "lavanda",
    nombre: "Lavanda",
    fondo: "#d7cfe6",
    fondo2: "#ebe6f3",
    letra: "#2a2236",
    acento: "#6a3c9f",
    noche: { fondo: "#29233a", fondo2: "#3a3150", letra: "#f1ecf7", acento: "#c9b3ec" },
  },
  {
    id: "menta",
    nombre: "Menta",
    fondo: "#cbe0d2",
    fondo2: "#e3efe7",
    letra: "#15322a",
    acento: "#1c6b56",
    noche: { fondo: "#1a2b24", fondo2: "#263c33", letra: "#e9f3ed", acento: "#8fd1b3" },
  },
];

/** La paleta de siempre (la portada sin diseño). */
export const PALETA_DE_SIEMPRE: Paleta = PALETAS[0];

/** La paleta por su id; uno que no existe (borrado, mal escrito) cae en la de siempre, nunca en un hueco. */
export function paletaPorId(id: string | null | undefined): Paleta {
  return PALETAS.find((p) => p.id === id) ?? PALETA_DE_SIEMPRE;
}

/** Los colores con que se pinta en ese tema: de noche, su versión de noche o, si no trae, el fondo un 30 % más oscuro. */
export function coloresEnTema(p: Paleta, tema: Tema): Colores {
  const { fondo, fondo2, letra, acento } = p;
  if (tema === "claro") return { fondo, fondo2, letra, acento };
  if (p.noche) return { fondo, fondo2, letra, acento, ...p.noche };
  return { fondo: mezclar(fondo, "#000000", 0.3), fondo2: mezclar(fondo2, "#000000", 0.3), letra, acento };
}

/**
 * Las variables CSS que lee el héroe (`heroe.css`): las seis `--t-hero*` que la tienda define en sus tokens, escritas igual (el vidrio
 * y el filo son la letra al 10 % y al 22 %), y dos que solo cambian con una letra oscura (una paleta clara): el colibrí pasa de blanco a
 * negro y la letra del botón claro (que se pinta con el color de la letra) pasa a papel. Sin ellas, `heroe.css` usa las de siempre.
 */
export function variablesDePaleta(c: Colores): Record<`--t-hero${string}`, string> {
  const letraOscura = luminancia(c.letra) < 0.5;
  return {
    "--t-hero": c.fondo,
    "--t-hero-2": c.fondo2,
    "--t-hero-tinta": c.letra,
    "--t-hero-acento": c.acento,
    "--t-hero-vidrio": conAlfa(c.letra, 0.1),
    "--t-hero-filo": conAlfa(c.letra, 0.22),
    "--t-hero-colibri": letraOscura ? "brightness(0)" : "brightness(0) invert(1)",
    "--t-hero-boton-letra": letraOscura ? "#fbf8f2" : "#1a1a18", // tema-fijo: el papel y la tinta de la tienda (`--t-papel-fijo`, `--t-tinta-fija`)
  };
}
