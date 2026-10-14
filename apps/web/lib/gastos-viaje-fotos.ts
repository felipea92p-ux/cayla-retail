import type { createClient } from "@/lib/supabase/client";
import { leerErrorStorage, objecionArchivo, tipoDeArchivo } from "@/lib/adjuntos-compra";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { BUCKET_FOTOS_GASTO_VIAJE, RPC_FOTOS_GASTO_VIAJE, RPC_REGISTRAR_FOTO_GASTO_VIAJE } from "@/lib/rendicion-reglas";

// La foto del papel de un gasto del viaje (ADR-0362, fase 6 · actividad 5; 20261013233000 y 20261013234000), desde el NAVEGADOR: como los
// adjuntos de una factura (`adjuntos-compra.ts`), el archivo va directo al bucket y recién después se registra su fila; la fila es la que
// hace existir a la foto (un objeto sin fila es basura que nadie ve). Mismos límites: 10 MB, fotos (JPG, PNG, WebP, HEIC) o PDF.

type Cliente = ReturnType<typeof createClient>;

/** La carpeta del gasto y un uuid delante del nombre (dos «boleta.jpg» no chocan); el nombre, en ASCII simple. */
function rutaPara(gastoId: string, f: File): string {
  const limpio = f.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
  return `${gastoId}/${crypto.randomUUID()}-${limpio || "foto"}`;
}

/** Sube la foto y registra su fila. `motivo` dice, en palabras de tienda, por qué no se subió. */
export async function subirFotoGastoViaje(
  supabase: Cliente,
  gastoId: string,
  archivo: File,
  firma: Firma | FirmaOmitida | null,
): Promise<{ ok: boolean; motivo: string | null; error: ErrorDeBase }> {
  const objecion = objecionArchivo(archivo);
  if (objecion) return { ok: false, motivo: objecion, error: null };
  const tipo = tipoDeArchivo(archivo)!;
  const ruta = rutaPara(gastoId, archivo);
  const subida = await supabase.storage.from(BUCKET_FOTOS_GASTO_VIAJE).upload(ruta, archivo, { contentType: tipo, upsert: false });
  if (subida.error) return { ok: false, motivo: leerErrorStorage(subida.error.message), error: null };
  const registro = await firmar(
    supabase.rpc(RPC_REGISTRAR_FOTO_GASTO_VIAJE as never, {
      p_gasto_id: gastoId,
      p_ruta: ruta,
      p_nombre: archivo.name || "foto",
      p_tipo: tipo,
      p_bytes: archivo.size,
    } as never),
    firma,
  );
  if (registro.error) return { ok: false, motivo: null, error: registro.error };
  return { ok: true, motivo: null, error: null };
}

/** El enlace (10 minutos) a la primera foto de un gasto, o null si no tiene o no se pudo firmar. */
export async function enlaceFotoGastoViaje(supabase: Cliente, gastoId: string): Promise<string | null> {
  const { data, error } = (await supabase.rpc(RPC_FOTOS_GASTO_VIAJE as never, { p_gastos: [gastoId] } as never)) as unknown as {
    data: unknown;
    error: ErrorDeBase;
  };
  const primera: unknown = !error && Array.isArray(data) ? data[0] : null;
  const ruta = primera && typeof primera === "object" && typeof (primera as { ruta?: unknown }).ruta === "string" ? (primera as { ruta: string }).ruta : null;
  if (!ruta) return null;
  const firmado = await supabase.storage.from(BUCKET_FOTOS_GASTO_VIAJE).createSignedUrl(ruta, 600);
  return firmado.data?.signedUrl ?? null;
}
