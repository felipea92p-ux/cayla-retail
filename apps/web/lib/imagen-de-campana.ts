import type { createClient } from "@/lib/supabase/client";
import { BUCKET_DE_CAMPANAS, MAX_BYTES_IMAGEN_CAMPANA, rutaDeImagenDeCampana, urlDeImagenDeCampana, type TipoDeImagenDeCampana } from "@cayla-retail/shared";
import { INTENTOS_DE_COMPRESION, avisoDeProporcion, medidasReducidas, objecionImagenElegida } from "./imagen-de-campana-reglas";

// Preparar y subir la imagen propia de una campaña, desde el NAVEGADOR (Tienda web ▸ Campañas). Mismo camino que las fotos de las prendas
// (`producto-fotos.ts`, `muestra-atributo.ts`): el archivo se reduce aquí y va directo al almacén público sin pasar por Next; la ruta recién
// queda en la base cuando el líder guarda el diseño (`guardar_campana_diseno`, con su módulo y su responsable). Las reglas puras viven en
// `imagen-de-campana-reglas.ts`.

type Cliente = ReturnType<typeof createClient>;

export type ImagenPreparada = { archivo: File; ancho: number; alto: number; aviso: string | null };

/** Reduce la imagen elegida a WebP de 300 KB o menos: baja la calidad y, si hace falta, las medidas, hasta que quepa. Dice por qué no si no se puede. */
export async function prepararImagenDeCampana(archivo: File, tipo: TipoDeImagenDeCampana): Promise<ImagenPreparada | { error: string }> {
  const objecion = objecionImagenElegida(archivo);
  if (objecion) return { error: objecion };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    return { error: "Este navegador no puede leer esa imagen. Prueba con una JPG o PNG (en el iPhone: Ajustes ▸ Cámara ▸ Formatos ▸ Más compatible)." };
  }
  try {
    const aviso = avisoDeProporcion(bitmap.width, bitmap.height, tipo);
    const base = medidasReducidas(bitmap.width, bitmap.height, tipo);
    for (const [calidad, escala] of INTENTOS_DE_COMPRESION) {
      const ancho = Math.max(1, Math.round(base.ancho * escala));
      const alto = Math.max(1, Math.round(base.alto * escala));
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext("2d");
      if (!ctx) return { error: "No se pudo preparar la imagen en este navegador." };
      ctx.drawImage(bitmap, 0, 0, ancho, alto);
      const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/webp", calidad));
      // Un navegador que no sabe escribir WebP devuelve PNG: no sirve (pesa de más y no es lo que se dice).
      if (!blob || blob.type !== "image/webp") return { error: "Este navegador no puede preparar la imagen (no sabe escribir WebP). Prueba con Chrome, Edge o Safari al día." };
      if (blob.size <= MAX_BYTES_IMAGEN_CAMPANA) return { archivo: new File([blob], "campana.webp", { type: "image/webp" }), ancho, alto, aviso };
    }
    return { error: "Esa imagen sigue pesando más de 300 KB aun reducida. Prueba con una más sencilla." };
  } finally {
    bitmap.close();
  }
}

function leerErrorDeAlmacen(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("bucket not found")) return "El almacén de imágenes de las campañas no está configurado en este entorno.";
  if (["failed to fetch", "networkerror", "load failed", "name resolution", "fetch failed", "econnrefused"].some((t) => m.includes(t))) return "No se pudo conectar con el almacén de imágenes. Revisa la conexión e inténtalo de nuevo.";
  if (m.includes("payload too large") || m.includes("exceeded the maximum allowed size")) return "La imagen pesa más de lo permitido.";
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("violates")) return "No tienes permiso para subir imágenes de campañas.";
  return `Falló la subida: ${mensaje}`;
}

/** Sube la imagen ya reducida al almacén con un nombre nuevo (nunca pisa una anterior) y devuelve su ruta y su dirección pública. */
export async function subirImagenDeCampana(
  supabase: Cliente,
  etiquetaId: string,
  archivo: File,
): Promise<{ ruta: string; url: string } | { error: string }> {
  const ruta = rutaDeImagenDeCampana(etiquetaId, crypto.randomUUID(), "webp");
  const { error } = await supabase.storage.from(BUCKET_DE_CAMPANAS).upload(ruta, archivo, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) return { error: leerErrorDeAlmacen(error.message) };
  // La dirección pública sale del propio cliente (es la del proyecto donde vive el almacén).
  const url = supabase.storage.from(BUCKET_DE_CAMPANAS).getPublicUrl(ruta).data.publicUrl;
  return { ruta, url: urlDeImagenDeCampana(new URL(url).origin, ruta) ?? url };
}

/** La dirección pública de una ruta ya guardada, desde el navegador (para la vista previa del editor). */
export function direccionDeImagenDeCampana(supabase: Cliente, ruta: string): string {
  return supabase.storage.from(BUCKET_DE_CAMPANAS).getPublicUrl(ruta).data.publicUrl;
}
