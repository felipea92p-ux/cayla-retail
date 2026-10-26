import { categoriasDe, type CategoriaLista, type Prenda } from "./catalogo";
import {
  alCambiarDeNivel,
  escribirElegido,
  hayElegido,
  indexar,
  NADA_ELEGIDO,
  prendaPasa,
  type DatosDeFiltros,
  type Elegido,
  type Indice,
} from "./filtros-color-talla";
import type { GrupoConCategorias } from "./grupos";

// Lo que la lista del catálogo hace con los filtros de color y talla (ADR-0512, actividad 3). La regla de fondo vive en
// `filtros-color-talla.ts`; aquí está lo que la página necesita para usarla sobre sus prendas: filtrar, contar los grupos y las categorías con
// lo elegido, llevar lo elegido a otro grupo y decidir si la dirección que llegó ya está escrita como la escribe la tienda. Todo puro, sin red.

/** Lo elegido (ya llevado al nivel que se ve) y el índice con el que se decidió; sin índice (la base no respondió, o no se pidió nada), nada filtra. */
export type FiltrosDeLaLista = { indice: Indice | null; elegido: Elegido };

export const SIN_FILTROS: FiltrosDeLaLista = { indice: null, elegido: NADA_ELEGIDO };

/**
 * Lo que se pidió por la dirección, llevado al nivel que se ve (`delNivel`: las prendas de la lista con la tienda, el grupo, la categoría y la
 * campaña ya aplicados, sin filtrar por color ni talla). Lo que ahí no existe se suelta, y nunca queda «0 prendas» por lo elegido
 * (`alCambiarDeNivel`). Sin datos de la base, o sin nada pedido, no se filtra.
 */
export function filtrosDeLaLista(datos: DatosDeFiltros | null, pedido: Elegido, delNivel: readonly Prenda[]): FiltrosDeLaLista {
  if (!datos || !hayElegido(pedido)) return SIN_FILTROS;
  const indice = indexar(datos);
  return { indice, elegido: alCambiarDeNivel(indice, delNivel.map((p) => p.id), pedido).elegido };
}

/** Las prendas que cumplen lo elegido, en su orden. Sin filtros, todas. */
export function prendasQuePasan(filtros: FiltrosDeLaLista, prendas: readonly Prenda[]): Prenda[] {
  const { indice, elegido } = filtros;
  return indice && hayElegido(elegido) ? prendas.filter((p) => prendaPasa(indice, p.id, elegido)) : [...prendas];
}

/** Lo elegido llevado a otro grupo o categoría (`destino`: sus prendas, sin filtrar): lo que allá no existe se suelta, y el enlace ya sale así
 *  escrito, sin pasar por la corrección de la página. */
export function elegidoEnElDestino(filtros: FiltrosDeLaLista, destino: readonly Prenda[]): Elegido {
  const { indice, elegido } = filtros;
  return indice && hayElegido(elegido) ? alCambiarDeNivel(indice, destino.map((p) => p.id), elegido).elegido : NADA_ELEGIDO;
}

type Direccion = { color?: string | string[]; talla?: string | string[] };

/**
 * ¿La dirección ya trae lo elegido tal como lo escribe la tienda (`?color=negro,blanco&talla=M`, en su orden, sin repetir ni vacíos)? Si no
 * (una dirección escrita a mano, una talla que ahí no existe, un `?color=` vacío, dos `color=`), la página manda a la que sí: así hay UNA
 * dirección por lista filtrada y la caché y el buscador no ven mil formas de la misma. Sin `color` ni `talla`, siempre sí.
 */
export function esLaDireccionCanonica(direccion: Direccion, elegido: Elegido): boolean {
  const escrito = escribirElegido(elegido);
  const crudo = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return crudo(direccion.color) === escrito.color && crudo(direccion.talla) === escrito.talla;
}

/**
 * Los grupos con sus números según lo elegido, SIN cambiar cuáles hay ni en qué orden están: quien filtra ve siempre los mismos grupos, y uno que
 * con lo elegido da 0 se queda en su lugar (la página lo apaga, no lo esconde). `pasan`: los ids de las prendas que cumplen lo elegido.
 */
export function gruposConLaCuenta(grupos: readonly GrupoConCategorias[], pasan: ReadonlySet<string>): GrupoConCategorias[] {
  return grupos.map((g) => {
    const categorias = g.categorias.map((c) => {
      const prendas = c.prendas.filter((p) => pasan.has(p.id));
      return { ...c, prendas, cuantas: prendas.length };
    });
    return { ...g, categorias, cuantas: categorias.reduce((n, c) => n + c.cuantas, 0) };
  });
}

/** Lo mismo para las categorías de la fila única: las mismas, en el mismo orden, con su cuenta de lo que cumple lo elegido (`filtradas`). */
export function categoriasConLaCuenta(categorias: readonly CategoriaLista[], filtradas: readonly Prenda[]): CategoriaLista[] {
  const cuantas = new Map(categoriasDe(filtradas).map((c) => [c.clave, c.cuantas]));
  return categorias.map((c) => ({ ...c, cuantas: cuantas.get(c.clave) ?? 0 }));
}
