import { categoriasDe, type CategoriaLista, type Prenda } from "./catalogo";
import {
  alCambiarDeNivel,
  compararTallas,
  escribirElegido,
  fraseDeTalla,
  hayElegido,
  huboSoltado,
  indexar,
  mensajeDeLoSoltado,
  NADA_ELEGIDO,
  nombreDeFamilia,
  prendaPasa,
  unir,
  variantesQueCoinciden,
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

/** Adónde lleva un enlace de la lista: lo elegido ya sin lo que allá no existe y, si se soltó algo, lo que se le dice a la persona. */
export type DestinoDeFiltros = { elegido: Elegido; quita: string | null };

/**
 * Lo elegido llevado a otro grupo o categoría (`destino`: sus prendas, sin filtrar; `donde`: cómo se llama): lo que allá no existe se
 * suelta, y el enlace ya sale así escrito, sin pasar por la corrección de la página. `quita` es el aviso que verá quien llegue («En
 * Pantalones no hay talla M: la quitamos»); sin nada soltado, `null`.
 */
export function elegidoEnElDestino(filtros: FiltrosDeLaLista, destino: readonly Prenda[], donde: string | null): DestinoDeFiltros {
  const { indice, elegido } = filtros;
  if (!indice || !hayElegido(elegido)) return { elegido: NADA_ELEGIDO, quita: null };
  const ids = destino.map((p) => p.id);
  const cambio = alCambiarDeNivel(indice, ids, elegido);
  return { elegido: cambio.elegido, quita: huboSoltado(cambio.soltado) ? mensajeDeLoSoltado(indice, ids, cambio.soltado, donde) : null };
}

/** Por qué una prenda está en la lista filtrada y cómo abre su ficha (ADR-0512, actividad 6). */
export type Coincidencia = {
  /** El código del color con que abre la ficha (`?color=`): el de la primera variante que cumple lo elegido. */
  color: string | null;
  /** La talla con que abre la ficha (`?talla=`): la primera de las elegidas que esa variante tiene. */
  talla: string | null;
  /** «En Negro · talla M», «En Negro / Beige y arena · tallas S y M»: los colores y tallas ELEGIDOS que la prenda tiene (no todos los suyos). */
  texto: string;
  /** Los códigos de los colores que cumplen lo elegido: sus muestras van primero y marcadas. */
  codigos: readonly string[];
};

/**
 * Lo que la tarjeta dice de una prenda de la lista filtrada: por qué está («En Negro · talla M»), qué muestras marcar y con qué color y talla
 * abre su ficha. La prenda se mira por su variante: abre en una que de verdad cumple lo elegido (aunque lo elegido sea solo la talla, abre en
 * un color que la tiene). Sin filtros, o si ninguna variante cumple, `null`: la tarjeta es la de siempre.
 */
export function coincidenciaDe(filtros: FiltrosDeLaLista, prenda: Pick<Prenda, "id">): Coincidencia | null {
  const { indice, elegido } = filtros;
  if (!indice || !hayElegido(elegido)) return null;
  const vs = variantesQueCoinciden(indice, prenda.id, elegido);
  if (vs.length === 0) return null;
  const sinRepetir = <T>(xs: readonly T[]) => [...new Set(xs)];
  // Los colores en el orden de la paleta (el de lo elegido), no en el que casualmente traen las variantes.
  const colores = elegido.color.filter((c) => vs.some((v) => v.familia === c)).map(nombreDeFamilia);
  const tallas = elegido.talla.length > 0 ? sinRepetir(vs.flatMap((v) => v.tallas.filter((t) => elegido.talla.includes(t)))).sort(compararTallas) : [];
  const partes = [
    // Con « / » y no con «y»: hay colores que ya llevan una («Beige y arena», «Blanco y crudo») y «Negro y Beige y arena» no se entiende.
    ...(colores.length > 0 ? [colores.join(" / ")] : []),
    ...(tallas.length > 0 ? [tallas.length === 1 ? fraseDeTalla(tallas[0]) : `tallas ${unir(tallas.map((t) => (t === "UNICA" ? "estándar / única" : t)), "y")}`] : []),
  ];
  const primera = vs[0];
  return {
    color: primera.codigo,
    talla: elegido.talla.length > 0 ? primera.tallas.find((t) => elegido.talla.includes(t)) ?? null : null,
    texto: `En ${partes.join(" · ")}`,
    codigos: sinRepetir(vs.flatMap((v) => (v.codigo ? [v.codigo] : []))),
  };
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
