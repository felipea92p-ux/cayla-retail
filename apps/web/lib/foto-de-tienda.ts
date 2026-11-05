import type { createClient } from "@/lib/supabase/client";
import { BUCKET_DE_TIENDAS, MAX_BYTES_FOTO_TIENDA, rutaDeFotoDeTienda } from "@cayla-retail/shared/tienda-web-sede";
import { INTENTOS_DE_COMPRESION, objecionImagenElegida } from "./imagen-de-campana-reglas";
import { avisoDeFachada, medidasDeFachada } from "./foto-de-tienda-reglas";

// Preparar y subir la foto de la fachada de una tienda, desde el NAVEGADOR (Tienda web ▸ Conf. Tienda). Mismo camino que la imagen de una
// campaña (`imagen-de-campana.ts`): el archivo se reduce aquí a WebP de 200 KB o menos y va directo al almacén público sin pasar por Next; la
// ruta recién queda en la base cuando se aprieta «Guardar» (`guardar_foto_tienda_web`, con su módulo y su responsable). Las reglas puras viven
// en `foto-de-tienda-reglas.ts`.

type Cliente = ReturnType<typeof createClient>;

export type FotoPreparada = { archivo: File; ancho: number; alto: number; aviso: string | null };

/** Reduce la foto elegida a WebP de 200 KB o menos: baja la calidad y, si hace falta, las medidas, hasta que quepa. Dice por qué no si no se puede. */
export async function prepararFotoDeTienda(archivo: File): Promise<FotoPreparada | { error: string }> {
  const objecion = objecionImagenElegida(archivo);
  if (objecion) return { error: objecion };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    return { error: "Este navegador no puede leer esa imagen. Prueba con una JPG o PNG (en el iPhone: Ajustes ▸ Cámara ▸ Formatos ▸ Más compatible)." };
  }
  try {
    const aviso = avisoDeFachada(bitmap.width, bitmap.height);
    const base = medidasDeFachada(bitmap.width, bitmap.height);
    for (const [calidad, escala] of INTENTOS_DE_COMPRESION) {
      const ancho = Math.max(1, Math.round(base.ancho * escala));
      const alto = Math.max(1, Math.round(base.alto * escala));
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext("2d");
      if (!ctx) return { error: "No se pudo preparar la foto en este navegador." };
      ctx.drawImage(bitmap, 0, 0, ancho, alto);
      const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/webp", calidad));
      // Un navegador que no sabe escribir WebP devuelve PNG: no sirve (pesa de más y no es lo que se dice).
      if (!blob || blob.type !== "image/webp") return { error: "Este navegador no puede preparar la foto (no sabe escribir WebP). Prueba con Chrome, Edge o Safari al día." };
      if (blob.size <= MAX_BYTES_FOTO_TIENDA) return { archivo: new File([blob], "fachada.webp", { type: "image/webp" }), ancho, alto, aviso };
    }
    return { error: "Esa foto sigue pesando más de 200 KB aun reducida. Prueba con una más sencilla." };
  } finally {
    bitmap.close();
  }
}

function leerErrorDeAlmacen(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("bucket not found")) return "El almacén de fotos de las tiendas no está configurado en este entorno.";
  if (["failed to fetch", "networkerror", "load failed", "name resolution", "fetch failed", "econnrefused"].some((t) => m.includes(t))) return "No se pudo conectar con el almacén de fotos. Revisa la conexión e inténtalo de nuevo.";
  if (m.includes("payload too large") || m.includes("exceeded the maximum allowed size")) return "La foto pesa más de lo permitido.";
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("violates")) return "No tienes permiso para subir fotos de las tiendas.";
  return `Falló la subida: ${mensaje}`;
}

/** Sube la foto ya reducida al almacén con un nombre nuevo (nunca pisa una anterior) y devuelve su ruta. */
export async function subirFotoDeTienda(supabase: Cliente, tiendaId: string, archivo: File): Promise<{ ruta: string } | { error: string }> {
  const ruta = rutaDeFotoDeTienda(tiendaId, crypto.randomUUID(), "webp");
  const { error } = await supabase.storage.from(BUCKET_DE_TIENDAS).upload(ruta, archivo, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) return { error: leerErrorDeAlmacen(error.message) };
  return { ruta };
}

/** La dirección pública de una ruta ya guardada, desde el navegador (para la vista previa). No hace ninguna llamada: arma la dirección. */
export function direccionDeFotoDeTienda(supabase: Cliente, ruta: string): string {
  return supabase.storage.from(BUCKET_DE_TIENDAS).getPublicUrl(ruta).data.publicUrl;
}
