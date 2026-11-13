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
