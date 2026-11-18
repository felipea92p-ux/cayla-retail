import type { createClient } from "@/lib/supabase/client";
import { leerErrorStorage } from "@/lib/adjuntos-compra";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { argumentosDeFoto, BUCKET_FOTOS_DANADAS, objecionDeFoto, RPC_REGISTRAR_FOTO_DANADA, rutaDeFotoDanada, tipoDeFotoDanada } from "@/lib/danadas-foto";

// La foto del daño de una prenda dañada, desde el NAVEGADOR (ADR-0564, actividad 7): como las fotos de los gastos del viaje
// (`gastos-viaje-fotos.ts`), el archivo va directo al bucket y recién después se registra su fila; la fila es la que hace existir a la foto
// (un objeto sin fila es basura que nadie ve). Se llama DESPUÉS de reportar: la foto nunca frena el reporte.

type Cliente = ReturnType<typeof createClient>;

/** Sube la foto y registra su fila. `motivo` dice, en palabras de tienda, por qué no se subió. */
export async function subirFotoDanada(
  supabase: Cliente,
  danadaId: string,
  archivo: File,
  firma: Firma | FirmaOmitida | null,
): Promise<{ ok: boolean; motivo: string | null; error: ErrorDeBase }> {
  const objecion = objecionDeFoto(archivo);
  if (objecion) return { ok: false, motivo: objecion, error: null };
  const ruta = rutaDeFotoDanada(danadaId, archivo.name, crypto.randomUUID());
  const subida = await supabase.storage.from(BUCKET_FOTOS_DANADAS).upload(ruta, archivo, { contentType: tipoDeFotoDanada(archivo)!, upsert: false });
  if (subida.error) return { ok: false, motivo: leerErrorStorage(subida.error.message), error: null };
  const registro = await firmar(supabase.rpc(RPC_REGISTRAR_FOTO_DANADA, argumentosDeFoto(danadaId, ruta, archivo)), firma);
  if (registro.error) return { ok: false, motivo: null, error: registro.error };
  return { ok: true, motivo: null, error: null };
}
