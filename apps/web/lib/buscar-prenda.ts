/**
 * Cómo la caja reconoce una prenda a partir de lo que llega al buscador.
 *
 * Llegan dos cosas distintas por el mismo campo, y no se resuelven igual:
 *
 * - **Un escaneo.** La pistola teclea el código completo y manda Enter. Ahí no hay nada
 *   que elegir: o el código es de una prenda o no lo es. Y "código" son tres cosas que
 *   conviven en la tienda: el corto que imprime `EtiquetasGenerator` (`BLU-0042-AZM-M`),
 *   el SKU largo de las etiquetas viejas, y el que la prenda trae de fábrica y se adoptó en
 *   el censo. Los tres viven en `codigos_barras` (0047): "escanear cualquiera resuelve a
 *   la misma variante". Por eso se mira primero ahí, igual que hace el conteo
 *   (`ConteoPanel.resolver`). Y por si esa tabla no llegó —o una base no tiene el
 *   backfill—, el código corto y el SKU de la propia variante resuelven solos: la caja no
 *   puede depender de una consulta secundaria para vender.
 *
 * - **Texto a medias.** La Encargada escribe "blusa azul" o "0042" y elige de una lista.
 *   Ahí se busca en todo lo que ella ve —código, referencia, talla, color, SKU— sin que
 *   importen mayúsculas ni acentos ("marron" tiene que encontrar "Marrón").
 *
 * Hasta el 2026-09-11 la caja solo comparaba contra `sku`: la etiqueta impresa después del
 * censo no entraba al escanearla en Vender, aunque sí en el conteo. Esta pieza es pura y
 * tiene prueba (`buscar-prenda.test.ts`) justamente para que eso no se repita en silencio.
 */

export type PrendaBuscable = {
  varianteId: string;
  /** El corto (BLU-0042-AZM-M): lo que va en la etiqueta. Null si su color no está normalizado. */
  codigo: string | null;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
};

/** Minúsculas, sin acentos, sin espacios sobrantes — la misma clave que usa el conteo. */
export function clave(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Un escaneo: el texto completo ES un código. Devuelve la prenda o `null`.
 * `porCodigoBarras` es `codigos_barras` aplanada (código → variante_id); puede venir vacía.
 */
export function resolverCodigo<T extends PrendaBuscable>(
  texto: string,
  variantes: T[],
  porCodigoBarras: Record<string, string>
): T | null {
  const t = texto.trim();
  if (!t) return null;

  // 1. `codigos_barras`: la pistola manda el código tal cual está impreso; el teclado, como sea.
  const varianteId = porCodigoBarras[t] ?? porCodigoBarras[t.toUpperCase()];
  if (varianteId) {
    const v = variantes.find((x) => x.varianteId === varianteId);
    if (v) return v;
  }

  // 2. La propia variante: código corto, y el SKU como último respaldo.
  const k = t.toLowerCase();
  return variantes.find((v) => v.codigo?.toLowerCase() === k) ?? variantes.find((v) => v.sku.toLowerCase() === k) ?? null;
}

/** Texto a medias: lo que la Encargada ve de la prenda, en orden de aparición. */
export function filtrarPrendas<T extends PrendaBuscable>(texto: string, variantes: T[], max: number): T[] {
  const k = clave(texto);
  if (!k) return [];
  return variantes
    .filter((v) => clave(`${v.codigo ?? ""} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""} ${v.sku}`).includes(k))
    .slice(0, max);
}
