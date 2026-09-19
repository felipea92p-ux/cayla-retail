// Qué foto muestra una fila de traslado. Sin imports de servidor ni del alias
// `@/`: vitest local no lo resuelve, y esto es lógica pura que se prueba sola.

/** Una fila de `producto_fotos`, tal como sale de la base. */
export type FotoCruda = { url: string; orden: number; es_principal: boolean; color_codigo: string | null };

/** Una miniatura para la fila de un traslado. */
export type FotoTraslado = {
  /** URL pública directa del bucket `retail-productos-fotos`: no expira, no se firma. */
  url: string;
  /** Nombre de la prenda: sirve para el tooltip. La imagen es decorativa (alt vacío), el texto ya está al lado. */
  referencia: string;
};

/** Cuántas miniaturas caben en la celda «Contenido» sin volverla un collage. */
export const MAX_FOTOS_TRASLADO = 3;

/**
 * La foto de UNA variante: la de su color y, si ese color no tiene foto, una foto GENERAL del
 * producto (la que se subió sin color). Nunca la foto de OTRO color.
 *
 * Es a propósito más estricta que `fn_resumen_variantes`, que cae a cualquier foto principal:
 * al recibir un bulto se cuenta por color, y una blusa Verde con la foto de la Blanca hace que
 * la encargada dude de lo que tiene en la mano. Una miniatura equivocada es peor que ninguna.
 *
 * Dentro de las candidatas gana la principal y luego la de menor orden.
 */
export function fotoDeVariante(fotos: FotoCruda[], colorCodigo: string | null): string | null {
  const delColor = colorCodigo === null ? [] : fotos.filter((f) => f.color_codigo === colorCodigo);
  const candidatas = delColor.length > 0 ? delColor : fotos.filter((f) => f.color_codigo === null);
  if (candidatas.length === 0) return null;
  return [...candidatas].sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden)[0].url;
}

/**
 * Hasta `MAX_FOTOS_TRASLADO` miniaturas para un traslado: las líneas más grandes primero (lo que
 * más pesa en el bulto), sin repetir (varias tallas del mismo color comparten foto) y sin
 * inventar nada: la variante que no tiene foto se omite, no se rellena.
 */
export function fotosDelTraslado(
  items: { cantidad: number; productoId: string | null; colorCodigo: string | null; referencia: string | null }[],
  fotosPorProducto: Map<string, FotoCruda[]>
): FotoTraslado[] {
  const vistas = new Set<string>();
  const salida: FotoTraslado[] = [];
  // Orden estable y determinista: por cantidad y, a igual cantidad, por nombre — el orden con el
  // que PostgREST devuelve las líneas no está garantizado.
  const ordenadas = [...items].sort((a, b) => b.cantidad - a.cantidad || (a.referencia ?? "").localeCompare(b.referencia ?? "") || (a.colorCodigo ?? "").localeCompare(b.colorCodigo ?? ""));
  for (const it of ordenadas) {
    if (!it.productoId) continue;
    const url = fotoDeVariante(fotosPorProducto.get(it.productoId) ?? [], it.colorCodigo);
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    salida.push({ url, referencia: it.referencia ?? "" });
    if (salida.length === MAX_FOTOS_TRASLADO) break;
  }
  return salida;
}
