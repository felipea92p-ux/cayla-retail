// Colores combinados (ADR-0643): «Hueso con azul» es un color de la carta armado con otros —la base primero y de 1 a 3
// acompañantes—. La base hace cumplir la forma (`colores_valida_componentes`) y arma nombre, código, familia y hex
// (`retail.color_combinado`); esto solo filtra lo que la pantalla manda, con las mismas reglas, para responder en
// español antes de ir a la base.

export const ERROR_COMPONENTES = "Una mezcla es un color base y de 1 a 3 que lo acompañan, cada uno con su código de 3 letras, sin repetir.";

/** Los códigos en mayúsculas, la base primero. `null` si no es una mezcla válida (2 a 4 colores, 3 letras, sin repetir). */
export function normalizarComponentes(crudo: unknown): string[] | null {
  if (!Array.isArray(crudo)) return null;
  const codigos = crudo.map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""));
  if (codigos.length < 2 || codigos.length > 4) return null;
  if (codigos.some((c) => !/^[A-Z]{3}$/.test(c))) return null;
  if (new Set(codigos).size !== codigos.length) return null;
  return codigos;
}

/** ¿Es una mezcla? Una fila con 2 o más componentes; sin el dato (una pantalla que no lo pidió), no. */
export function esCombinado(color: { componentes?: readonly string[] | null }): boolean {
  return (color.componentes?.length ?? 0) >= 2;
}

/** El grupo de las mezclas en la carta: `agruparPorFamilia` lo pone tras las familias, como a los estampados. */
export const GRUPO_COMBINADOS = "combinados";

/**
 * Los tonos con que se dibuja el punto de una mezcla, la base primero: los hex de sus componentes, sacados de la lista que ya tiene la
 * pantalla. Un componente que la lista no trae (desactivado, o la pantalla no lo leyó) se salta; si no quedan dos, `null` y el punto
 * se dibuja liso con el hex de la base, que es lo que la mezcla guarda.
 */
export function tonosDeMezcla(
  color: { componentes?: readonly string[] | null },
  porCodigo: ReadonlyMap<string, { hex: string | null }>,
): string[] | null {
  if (!esCombinado(color)) return null;
  const tonos = (color.componentes ?? []).map((c) => porCodigo.get(c)?.hex ?? null).filter((h): h is string => !!h && /^#[0-9A-Fa-f]{6}$/.test(h));
  return tonos.length >= 2 ? tonos : null;
}

/**
 * El fondo del punto partido: la base ocupa la mitad izquierda (es la que más se ve en la prenda) y los acompañantes se reparten la
 * derecha, de arriba a abajo. Un `conic-gradient` desde abajo: 0–50 % es la mitad izquierda; lo demás, los acompañantes.
 */
export function fondoDeMezcla(tonos: readonly string[]): string {
  const [base, ...resto] = tonos;
  const tramo = 50 / resto.length;
  const partes = resto.map((t, i) => `${t} ${50 + tramo * i}% ${50 + tramo * (i + 1)}%`);
  return `conic-gradient(from 180deg, ${base} 0% 50%, ${partes.join(", ")})`;
}

type ColorDeMezcla = { codigo: string; nombre: string; componentes?: readonly string[] | null; activo?: boolean };

/** Hasta cuántos colores acompañan a la base (`colores_componentes_cuantos`: 2 a 4 en total). */
export const MAX_ACOMPANANTES = 3;

/** Los componentes como los guarda la base: la base primero y los acompañantes ordenados por código (la misma prenda en cualquier orden). */
export function componentesDeMezcla(base: string, acompanantes: readonly string[]): string[] {
  return [base, ...[...acompanantes].sort()];
}

/**
 * El nombre que le pondrá la base (`retail.color_combinado`), para mostrarlo antes de guardar: «Hueso con azul», «Hueso con azul y
 * negro», «Hueso con azul, negro y rojo». Los acompañantes, en el orden de su código; cada nombre con su primera letra en minúscula.
 */
export function nombreDeMezcla(base: { nombre: string }, acompanantes: readonly { codigo: string; nombre: string }[]): string {
  const nombres = [...acompanantes].sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0)).map((c) => c.nombre.charAt(0).toLocaleLowerCase("es") + c.nombre.slice(1));
  if (nombres.length === 0) return base.nombre;
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `${base.nombre} con ${lista}`;
}

/** La mezcla que ya está en la lista de la pantalla con esos componentes, si existe. */
export function mezclaExistente<C extends ColorDeMezcla>(colores: readonly C[], componentes: readonly string[]): C | null {
  const clave = componentes.join(",");
  return colores.find((c) => esCombinado(c) && (c.componentes ?? []).join(",") === clave) ?? null;
}

/** Qué colores pueden acompañar a una base: los de un solo tono, menos la base. Una mezcla no entra en otra. */
export function puedeAcompanar(color: ColorDeMezcla, base: string): boolean {
  return color.codigo !== base && !esCombinado(color) && color.activo !== false;
}
