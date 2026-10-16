import { cuantasPrendas, type CategoriaLista, type Lista, type Prenda } from "./catalogo";
import { grupoDe, GRUPOS, type Grupo, type GrupoConCategorias } from "./grupos";
import { hayAlgo, type Tienda } from "./stock";

// La lista del catálogo cuando la tienda elegida («Ver lo que hay en») no tiene lo que se pidió (2026-10-15, revisión de la tienda). El
// primer día, con Lima elegida, «Cinturones» decía «0 prendas de Cinturones en Lima · 3 más en otras tiendas», «No hay prendas aquí en
// Lima» y un botón «Ver todas las tiendas» que sonaba a la página de las tiendas; y ninguna píldora quedaba encendida, porque las
// píldoras salen de lo que hay en Lima. Aquí: en qué tienda sí hay, lo que se dice y lleva allá, y lo elegido siempre a la vista. Lógica
// pura, con su prueba al lado.

export type Donde<T extends Tienda = Tienda> = T & { cuantas: number };

/** En qué tiendas hay algo de `prendas` y cuántos modelos tiene cada una: solo las que tienen, la que más primero (empate: por nombre).
 *  Una prenda sin dato de stock no cuenta en ninguna (no se afirma lo que no se sabe). */
export function dondeHay<T extends Tienda>(prendas: readonly Prenda[], tiendas: readonly T[]): Donde<T>[] {
  return tiendas
    .map((t) => ({ ...t, cuantas: prendas.filter((p) => p.stock !== null && hayAlgo(p.stock.sedes[t.id])).length }))
    .filter((t) => t.cuantas > 0)
    .sort((a, b) => b.cuantas - a.cuantas || a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que se pidió, en minúsculas, para decir «No hay … en Lima»: la categoría o el grupo elegido o, sin ellos, lo propio de la lista. */
export function queSeBusca(lista: Lista, elegido: string | null): string {
  if (elegido) return elegido.trim().toLocaleLowerCase("es");
  const porLista: Record<Lista, string> = { todo: "prendas", nuevo: "nada nuevo", ofertas: "ofertas", vendidos: "más vendidos", favoritos: "favoritos" };
  return porLista[lista];
}

/** «Trujillo (3)», «Arequipa (2) y Trujillo (3)», «A (1), B (2) y C (3)». */
const unir = (partes: readonly string[]) => (partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`);

export type VacioEnTienda<T extends Tienda = Tienda> = {
  titulo: string;
  texto: string;
  /** El botón: lleva a la otra tienda que tiene (la única) o, si son varias, a todas (`tienda: null`). */
  boton: { texto: string; tienda: Donde<T> | null };
};

/**
 * Lo que dice la lista vacía en la tienda elegida cuando OTRA tienda sí tiene lo pedido: «No hay cinturones en Lima», «Pero hay 3
 * prendas en Trujillo.» y «Ver en Trujillo» (con varias: dónde hay y cuántas, y «Ver en todas las tiendas»). Si ninguna otra tiene,
 * `null`: lo que falta no es la tienda, y la lista dice su propio vacío.
 */
export function vacioEnTienda<T extends Tienda>(que: string, tienda: string, otras: readonly Donde<T>[]): VacioEnTienda<T> | null {
  if (otras.length === 0) return null;
  const titulo = `No hay ${que} en ${tienda}`;
  if (otras.length === 1) {
    const [otra] = otras;
    return { titulo, texto: `Pero hay ${cuantasPrendas(otra.cuantas)} en ${otra.nombre}.`, boton: { texto: `Ver en ${otra.nombre}`, tienda: otra } };
  }
  return { titulo, texto: `Pero hay en ${unir(otras.map((o) => `${o.nombre} (${o.cuantas})`))}.`, boton: { texto: "Ver en todas las tiendas", tienda: null } };
}

/** El lugar de una categoría en su grupo (el de su lista; lo que nadie ordenó, al final), como lo ordena `gruposDe`. */
const puestoEn = (g: Grupo, clave: string) => {
  const i = g.prefijos.indexOf(clave);
  return i < 0 ? g.prefijos.length : i;
};

/**
 * Los grupos de los filtros con lo elegido siempre a la vista: si la tienda elegida no tiene nada del grupo o de la categoría elegida,
 * igual salen (con 0), en su lugar, para que la persona vea dónde está. Sin nada elegido, los grupos tal cual.
 */
export function gruposConLoElegido(
  grupos: readonly GrupoConCategorias[],
  grupo: Grupo | null,
  categoria: CategoriaLista | null,
): GrupoConCategorias[] {
  if (!grupo) return [...grupos];
  let suyo: GrupoConCategorias = grupos.find((g) => g.clave === grupo.clave) ?? { ...grupo, cuantas: 0, categorias: [] };
  if (categoria && grupoDe(categoria.clave).clave === grupo.clave && !suyo.categorias.some((c) => c.clave === categoria.clave)) {
    const categorias = [...suyo.categorias, { clave: categoria.clave, nombre: categoria.nombre, cuantas: 0, prendas: [] }];
    categorias.sort((a, b) => puestoEn(grupo, a.clave) - puestoEn(grupo, b.clave));
    suyo = { ...suyo, categorias };
  }
  return GRUPOS.flatMap((g) => (g.clave === suyo.clave ? [suyo] : grupos.filter((x) => x.clave === g.clave)));
}

/** Las categorías de los filtros (cuando van todas en una fila) con la elegida siempre a la vista: si aquí no tiene nada, sale al final, con 0. */
export function categoriasConLaElegida(categorias: readonly CategoriaLista[], elegida: CategoriaLista | null): CategoriaLista[] {
  if (!elegida || categorias.some((c) => c.clave === elegida.clave)) return [...categorias];
  return [...categorias, { clave: elegida.clave, nombre: elegida.nombre, cuantas: 0 }];
}
