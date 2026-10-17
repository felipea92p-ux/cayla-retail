import type { createClient } from "@/lib/supabase/client";
import { leerErrorStorage } from "@/lib/muestra-atributo";
import { medidasReducidas, objecionMuestraElegida } from "@/lib/muestra-atributo-reglas";
import { FOTOS_CAMPANA_BUCKET, FOTO_FONDO_LADO_MAX, avisosDeLaFoto, rutaFotoDeFondo, tonoClaro } from "@/lib/foto-de-campana-reglas";

// La foto del fondo de una campaña, desde el NAVEGADOR (ADR-0436, actividad 8). El mismo camino que las fotos de muestra: se reduce aquí,
// va directo al almacén público sin pasar por Next, y la dirección recién queda en la base cuando se guarda el borrador (que revisa que el
// archivo esté en el almacén). Al reducirla se mide su tono (`tonoClaro`), con el que la revisión sabe si la letra se lee.

type Cliente = ReturnType<typeof createClient>;

/** El lado de la copia en chico con que se mide el tono: de sobra para saber qué tan clara es, y rápido. */
const LADO_MEDICION = 96;

export type FotoPreparada = { archivo: File; tono: string; avisos: string[] };

/** Reduce la foto elegida a JPG de 2000 px de lado largo y mide su tono. Si el navegador no sabe leerla (HEIC en Chrome), lo dice. */
export async function prepararFotoDeFondo(archivo: File): Promise<FotoPreparada | { error: string }> {
  const objecion = objecionMuestraElegida(archivo);
  if (objecion) return { error: objecion };
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    return { error: "Este navegador no puede leer esa foto. Prueba con una JPG o PNG (en el iPhone: Ajustes ▸ Cámara ▸ Formatos ▸ Más compatible)." };
  }
  const avisos = avisosDeLaFoto(imagen.width, imagen.height);
  const { ancho, alto } = medidasReducidas(imagen.width, imagen.height, FOTO_FONDO_LADO_MAX);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const chico = document.createElement("canvas");
  const medida = medidasReducidas(imagen.width, imagen.height, LADO_MEDICION);
  chico.width = medida.ancho;
  chico.height = medida.alto;
  const ctx = lienzo.getContext("2d");
  const ctxChico = chico.getContext("2d", { willReadFrequently: true });
  if (!ctx || !ctxChico) return { error: "No se pudo preparar la foto en este navegador." };
  // Fondo blanco: un PNG con transparencia no queda negro al pasar a JPG (y el tono se mide sobre lo mismo que se guarda).
  for (const c of [ctx, ctxChico]) {
    c.fillStyle = "#ffffff"; // tema-fijo: el papel detrás de una foto con transparencia, no un color de pantalla
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  }
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  ctxChico.drawImage(imagen, 0, 0, medida.ancho, medida.alto);
  imagen.close();
  const tono = tonoClaro(ctxChico.getImageData(0, 0, medida.ancho, medida.alto).data);
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) return { error: "No se pudo preparar la foto en este navegador." };
  return { archivo: new File([blob], "fondo.jpg", { type: "image/jpeg" }), tono, avisos };
}

/** Sube la foto ya preparada y devuelve su dirección pública. No toca la base: eso lo hace el guardado del borrador. */
export async function subirFotoDeFondo(supabase: Cliente, archivo: File): Promise<{ url: string } | { error: string }> {
  const almacen = supabase.storage.from(FOTOS_CAMPANA_BUCKET);
  const ruta = rutaFotoDeFondo(crypto.randomUUID());
  const subida = await almacen.upload(ruta, archivo, { contentType: "image/jpeg", upsert: false });
  if (subida.error) return { error: leerErrorStorage(subida.error.message) };
  return { url: almacen.getPublicUrl(ruta).data.publicUrl };
}
