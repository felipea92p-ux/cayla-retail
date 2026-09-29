// Tamaño de las tarjetas de la Grilla de Productos: grande, mediano o pequeño (Felipe, 2026-09-29: «lo veo muy grande»).
//
// Con 20 prendas por página y un catálogo que crece, la persona elige cuánto ver de un vistazo: la foto grande para revisar
// una prenda, la pequeña para recorrer muchas. Cambia solo el ancho de las tarjetas (cuántas caben por fila); la página
// sigue trayendo las mismas 20.
//
// Es una COOKIE y no localStorage a propósito, igual que el menú lateral (`lateral-cookie.ts`): la página del servidor la
// lee y le pasa a la Grilla el tamaño ya resuelto, así la primera pintura sale con las columnas que la persona dejó y no
// hay un salto al hidratar. Es una preferencia de pantalla de esta máquina, no un dato del negocio.

export const TAMANOS_GRILLA = ["grande", "mediano", "pequeno"] as const;
export type TamanoGrilla = (typeof TAMANOS_GRILLA)[number];

/** Mediano: «grande» era lo único que había y a Felipe le resultaba excesivo en una pantalla ancha. */
export const TAMANO_GRILLA_POR_DEFECTO: TamanoGrilla = "mediano";

export const COOKIE_TAMANO_GRILLA = "cayla_grilla_tam";

export const ROTULO_TAMANO_GRILLA: Record<TamanoGrilla, string> = {
  grande: "Grande",
  mediano: "Mediano",
  pequeno: "Pequeño",
};

/** Ancho MÍNIMO de una tarjeta en pantallas medianas y grandes (px). Las columnas que caben las decide el ancho DISPONIBLE
 *  (`auto-fill`), no el de la ventana: con el menú lateral abierto, una ventana de 1024 px deja ~550 px para las tarjetas, y
 *  contar columnas por ventana las dejaba de 100 px y con el texto cortado. Grande cabe 4 en una pantalla de 2000 px, como
 *  la grilla de siempre. */
export const ANCHO_MINIMO_TARJETA: Record<TamanoGrilla, number> = { grande: 340, mediano: 250, pequeno: 180 };

/** Columnas: en el celular, un número fijo (grande 1 · mediano 2 · pequeño 3); desde `sm`, las que quepan a su ancho mínimo.
 *  Las clases van enteras y a la vista: Tailwind solo genera lo que puede leer escrito. */
export const CLASES_GRILLA: Record<TamanoGrilla, string> = {
  grande: "grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]",
  mediano: "grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]",
  pequeno: "grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]",
};

/** Lo que dice la cookie, o el tamaño por defecto si falta o trae algo que no es una opción (una cookie vieja, a mano). */
export function leerTamanoGrilla(valor: string | null | undefined): TamanoGrilla {
  return (TAMANOS_GRILLA as readonly string[]).includes(valor ?? "") ? (valor as TamanoGrilla) : TAMANO_GRILLA_POR_DEFECTO;
}

/** Guarda la preferencia (solo desde el navegador). Un año; `SameSite=Lax` alcanza: el servidor solo la lee al pintar. */
export function guardarTamanoGrilla(tamano: TamanoGrilla) {
  document.cookie = `${COOKIE_TAMANO_GRILLA}=${tamano}; path=/; max-age=31536000; samesite=lax`;
}
