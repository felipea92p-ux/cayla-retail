/**
 * Hacia dónde abre la lista de un combo y de qué alto (la parte pura de `usePosicionLista`).
 *
 * Todo en el marco de la ventana (`getBoundingClientRect`). `techo` y `piso` son los bordes de lo que SE VE: el área visible sin el
 * teclado y, si la lista cuelga de una hoja que atrapa a los `fixed` (la hoja del celular, mientras sube o se arrastra), también sin lo
 * que esa hoja recorta. Con la hoja, la lista no puede pasar de su borde: un cálculo hecho solo contra la ventana la dibujaba más alta
 * que su lugar, la hoja la cortaba por arriba y el buscador y las primeras opciones quedaban fuera de la vista (Felipe, 2026-11-01,
 * filtros de Productos en el iPhone con el teclado abierto).
 */
export type EntradaAire = {
  /** Borde de arriba y de abajo del control que abre la lista. */
  controlTop: number;
  controlBottom: number;
  techo: number;
  piso: number;
  /** El alto que la lista querría tener. */
  alto: number;
  separacion: number;
  /** El panel no se desplaza por dentro (el calendario): abre hacia abajo solo si cabe entero. */
  entero?: boolean;
  /** La lista cuelga de una hoja que la recorta: su borde manda y no se le inventa un alto mínimo que se saldría. */
  recortada?: boolean;
};

const MARGEN = 8;
/** Con la hoja recortando, la lista no baja de lo que deja ver una opción y su buscador. */
const MINIMO_RECORTADA = 96;
const MINIMO_LIBRE = 120;

export function airePara({ controlTop, controlBottom, techo, piso, alto, separacion, entero = false, recortada = false }: EntradaAire): {
  haciaAbajo: boolean;
  maxHeight: number;
} {
  const abajo = piso - controlBottom - separacion - MARGEN;
  const arriba = controlTop - techo - separacion - MARGEN;
  // Abajo es lo esperado; arriba solo si abajo no alcanza y arriba hay más aire.
  const haciaAbajo = abajo >= (entero ? alto : Math.min(alto, 160)) || abajo >= arriba;
  const aire = haciaAbajo ? abajo : arriba;
  // Sin hoja se conserva lo de siempre (hacia abajo, mínimo de 120 y lo que sobre se desplaza; hacia arriba, ninguno).
  // Con la hoja, un mínimo corto en las dos direcciones: una lista de 20 px no se puede usar.
  const minimo = recortada ? MINIMO_RECORTADA : haciaAbajo ? MINIMO_LIBRE : 0;
  const maxHeight = Math.min(alto, Math.max(aire, minimo));
  return { haciaAbajo, maxHeight };
}
