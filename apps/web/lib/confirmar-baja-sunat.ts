import "server-only";
import type { Json } from "@cayla-retail/database";
import { crearClienteAdmin } from "@/lib/supabase-admin";

// «Anulado» lo escribe solo el servidor (ADR-0673): `fn_confirmar_baja_sunat` acepta únicamente la llave de servicio. Se llama
// DESPUÉS de que Lucode dijo que SUNAT confirmó una baja que ya se pidió (`anular_comprobante` la anota con la sesión de quien la
// pide). Lo usan `/api/lucode/anular`, `/api/lucode/consultar-anulacion` y el barrido de `lib/consultar-comprobante.ts`.
//
// CONTRATO
//   PROMETE: nunca lanza. Devuelve el error de la base, o el de no tener la llave en el servidor, para que quien llama lo registre.
//   ASUME:   quien llama ya comprobó con la sesión de la persona que puede ver ese comprobante, y que la respuesta de Lucode es
//            «confirmada». Esta función no lo vuelve a mirar: la llave salta RLS.
//   NO HACE: no pide la baja ni le pregunta a Lucode. Si falla, la baja queda «en trámite» y el cron la confirma en su pasada.

export async function confirmarBajaEnLaBase(comprobanteId: string, respuesta: Json): Promise<{ error: string | null }> {
  let admin: ReturnType<typeof crearClienteAdmin>;
  try {
    admin = crearClienteAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const rpcLibre = admin.rpc.bind(admin) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
  const { error } = await rpcLibre("fn_confirmar_baja_sunat", { p_comprobante_id: comprobanteId, p_respuesta: respuesta });
  return { error: error?.message ?? null };
}
