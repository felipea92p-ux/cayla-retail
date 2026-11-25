import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";

// Lo que la computadora le pide a la base para la foto por QR (ADR-0699). Las lecturas van con `x-espera: no`: mientras el QR está a la
// vista se pregunta cada pocos segundos, y eso nunca debe abrir el loader.

export type PermisoDeFoto = { id: string; token: string; venceEn: string };

export async function crearFotoPorQr(despachoId: string, paradaClave: string, nombre: string, firma: Firma | null): Promise<{ permiso: PermisoDeFoto | null; error: string | null }> {
  const { data, error } = (await firmar(createClient().rpc("crear_foto_por_qr" as never, { p_despacho_id: despachoId, p_parada_clave: paradaClave, p_nombre: nombre } as never), firma)) as unknown as {
    data: { id: string; token: string; vence_en: string }[] | null;
    error: { message: string } | null;
  };
  const fila = data?.[0];
  if (error || !fila) return { permiso: null, error: error?.message ?? "No se pudo crear el código" };
  return { permiso: { id: fila.id, token: fila.token, venceEn: fila.vence_en }, error: null };
}

/** Las fotos que llegaron y todavía no se recogen. Una falla de red responde vacío: se vuelve a preguntar en el próximo turno. */
export async function fotosQueLlegaron(qrId: string): Promise<string[]> {
  const { data, error } = (await createClient().rpc("fn_fotos_por_qr_llegadas" as never, { p_qr_id: qrId } as never).setHeader("x-espera", "no")) as unknown as {
    data: { archivo_id: string }[] | null;
    error: unknown;
  };
  if (error || !data) return [];
  return data.map((f) => f.archivo_id);
}

/** Trae una foto que llegó (y el servidor la borra del almacén). `null` si no se pudo: se vuelve a intentar en el próximo turno. */
export async function recogerFoto(archivoId: string): Promise<File | null> {
  try {
    const r = await fetch(`/api/recibir/foto-qr/${archivoId}`, { headers: { "x-espera": "no" }, cache: "no-store" });
    if (!r.ok) return null;
    const blob = await r.blob();
    const ext = blob.type.split("/")[1] ?? "jpg";
    return new File([blob], `foto-del-celular.${ext}`, { type: blob.type || "image/jpeg" });
  } catch {
    // relleno-a-proposito: sin red, la foto sigue esperando en el almacén y se vuelve a pedir en el próximo turno.
    return null;
  }
}
