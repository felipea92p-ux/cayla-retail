import type { createClient } from "@/lib/supabase/client";
import {
  MUESTRA_MAX_BYTES,
  MUESTRAS_BUCKET,
  medidasReducidas,
  objecionMuestraElegida,
  rutaMuestra,
  type TipoMuestra,
} from "@/lib/muestra-atributo-reglas";

// Subida de la foto de muestra de un tejido o un patrón, desde el NAVEGADOR (ADR-0256). Mismo camino que las fotos de
// producto (`producto-fotos.ts`): el archivo va directo al bucket público sin pasar por Next, y la URL recién queda en
// la base cuando la ruta `/api/productos/{tejidos,patrones}` la guarda (con su candado de Líder y del bucket).
//
// A diferencia de la foto de una prenda, aquí no se recorta el fondo: la muestra ES la tela, de borde a borde. Solo se
// reduce, para que la foto de 8 MB del celular entre en los 5 MB del bucket y la grilla no descargue megas por tarjeta.

type Cliente = ReturnType<typeof createClient>;

/** Reduce la foto elegida a JPG de 1600 px de lado largo. Si el navegador no sabe leerla (HEIC en Chrome), lo dice. */
export async function reducirMuestra(archivo: File): Promise<{ archivo: File } | { error: string }> {
  const objecion = objecionMuestraElegida(archivo);
  if (objecion) return { error: objecion };
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    return { error: "Este navegador no puede leer esa foto. Prueba con una JPG o PNG (en el iPhone: Ajustes ▸ Cámara ▸ Formatos ▸ Más compatible)." };
  }
  const { ancho, alto } = medidasReducidas(imagen.width, imagen.height);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return { error: "No se pudo preparar la foto en este navegador." };
  // Fondo blanco: un PNG con transparencia no queda negro al pasar a JPG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) return { error: "No se pudo preparar la foto en este navegador." };
  if (blob.size > MUESTRA_MAX_BYTES) return { error: "La foto sigue pesando más de 5 MB después de reducirla. Prueba con otra." };
  return { archivo: new File([blob], "muestra.jpg", { type: "image/jpeg" }) };
}

function leerErrorStorage(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("bucket not found")) return "El almacén de fotos no está configurado en este entorno.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed"))
    return "No se pudo conectar con el almacén de fotos. Revisa la conexión e inténtalo de nuevo.";
  if (m.includes("payload too large") || m.includes("exceeded the maximum allowed size")) return "La foto pesa más de lo permitido (5 MB).";
  if (m.includes("row-level security") || m.includes("unauthorized")) return "No tienes permiso para subir fotos.";
  return `No se pudo subir la foto: ${mensaje}`;
}

/** Sube la foto ya reducida y devuelve su URL pública. No toca la base: eso lo hace el PATCH al guardar. */
export async function subirMuestra(supabase: Cliente, tipo: TipoMuestra, archivo: File): Promise<{ url: string } | { error: string }> {
  const almacen = supabase.storage.from(MUESTRAS_BUCKET);
  const ruta = rutaMuestra(tipo, crypto.randomUUID());
  const subida = await almacen.upload(ruta, archivo, { contentType: "image/jpeg", upsert: false });
  if (subida.error) return { error: leerErrorStorage(subida.error.message) };
  return { url: almacen.getPublicUrl(ruta).data.publicUrl };
}
