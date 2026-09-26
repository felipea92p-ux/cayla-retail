import type { createClient } from "@/lib/supabase/client";
import { rutasFotoPrenda } from "@/lib/foto-encuadre";

// Subida de fotos de producto desde el NAVEGADOR
// (20260915224500_producto_fotos_temporada_venta_sin_stock.sql). Mismo
// principio que `adjuntos-compra.ts`: el archivo va directo del navegador
// al bucket, sin pasar por Next. A diferencia de los adjuntos de compra
// (bucket privado, ruta con el id de la compra), acá el bucket
// `retail-productos-fotos` es PÚBLICO — una foto de producto existe para
// mostrarse, no para protegerse — así que la ruta no necesita llevar el id
// del producto (todavía no existe cuando se sube la primera foto en
// /productos/nuevo) y la URL pública sale directo de `getPublicUrl`.
//
// La fila en `producto_fotos` recién se escribe al guardar el formulario
// (dentro de `catalogo_crear_producto`/`catalogo_actualizar_producto`,
// como `p_fotos`) — este archivo solo sube bytes y devuelve la URL.
//
// Desde el ADR-0220 (2026-09-26) lo que llega acá ya viene preparado en el
// navegador (`preparar-foto.ts`): encuadrado en 1200×1500 sobre blanco, con o
// sin fondo según eligió quien la sube. Se guarda en `fotos/<id>.jpg` y, si
// viene, su original en `originales/<id>.jpg` —mismo id—, para poder volver a
// procesar el catálogo sin volver a fotografiar nada.

type Cliente = ReturnType<typeof createClient>;

export const PRODUCTO_FOTOS_BUCKET = "retail-productos-fotos";
export const PRODUCTO_FOTOS_MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"] as const;

/** Lo que se puede ELEGIR para subir (ADR-0220): la foto no se sube tal cual —se reduce y encuadra antes—, así que
 *  aguanta la foto entera de un celular. Lo que llega al almacén lo vuelve a validar `objecionFotoProducto`. */
export const FOTO_ELEGIDA_MAX_BYTES = 25 * 1024 * 1024;

export function objecionFotoElegida(f: File): string | null {
  if (!(TIPOS_ACEPTADOS as readonly string[]).includes(f.type)) return "Solo se aceptan JPG, PNG o WebP.";
  if (f.size <= 0) return "El archivo está vacío.";
  if (f.size > FOTO_ELEGIDA_MAX_BYTES) return `Pesa ${(f.size / (1024 * 1024)).toFixed(1)} MB; el máximo es 25 MB.`;
  return null;
}

export function objecionFotoProducto(f: File): string | null {
  if (!(TIPOS_ACEPTADOS as readonly string[]).includes(f.type)) return "Solo se aceptan JPG, PNG o WebP.";
  if (f.size <= 0) return "El archivo está vacío.";
  if (f.size > PRODUCTO_FOTOS_MAX_BYTES) return `Pesa ${(f.size / (1024 * 1024)).toFixed(1)} MB; el máximo es 5 MB.`;
  return null;
}

function leerErrorStorage(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("bucket not found")) return "El almacén de fotos no está configurado en este entorno.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed"))
    return "No se pudo conectar con el almacén de archivos. Revisa la conexión e inténtalo de nuevo.";
  if (m.includes("payload too large") || m.includes("exceeded the maximum allowed size")) return "El archivo pesa más de lo permitido (5 MB).";
  if (m.includes("mime type") || m.includes("not supported")) return "Ese tipo de archivo no está permitido.";
  if (m.includes("row-level security") || m.includes("unauthorized")) return "No tienes permiso para subir fotos.";
  return `No se pudo subir: ${mensaje}`;
}

export type ResultadoSubidaFoto = { url: string } | { error: string };

/**
 * Sube UNA foto y devuelve su URL pública, o el motivo por el que no se pudo. `original` es la foto tal cual la tomaron
 * (ADR-0220): si no sube, la foto elegida sigue siendo válida y se sube igual —perder el original solo quita la opción
 * de reprocesarla, no la foto del producto—.
 */
export async function subirFotoProducto(supabase: Cliente, archivo: File, original?: Blob | null): Promise<ResultadoSubidaFoto> {
  const objecion = objecionFotoProducto(archivo);
  if (objecion) return { error: objecion };

  const almacen = supabase.storage.from(PRODUCTO_FOTOS_BUCKET);
  const rutas = rutasFotoPrenda(crypto.randomUUID());
  if (original) {
    const subidaOriginal = await almacen.upload(rutas.original, original, { contentType: original.type || "image/jpeg", upsert: false });
    if (subidaOriginal.error) console.warn("[producto-fotos] el original no subió", subidaOriginal.error.message);
  }
  const subida = await almacen.upload(rutas.foto, archivo, { contentType: archivo.type, upsert: false });
  if (subida.error) return { error: leerErrorStorage(subida.error.message) };

  return { url: almacen.getPublicUrl(rutas.foto).data.publicUrl };
}
