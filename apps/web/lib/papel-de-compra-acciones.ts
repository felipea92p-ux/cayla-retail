import { createClient } from "@/lib/supabase/client";
import { leerErrorStorage, objecionArchivo, tipoDeArchivo } from "@/lib/adjuntos-compra";
import { BUCKET_FOTOS_GASTO_VIAJE } from "@/lib/rendicion-reglas";
import { CARPETA_PAPELES } from "@/lib/papel-de-compra";

// Subir la foto del papel de una compra (ADR-0480). Vive sola (ADR-0674, actividad 7): la usan «Compré ropa» y Recibir (ponerle la foto a un
// papel que llegó sin ella), y por importarla de `compra-rapida-acciones.ts` Recibir bajaba las reglas de «Compré ropa» enteras.

/** Sube la foto del papel. `motivo` dice, en palabras de tienda, por qué no se subió. */
export async function subirFotoPapel(archivo: File): Promise<{ ruta: string | null; motivo: string | null }> {
  const objecion = objecionArchivo(archivo);
  if (objecion) return { ruta: null, motivo: objecion };
  const tipo = tipoDeArchivo(archivo)!;
  const extension = (archivo.name.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const ruta = `${CARPETA_PAPELES}${crypto.randomUUID()}.${extension}`;
  const subida = await createClient().storage.from(BUCKET_FOTOS_GASTO_VIAJE).upload(ruta, archivo, { contentType: tipo, upsert: false });
  if (subida.error) return { ruta: null, motivo: leerErrorStorage(subida.error.message) };
  return { ruta, motivo: null };
}
