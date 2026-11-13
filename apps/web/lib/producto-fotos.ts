import type { createClient } from "@/lib/supabase/client";
import { rutaDeLaFoto } from "@/lib/foto-encuadre";
import { rutaDelRecorte } from "@/lib/recorte-probador-reglas";
import { rutaDeLaFotoIA } from "@/lib/foto-catalogo-reglas";

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
// como `p_fotos`) — este archivo sube bytes y devuelve la URL. Desde el
// ADR-0434, además le pide por detrás su recorte al probador de la tienda.
//
// Desde el ADR-0442 (Felipe, 2026-10-17) la foto se sube TAL CUAL la entrega la IA del equipo: sin quitar el fondo, sin corregir la luz,
// sin encuadrarla ni reducirla. Se guarda en `fotos/<id>.<jpg|png|webp>` con la extensión de lo que es (un PNG con fondo transparente
// es lo que alimenta el armador de looks) y ya no hay `originales/`: la foto ES el original.

type Cliente = ReturnType<typeof createClient>;

export const PRODUCTO_FOTOS_BUCKET = "retail-productos-fotos";
export const PRODUCTO_FOTOS_MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"] as const;

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
 * Sube UNA foto tal cual y devuelve su URL pública, o el motivo por el que no se pudo (ADR-0442). Después, por detrás, intenta su
 * recorte para el armador de looks: solo lo logra si la imagen trae fondo transparente.
 */
export async function subirFotoProducto(supabase: Cliente, archivo: File): Promise<ResultadoSubidaFoto> {
  const objecion = objecionFotoProducto(archivo);
  if (objecion) return { error: objecion };

  const ruta = rutaDeLaFoto(crypto.randomUUID(), archivo.type);
  if (!ruta) return { error: "Solo se aceptan JPG, PNG o WebP." };
  const almacen = supabase.storage.from(PRODUCTO_FOTOS_BUCKET);
  const subida = await almacen.upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (subida.error) return { error: leerErrorStorage(subida.error.message) };

  const url = almacen.getPublicUrl(ruta).data.publicUrl;
  // El recorte para el probador de la tienda online (ADR-0434, actividad 2), por detrás: no hace esperar a quien sube la foto y, si
  // falla, la foto queda «sin recorte» para «Preparar recortes». Se carga recién aquí: casi ninguna pantalla lo necesita.
  void import("@/lib/recorte-probador")
    .then((m) => m.recortarAlSubir(supabase, { foto: ruta, url }, archivo))
    .catch((err) => console.warn("[producto-fotos] no se pudo empezar el recorte", err));
  return { url };
}

/**
 * «Catálogo con IA»: sube la foto real tal cual (como `subirFotoProducto`) y, a su lado, su versión de catálogo (`rutaDeLaFotoIA`: el mismo nombre
 * más `.ia.png`). Devuelve la URL de la de IA, que es la que queda en la ficha; la real siempre queda guardada para «Usar mi foto». La de IA es
 * un PNG transparente: también pide su recorte para el armador de looks. Si la de IA no sube, devuelve la real (nunca deja el color sin foto).
 */
export async function subirParDeCatalogo(supabase: Cliente, original: File, ia: Blob): Promise<{ url: string; conIA: boolean } | { error: string }> {
  const real = await subirFotoProducto(supabase, original);
  if ("error" in real) return real;
  const rutaReal = rutaDesdeUrl(real.url);
  if (!rutaReal) return { url: real.url, conIA: false };
  const ruta = rutaDeLaFotoIA(rutaReal);
  const almacen = supabase.storage.from(PRODUCTO_FOTOS_BUCKET);
  const subida = await almacen.upload(ruta, ia, { contentType: "image/png", upsert: false });
  if (subida.error) return { url: real.url, conIA: false };
  const url = almacen.getPublicUrl(ruta).data.publicUrl;
  void import("@/lib/recorte-probador")
    .then((m) => m.recortarAlSubir(supabase, { foto: ruta, url }, ia))
    .catch((err) => console.warn("[producto-fotos] no se pudo empezar el recorte", err));
  return { url, conIA: true };
}

/** La ruta dentro del bucket de una URL pública suya (`fotos/<id>.<ext>`), o `null` si la URL no es del bucket. */
function rutaDesdeUrl(url: string): string | null {
  const marca = `/object/public/${PRODUCTO_FOTOS_BUCKET}/`;
  const i = url.indexOf(marca);
  return i < 0 ? null : decodeURIComponent(url.slice(i + marca.length).split("?")[0]);
}

/**
 * Sube el recorte de una foto para el probador de la tienda online (ADR-0434): un PNG transparente en `recortes/<id>-<sello>.png`,
 * junto a la foto y su original (la foto no se toca). Va con `x-espera: no`: «Preparar recortes» sube cientos seguidos y el loader de
 * pantalla completa (ADR-0149) no dejaría ver el avance. Cada subida lleva su sello (`rutaDelRecorte`): nunca choca con un intento
 * anterior. La fila la anota `registrar_recorte`.
 */
export async function subirRecorteDeFoto(supabase: Cliente, foto: string, png: Blob): Promise<{ ruta: string } | { error: string }> {
  const ruta = rutaDelRecorte(foto, crypto.randomUUID().slice(0, 8));
  const { error } = await supabase.storage
    .from(PRODUCTO_FOTOS_BUCKET)
    .upload(ruta, png, { contentType: "image/png", upsert: false, headers: { "x-espera": "no" } });
  return error ? { error: leerErrorStorage(error.message) } : { ruta };
}

