// Qué fotos de prenda pasan por el optimizador de imágenes de Next (ADR-0168). Lógica pura: se prueba en
// `foto-prenda-reglas.test.ts` y la usa `FotoPrenda` (cliente).

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
