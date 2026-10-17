import { claveCategoria, type Prenda } from "./catalogo";

// Los grupos de categorías de la tienda (ADR-0408, act. 2026-10-15 (f)). El primer día en producción, el menú «Ropa» de la cabecera
// mezclaba la ropa con aretes, collares y maquillaje (una tercera columna de 17 filas) y el catálogo mostraba sus 28 categorías como
// píldoras en tres filas (Felipe: «podría verse mucho mejor»). Cada categoría va en un grupo y cada grupo en un menú de la cabecera
// («Ropa» o «Accesorios»), siempre por su PREFIJO (`categorias.prefijo`, nunca el nombre visible, que se renombra). Los mismos grupos
// arman el menú de la computadora, el del celular y los filtros del catálogo: la persona encuentra lo mismo en el mismo lugar.
// Un prefijo que no está en ninguna lista (una categoría que un Líder creó después) cae en «Encima y más»: se ve, aunque no en su mejor
// lugar, hasta que se sume aquí.

export type Menu = "ropa" | "accesorios";
export type Grupo = { clave: string; nombre: string; menu: Menu; prefijos: readonly string[] };

export const GRUPOS: readonly Grupo[] = [
  { clave: "arriba", nombre: "Arriba", menu: "ropa", prefijos: ["CMS", "BLU", "TOP", "POL", "BOD", "COR", "SUD", "CMP", "LEN"] },
  { clave: "vestidos", nombre: "Vestidos y conjuntos", menu: "ropa", prefijos: ["VES", "CON", "ENT", "TBA"] },
  { clave: "abajo", nombre: "Abajo", menu: "ropa", prefijos: ["PAN", "JEA", "FAL", "SHO"] },
  { clave: "encima", nombre: "Encima y más", menu: "ropa", prefijos: ["CAS", "BLZ", "CHA", "CAP", "ABR"] },
  { clave: "accesorios", nombre: "Bolsos y accesorios", menu: "accesorios", prefijos: ["CAR", "MOC", "RIN", "ACC", "CIN", "BUF", "PAS", "GOR", "LSO", "REL"] },
  { clave: "bisuteria", nombre: "Bisutería y belleza", menu: "accesorios", prefijos: ["ARE", "COL", "ANL", "PUL", "MAQ"] },
  { clave: "calzado", nombre: "Calzado", menu: "accesorios", prefijos: ["ZAP", "ZFO", "BAI", "BOI", "BOT", "MSN", "SAN"] },
  { clave: "mas", nombre: "Más", menu: "accesorios", prefijos: ["LAP", "LIB", "UOF", "UTC", "BOL"] },
];

/**
 * Los dos menús de la cabecera, en su orden. `todo` es el enlace que lleva a TODO el menú (`/catalogo?menu=ropa`): el botón «Ropa»
 * de la cabecera y su primera línea en el celular (antes «Ropa» era un botón sin destino: al hacer clic, o con el dedo, no pasaba nada
 * y no había forma de ver toda la ropa junta). `titulo` es el de la lista, con lo último en cursiva roja.
 */
export const MENUS: readonly { clave: Menu; nombre: string; todo: string; titulo: [string, string] }[] = [
  { clave: "ropa", nombre: "Ropa", todo: "Toda la ropa", titulo: ["Toda la", "ropa"] },
  { clave: "accesorios", nombre: "Accesorios", todo: "Todos los accesorios", titulo: ["Todos los", "accesorios"] },
];

/** A donde va lo que nadie ordenó. */
const RESTO = "encima";

/** El grupo de una categoría, por su clave (el prefijo; sin prefijo, su nombre). Lo desconocido, a «Encima y más». */
export function grupoDe(claveDeCategoria: string): Grupo {
  return GRUPOS.find((g) => g.prefijos.includes(claveDeCategoria)) ?? GRUPOS.find((g) => g.clave === RESTO)!;
}

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

/** Un nombre partido para el título serif de la lista: lo último va en cursiva roja («Vestidos y *conjuntos*», «*Vestidos*»). */
export function tituloPartido(nombre: string): [string, string] {
  const i = nombre.trim().lastIndexOf(" ");
  return i < 0 ? ["", nombre.trim()] : [nombre.trim().slice(0, i), nombre.trim().slice(i + 1)];
}
