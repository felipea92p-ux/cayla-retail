import type { createClient } from "@/lib/supabase/client";
import { BUCKET_DE_INSIGNIAS, LADO_IMAGEN_INSIGNIA, MAX_BYTES_IMAGEN_INSIGNIA, rutaDeImagenDeInsignia } from "@cayla-retail/shared/insignia-imagen";
import { INTENTOS_DE_COMPRESION_INSIGNIA, avisoDeProporcionInsignia, medidasEnElCuadrado, objecionImagenDeInsignia } from "./imagen-de-insignia-reglas";

// Preparar y subir la imagen propia de una insignia, desde el NAVEGADOR (Catálogo ▸ Insignias, ADR-0490). Mismo camino que las imágenes de las
// campañas (`imagen-de-campana.ts`): el archivo se reduce aquí y va directo al almacén público sin pasar por Next; la ruta recién queda en la base
// cuando se guarda la insignia (`fijar_icono_etiqueta`, con su llave y su responsable). Las reglas puras viven en `imagen-de-insignia-reglas.ts`.

type Cliente = ReturnType<typeof createClient>;

export type ImagenDeInsigniaPreparada = { archivo: File; aviso: string | null };

/** Reduce la imagen elegida a un WebP cuadrado de 256 px y 100 KB o menos: cabe entera en el cuadrado (con fondo transparente, para que un PNG
 *  recortado conserve su silueta) y baja la calidad y, si hace falta, el tamaño, hasta que quepa. Dice por qué no si no se puede. */
export async function prepararImagenDeInsignia(archivo: File): Promise<ImagenDeInsigniaPreparada | { error: string }> {
  const objecion = objecionImagenDeInsignia(archivo);
  if (objecion) return { error: objecion };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    return { error: "Este navegador no puede leer esa imagen. Prueba con una PNG o JPG (en el iPhone: Ajustes ▸ Cámara ▸ Formatos ▸ Más compatible)." };
  }
  try {
    const aviso = avisoDeProporcionInsignia(bitmap.width, bitmap.height);
    for (const [calidad, escala] of INTENTOS_DE_COMPRESION_INSIGNIA) {
      const lado = Math.max(16, Math.round(LADO_IMAGEN_INSIGNIA * escala));
      const m = medidasEnElCuadrado(bitmap.width, bitmap.height, lado);
      const lienzo = document.createElement("canvas");
      lienzo.width = lado;
      lienzo.height = lado;
      const ctx = lienzo.getContext("2d");
      if (!ctx) return { error: "No se pudo preparar la imagen en este navegador." };
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, m.x, m.y, m.ancho, m.alto);
      const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/webp", calidad));
      // Un navegador que no sabe escribir WebP devuelve PNG: no sirve (pesa de más y no es lo que se dice).
      if (!blob || blob.type !== "image/webp") return { error: "Este navegador no puede preparar la imagen (no sabe escribir WebP). Prueba con Chrome, Edge o Safari al día." };
      if (blob.size <= MAX_BYTES_IMAGEN_INSIGNIA) return { archivo: new File([blob], "insignia.webp", { type: "image/webp" }), aviso };
    }
    return { error: "Esa imagen sigue pesando más de 100 KB aun reducida. Prueba con una más sencilla." };
  } finally {
    bitmap.close();
  }
}

function leerErrorDeAlmacen(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("bucket not found")) return "El almacén de imágenes de las insignias no está configurado en este entorno.";
  if (["failed to fetch", "networkerror", "load failed", "name resolution", "fetch failed", "econnrefused"].some((t) => m.includes(t))) return "No se pudo conectar con el almacén de imágenes. Revisa la conexión e inténtalo de nuevo.";
  if (m.includes("payload too large") || m.includes("exceeded the maximum allowed size")) return "La imagen pesa más de lo permitido.";
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("violates")) return "No tienes permiso para subir imágenes de insignias.";
  return `Falló la subida: ${mensaje}`;
}

/** Sube la imagen ya reducida al almacén con un nombre nuevo (nunca pisa una anterior) y devuelve su ruta. La base la recibe después, con su llave. */
export async function subirImagenDeInsignia(supabase: Cliente, etiquetaId: string, archivo: File): Promise<{ ruta: string } | { error: string }> {
  const ruta = rutaDeImagenDeInsignia(etiquetaId, crypto.randomUUID());
  const { error } = await supabase.storage.from(BUCKET_DE_INSIGNIAS).upload(ruta, archivo, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) return { error: leerErrorDeAlmacen(error.message) };
  return { ruta };
}
