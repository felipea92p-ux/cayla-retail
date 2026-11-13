// «Catálogo con IA» (Editar y Nuevo producto): lo que no depende del navegador ni del servidor. El pedido a OpenAI vive en
// `openai-imagen-reglas.ts`; aquí, las medidas, los límites y el tope por persona.

/** La IA entrega 1024×1280: más de 1.600 px por lado no le suma nada y hace pasar el pedido del tope de Vercel (4,5 MB). */
export const LADO_MAXIMO_IA = 1600;
/** Lo que el servidor acepta por foto ya achicada. Cuatro fotos de 1 MB entran bajo los 4,5 MB de Vercel. */
export const MAX_BYTES_POR_FOTO_IA = 1024 * 1024;
/**
 * Pedidos por persona por minuto. Una prenda tiene a lo sumo 6 u 8 colores; 12 por minuto alcanza para prepararlos todos y frena un bucle
 * desbocado que gastaría el saldo de la cuenta (el mismo criterio que el padrón, `app/api/padron/route.ts`).
 */
export const TOPE_POR_MINUTO = 12;

/** El tamaño al que se achica una foto para la IA: el lado mayor a `maximo` como mucho, sin agrandar nunca y sin deformarla. */
export function medidasParaIA(ancho: number, alto: number, maximo: number): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/**
 * El tope por persona: `usos` es la ventana de cada persona (desde cuándo cuenta y cuántos lleva). Devuelve la ventana nueva y si se pasó.
 * Pura para poder probarla; el servidor guarda las ventanas en memoria (es un freno razonable, no un candado: cada instancia cuenta las suyas).
 */
export function contarPedido(
  ventana: { desde: number; usos: number } | undefined,
  ahora: number,
  tope = TOPE_POR_MINUTO,
): { ventana: { desde: number; usos: number }; excede: boolean } {
  if (!ventana || ahora - ventana.desde > 60_000) return { ventana: { desde: ahora, usos: 1 }, excede: false };
  const nueva = { desde: ventana.desde, usos: ventana.usos + 1 };
  return { ventana: nueva, excede: nueva.usos > tope };
}

// ---------- El par: la foto real y su versión de catálogo ----------
// La foto real se sube tal cual, como siempre (`fotos/<id>.<ext>`, ADR-0442), y su versión de catálogo vive a su lado con el mismo nombre más
// `.ia.png` (`fotos/<id>.jpg.ia.png`). Así, desde la foto de IA se llega a la real sin otra tabla ni columna: «Usar mi foto» y el molde salen
// del nombre. La base no cambia (la fila de `producto_fotos` guarda la URL que se elige).

const SUFIJO_IA = ".ia.png";

/** Dónde se guarda la versión de catálogo de una foto real ya subida. */
export function rutaDeLaFotoIA(rutaOriginal: string): string {
  return `${rutaOriginal}${SUFIJO_IA}`;
}

/** ¿Esta URL es una foto de catálogo hecha con IA? */
export function esFotoIA(url: string): boolean {
  return url.split("?")[0].endsWith(SUFIJO_IA);
}

/** La foto real de la que salió una foto de catálogo, o `null` si la URL no es de IA. */
export function originalDeLaFotoIA(url: string): string | null {
  const limpia = url.split("?")[0];
  return limpia.endsWith(SUFIJO_IA) ? limpia.slice(0, -SUFIJO_IA.length) : null;
}

/**
 * El MOLDE de una prenda: la foto de catálogo del primer color (en el orden de sus variantes) que ya la tiene, para que los demás colores salgan
 * con la misma estructura (Felipe 2026-11-13; medido: 99 % de la silueta). `null` si ningún color tiene foto de IA todavía.
 */
export function moldeDeLaPrenda(colores: readonly string[], fotos: readonly { url: string; colorCodigo: string | null }[]): string | null {
  for (const c of colores) {
    const ia = fotos.find((f) => f.colorCodigo === c && esFotoIA(f.url));
    if (ia) return ia.url;
  }
  // La foto «para todos los colores» (sin color) nunca es molde: puede mostrar la prenda en otra forma (formidable, 2026-11-13).
  return fotos.find((f) => f.colorCodigo !== null && esFotoIA(f.url))?.url ?? null;
}
