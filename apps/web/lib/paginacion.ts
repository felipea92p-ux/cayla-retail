// Paginación: lógica pura, compartida por la paginación por URL (`components/Paginacion.tsx`, la base
// devuelve una página) y la paginación en memoria (`components/ui/PaginacionLocal.tsx`, la pantalla ya
// tiene todas las filas y solo decide cuántas pinta). Sin React ni Next: se importa desde ambos lados.

/** Los números de página a dibujar: siempre 1 y la última, la actual con un
 *  vecino a cada lado, y `null` donde hay que cortar con "…". Ej. con 36
 *  páginas y la 20 activa: 1 … 19 20 21 … 36. */
export function numerosDePagina(total: number, actual: number): (number | null)[] {
  const nums = new Set([1, total, actual - 1, actual, actual + 1]);
  const ordenados = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const salida: (number | null)[] = [];
  for (let i = 0; i < ordenados.length; i++) {
    if (i > 0 && ordenados[i] - ordenados[i - 1] > 1) salida.push(null);
    salida.push(ordenados[i]);
  }
  return salida;
}

export type Pagina<T> = {
  /** Solo las filas de esta página. */
  filas: T[];
  /** La página efectiva (1-based), ya acotada a [1, totalPaginas]. */
  pagina: number;
  totalPaginas: number;
  /** Posición (1-based) de la primera y la última fila mostrada; 0 y 0 si no hay filas. */
  desde: number;
  hasta: number;
};

/** Corta `filas` en la página pedida. Si la página ya no existe —se guardó algo, la lista se achicó y
 *  quedaste parada en la 7 de 6— devuelve la última en vez de una tabla vacía. */
export function paginar<T>(filas: T[], pagina: number, porPagina: number): Pagina<T> {
  const tamano = Math.max(1, Math.floor(porPagina));
  const totalPaginas = Math.max(1, Math.ceil(filas.length / tamano));
  const actual = Math.min(totalPaginas, Math.max(1, Math.floor(pagina) || 1));
  const inicio = (actual - 1) * tamano;
  const corte = filas.slice(inicio, inicio + tamano);
  return {
    filas: corte,
    pagina: actual,
    totalPaginas,
    desde: corte.length ? inicio + 1 : 0,
    hasta: inicio + corte.length,
  };
}
