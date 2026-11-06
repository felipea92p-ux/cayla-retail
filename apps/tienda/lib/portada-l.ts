import { categoriasDe, claveCategoria, hrefDePrenda, soles, type Prenda } from "./catalogo";
import { lasNuevas } from "./inicio";

// La portada «L» de la tienda (ADR-0613, regla de Felipe del 2026-11-05): las últimas prendas que entraron de las tres categorías con lo más
// reciente, siempre con foto. Primero sale la última de cada una, después la penúltima y la antepenúltima: tres grupos de tres, nueve prendas.
// Es automática: sigue sola lo que llega, lo que se agota y lo que deja de ser nuevo a los 30 días, sin que nadie tenga que armar nada.

const GRUPOS_A_LA_VEZ = 3;
const PRENDAS_POR_GRUPO = 3;

export type PrendaDePortada = { id: string; nombre: string; categoria: string | null; precio: string; href: string; foto: string };
export type GrupoDePortada = { prendas: PrendaDePortada[] };

/** El color de la prenda que se ve en su primera foto; si no se sabe cuál es, el primero que tiene. */
const colorDeLaFoto = (p: Prenda): string | null => (p.colores.find((c) => c.foto && c.foto === p.fotos[0]) ?? p.colores[0])?.hex ?? null;

const canales = (hex: string): number[] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Una prenda blanca o muy clara no se puede recortar: se confunde con el fondo blanco de su foto. */
const esMuyClara = (p: Prenda): boolean => {
  const hex = colorDeLaFoto(p);
  return hex ? Math.min(...canales(hex)) >= 225 : false;
};

function prendaDePortada(p: Prenda, sede: string | null): PrendaDePortada {
  return { id: p.id, nombre: p.nombre, categoria: p.categoria?.nombre ?? null, precio: soles(p.precioFinal), href: hrefDePrenda(p, sede), foto: p.fotos[0] };
}

/**
 * Los grupos de la portada, hasta tres. `prendas` ya viene con lo que hay en la tienda elegida. Las categorías van de la que recibió algo hace
 * menos a la que hace más, y cada grupo toma la siguiente prenda de sus tres categorías. Si una se queda sin prendas, la reemplaza la que sigue,
 * sin repetir ninguna prenda (hoy Lima tiene una sola prenda nueva de Polos). Sin tres prendas, `[]`: sigue la portada de siempre.
 */
export function gruposDeLaPortada(prendas: readonly Prenda[], sede: string | null): GrupoDePortada[] {
  const porCategoria = new Map<string, Prenda[]>();
  for (const p of lasNuevas(prendas)) {
    const clave = claveCategoria(p.categoria);
    if (!clave || !p.fotos[0] || esMuyClara(p)) continue;
    porCategoria.set(clave, [...(porCategoria.get(clave) ?? []), p]);
  }
  // `lasNuevas` ya las ordena por llegada: la primera categoría que aparece es la que recibió algo hace menos.
  const filas = [...porCategoria.values()];
  const enUso = filas.slice(0, PRENDAS_POR_GRUPO);
  let siguiente = enUso.length;
  const grupos: GrupoDePortada[] = [];
  for (let g = 0; g < GRUPOS_A_LA_VEZ; g++) {
    const elegidas: PrendaDePortada[] = [];
    for (let lugar = 0; lugar < PRENDAS_POR_GRUPO; lugar++) {
      while ((enUso[lugar]?.length ?? 0) === 0 && siguiente < filas.length) enUso[lugar] = filas[siguiente++];
      // Sin más categorías, lo que quede de las que ya están: mejor dos prendas del mismo tipo que un panel vacío.
      const fila = enUso[lugar]?.length ? enUso[lugar] : filas.find((f) => f.length > 0);
      const p = fila?.shift();
      if (p) elegidas.push(prendaDePortada(p, sede));
    }
    if (elegidas.length < PRENDAS_POR_GRUPO) break;
    grupos.push({ prendas: elegidas });
  }
  return grupos;
}

export type CategoriaConFoto = { clave: string; nombre: string; foto: string; fondo: string };

/**
 * Una prenda por categoría, para la fila de categorías: la más vendida con foto o, si ninguna tiene puesto, la que llegó hace menos. Sale de lo
 * que hay ahora en la tienda elegida, así que nunca muestra algo agotado. El fondo es el color de esa prenda, muy suave.
 */
export function categoriasConFoto(prendas: readonly Prenda[]): CategoriaConFoto[] {
  return categoriasDe(prendas).flatMap((c) => {
    const suyas = prendas.filter((p) => claveCategoria(p.categoria) === c.clave && p.fotos[0]);
    if (suyas.length === 0) return [];
    const mejor = [...suyas].sort((a, b) => (a.vendidos ?? 99) - (b.vendidos ?? 99) || (a.nuevo?.dias ?? 99) - (b.nuevo?.dias ?? 99))[0];
    return [{ clave: c.clave, nombre: c.nombre, foto: mejor.fotos[0], fondo: !esMuyClara(mejor) ? (colorDeLaFoto(mejor) ?? "#8f8f8c") : "#8f8f8c" }];
  });
}
