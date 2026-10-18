// Qué fotos de prenda pasan por el optimizador de imágenes de Next (ADR-0168). Lógica pura: se prueba en
// `foto-prenda-reglas.test.ts` y la usa `ImagenDePrenda` (cliente), la `<Image>` de `FotoPrenda`, `MiniaturaPrenda` y `TilePrenda`.

/**
 * ¿Esta foto la puede achicar el optimizador? Solo si vive en el Storage PÚBLICO de nuestro propio Supabase: es lo
 * único que `next.config.ts` le permite leer. Cualquier otra (un host distinto, una URL rota, otro entorno) se muestra
 * tal cual. No es un detalle: `next/image` con un host no permitido no falla en silencio, LANZA y tumba la pantalla
 * entera (visto en local el 2026-09-22). Mejor una foto pesada que una pantalla caída.
 */
export function fotoOptimizable(fotoUrl: string, supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  try {
    const foto = new URL(fotoUrl);
    const base = new URL(supabaseUrl);
    return foto.origin === base.origin && foto.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

/**
 * Qué color se pinta DETRÁS de la foto de una prenda. El color de la prenda se ve solo mientras la foto llega (en vez de una caja
 * vacía); apenas carga, nada: desde el ADR-0442 la foto es un PNG con fondo transparente, y si el color se quedara, la prenda se
 * vería sobre el color de su primer color de catálogo («Blusa Burdeos de Rayas» sobre chocolate, 2026-10-18). Sobre un JPG no cambia
 * nada: lo tapa entero. `undefined` = sin fondo (el de la tarjeta).
 */
export function fondoDeLaFoto(colorHex: string | null | undefined, cargada: boolean): string | undefined {
  return !cargada && colorHex ? colorHex : undefined;
}
