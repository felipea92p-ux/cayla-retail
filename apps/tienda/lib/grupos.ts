import { GRUPOS_DE_LA_TIENDA, grupoDeLaTienda, type GrupoDeLaTienda, type MenuDeLaTienda } from "@cayla-retail/shared/categorias-de-la-tienda";
import { claveCategoria, type Prenda } from "./catalogo";

// Los grupos de categorías de la tienda (ADR-0408, act. 2026-10-15 (f)). El primer día en producción, el menú «Ropa» de la cabecera
// mezclaba la ropa con aretes, collares y maquillaje (una tercera columna de 17 filas) y el catálogo mostraba sus 28 categorías como
// píldoras en tres filas (Felipe: «podría verse mucho mejor»). Los mismos grupos arman el menú de la computadora, el del celular y los
// filtros del catálogo: la persona encuentra lo mismo en el mismo lugar. La tabla de prefijos vive en `packages/shared`
// (`categorias-de-la-tienda.ts`) desde el 2026-10-17: el ERP la lee para saber qué entra al probador de «Arma el tuyo».

export type Menu = MenuDeLaTienda;
export type Grupo = GrupoDeLaTienda;

export const GRUPOS: readonly Grupo[] = GRUPOS_DE_LA_TIENDA;

/**
 * Los dos menús de la cabecera, en su orden. `todo` es el enlace que lleva a TODO el menú (`/catalogo?menu=ropa`): el botón «Ropa»
 * de la cabecera y su primera línea en el celular (antes «Ropa» era un botón sin destino: al hacer clic, o con el dedo, no pasaba nada
 * y no había forma de ver toda la ropa junta). `titulo` es el de la lista, con lo último en cursiva roja.
 */
export const MENUS: readonly { clave: Menu; nombre: string; todo: string; titulo: [string, string] }[] = [
  { clave: "ropa", nombre: "Ropa", todo: "Toda la ropa", titulo: ["Toda la", "ropa"] },
  { clave: "accesorios", nombre: "Accesorios", todo: "Todos los accesorios", titulo: ["Todos los", "accesorios"] },
];

/** El grupo de una categoría, por su clave (el prefijo; sin prefijo, su nombre). Lo desconocido, a «Encima y más». */
export const grupoDe: (claveDeCategoria: string) => Grupo = grupoDeLaTienda;

/** El grupo de la URL (`?grupo=`), o null si no existe. */
export function leerGrupo(v: string | string[] | undefined): Grupo | null {
  const g = (Array.isArray(v) ? v[0] : v)?.trim();
  return GRUPOS.find((x) => x.clave === g) ?? null;
}

/** El menú de la URL (`?menu=`), o null si no existe. */
export function leerMenu(v: string | string[] | undefined): (typeof MENUS)[number] | null {
  const m = (Array.isArray(v) ? v[0] : v)?.trim();
  return MENUS.find((x) => x.clave === m) ?? null;
}

export type CategoriaDeGrupo = { clave: string; nombre: string; cuantas: number; prendas: Prenda[] };
export type GrupoConCategorias = Grupo & { cuantas: number; categorias: CategoriaDeGrupo[] };

/**
 * Los grupos que tienen algo en `prendas`, en su orden, con sus categorías en el orden de su lista (lo que nadie ordenó va al final,
 * por cuántas hay) y las prendas de cada una, en el orden en que llegaron.
 */
export function gruposDe(prendas: readonly Prenda[]): GrupoConCategorias[] {
  const porClave = new Map<string, CategoriaDeGrupo>();
  for (const p of prendas) {
    const clave = claveCategoria(p.categoria);
    if (!clave || !p.categoria) continue;
    const c = porClave.get(clave) ?? { clave, nombre: p.categoria.nombre, cuantas: 0, prendas: [] };
    c.cuantas += 1;
    c.prendas.push(p);
    porClave.set(clave, c);
  }
  const puesto = (g: Grupo, clave: string) => {
    const i = g.prefijos.indexOf(clave);
    return i < 0 ? g.prefijos.length : i;
  };
  return GRUPOS.flatMap((g) => {
    const categorias = [...porClave.values()]
      .filter((c) => grupoDe(c.clave).clave === g.clave)
      .sort((a, b) => puesto(g, a.clave) - puesto(g, b.clave) || b.cuantas - a.cuantas || a.nombre.localeCompare(b.nombre, "es"));
    if (categorias.length === 0) return [];
    return [{ ...g, cuantas: categorias.reduce((n, c) => n + c.cuantas, 0), categorias }];
  });
}

/** Solo las prendas del grupo (sin grupo, todas). */
export function delGrupo(prendas: readonly Prenda[], grupo: Grupo | null): Prenda[] {
  if (!grupo) return [...prendas];
  return prendas.filter((p) => {
    const clave = claveCategoria(p.categoria);
    return clave !== null && grupoDe(clave).clave === grupo.clave;
  });
}

/** Solo las prendas del menú («Ropa», «Accesorios»), o todas sin menú. */
export function delMenu(prendas: readonly Prenda[], menu: Menu | null): Prenda[] {
  if (!menu) return [...prendas];
  return prendas.filter((p) => {
    const clave = claveCategoria(p.categoria);
    return clave !== null && grupoDe(clave).menu === menu;
  });
}

// Vive en `listas.ts` (sin zod) para que el esqueleto de la lista lo use; aquí se sigue exportando.
export { tituloPartido } from "./listas";
