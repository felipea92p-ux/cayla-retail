import type { createClient } from "@/lib/supabase/client";

// Muestra real de un color (20260915230000_colores_tipo_y_muestra.sql):
// sube DESDE EL NAVEGADOR al bucket público `retail-colores-muestras` y
// devuelve la URL pública para guardarla en `colores.imagen_muestra_url`
// vía POST/PATCH de /api/productos/colores. Sin RPC de registro (a
// diferencia de adjuntos-compra.ts): no hay un candado de negocio que
// validar antes de que el objeto exista — el candado real es
// `colores_write_lider`, que ya protege quién puede guardar la URL en la fila.

export const MUESTRA_BUCKET = "retail-colores-muestras";
export const MUESTRA_TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const MUESTRA_MAX_BYTES = 5 * 1024 * 1024;

type Cliente = ReturnType<typeof createClient>;

export function objecionMuestra(f: File): string | null {
  const tipo = tipoDeArchivo(f);
  if (!tipo) return "Solo se aceptan imágenes (JPG, PNG, WebP, HEIC).";
  if (f.size <= 0) return "El archivo está vacío.";
  if (f.size > MUESTRA_MAX_BYTES) return `Pesa ${Math.round(f.size / 1024 / 1024)} MB; el máximo es 5 MB.`;
  return null;
}

function tipoDeArchivo(f: File): string | null {
  if ((MUESTRA_TIPOS as readonly string[]).includes(f.type)) return f.type;
  const ext = f.name.toLowerCase().split(".").pop();
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if ((ext === "jpg" || ext === "jpeg") && !f.type) return "image/jpeg";
  return null;
}

export async function subirMuestraColor(supabase: Cliente, f: File): Promise<{ url: string | null; error: string | null }> {
  const objecion = objecionMuestra(f);
  if (objecion) return { url: null, error: objecion };

  const tipo = tipoDeArchivo(f)!;
  const limpio = f.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
  const ruta = `${crypto.randomUUID()}-${limpio || "muestra"}`;

  const subida = await supabase.storage.from(MUESTRA_BUCKET).upload(ruta, f, { contentType: tipo, upsert: false });
  if (subida.error) return { url: null, error: leerErrorStorage(subida.error.message) };

  const { data } = supabase.storage.from(MUESTRA_BUCKET).getPublicUrl(ruta);
  return { url: data.publicUrl, error: null };
}

function leerErrorStorage(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("bucket not found")) return "El almacén de muestras no está configurado en este entorno.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed"))
    return "No se pudo conectar con el almacén de archivos. Revisa la conexión e inténtalo de nuevo.";
  if (m.includes("payload too large") || m.includes("exceeded the maximum allowed size")) return "La imagen pesa más de lo permitido (5 MB).";
  if (m.includes("mime type") || m.includes("not supported")) return "Ese tipo de imagen no está permitido.";
  if (m.includes("row-level security") || m.includes("unauthorized")) return "No tienes permiso para subir imágenes.";
  return `No se pudo subir la muestra: ${mensaje}`;
}
