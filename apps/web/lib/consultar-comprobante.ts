import type { Json } from "@cayla-retail/database";
import { consultarAnulacionLucode, consultarEstadoLucode, entornoLucode, type TipoDocumentoLucode } from "@/lib/lucode";
import { accionPorBaja, accionPorEmision, queConsultar, type AccionConsulta } from "@/lib/consulta-sunat-reglas";
import { capturarError } from "@/lib/errores";
import type { Cliente } from "@/lib/transmitir-comprobante";

// Preguntarle a Lucode por UN comprobante que quedó esperando a SUNAT —su emisión respondió PENDIENTE, o pidió
// una baja que no se confirmó— y anotar la respuesta. Lo llama el barrido de `/api/lucode/reintentar` con lo que
// reserva `fn_tomar_comprobantes_para_consultar` (`20261007200000`). Solo servidor: usa el token de Lucode.
//
// CONTRATO
//   PROMETE: solo LEE de Lucode (`/api/v3/status`): nunca reenvía un comprobante ni una baja. Escribe en la base
//            únicamente un estado final que SUNAT confirmó (aceptado, rechazado o baja confirmada).
//   ASUME:   el cliente trae la sesión de quien barre (RLS y `fn_puede_operar_ubicacion` deciden) o es la llave
//            de servicio del trabajo programado.
//   NO HACE: no decide qué significa cada respuesta: eso es `lib/consulta-sunat-reglas.ts`.

/** La respuesta del envío con lo que dijo la consulta. Conserva la forma de `ResultadoLucode` en la raíz —la
 *  pantalla lee `pdfUrl`, `xmlUrl` y `cdrUrl` de ahí (`lib/comprobantes.ts`, `EnviarBoleta`)—: el hash y el XML
 *  salieron del envío; el estado y el CDR, de la consulta cuando los trae. */
function respuestaConConsulta(envio: unknown, consulta: Extract<Awaited<ReturnType<typeof consultarEstadoLucode>>, { ok: true }>) {
  const antes = envio && typeof envio === "object" ? (envio as Record<string, Json>) : {};
  const url = (nueva: string | null, vieja: Json | undefined): Json => nueva ?? (typeof vieja === "string" ? vieja : null);
  return {
    ...antes,
    estado: consulta.estado,
    cdrUrl: url(consulta.cdrUrl, antes.cdrUrl),
    pdfUrl: url(consulta.pdfUrl, antes.pdfUrl),
    xmlUrl: url(consulta.xmlUrl, antes.xmlUrl),
    consulta: { ...consulta, consultado_at: new Date().toISOString() },
  } satisfies Json;
}

export type ResultadoConsulta = { id: string; consulta: "emision" | "baja" | null; accion: AccionConsulta["tipo"] | "error" };

export async function consultarComprobante(supabase: Cliente, id: string): Promise<ResultadoConsulta> {
  const { data: c, error } = await supabase
    .from("comprobantes")
    .select("id, tipo, serie, numero, estado, entorno_transmision, anulacion_solicitada_at, respuesta_sunat")
    .eq("id", id)
    .maybeSingle();
  if (error || !c) return { id, consulta: null, accion: "error" };

  const consulta = queConsultar(c, entornoLucode());
  if (!consulta) return { id, consulta, accion: "nada" };
  const tipo = c.tipo as TipoDocumentoLucode;

  if (consulta === "emision") {
    const r = await consultarEstadoLucode(tipo, c.serie, c.numero);
    // Lucode no respondió: no es una respuesta de SUNAT. Se vuelve a preguntar en la próxima pasada.
    if (!r.ok) return { id, consulta, accion: "error" };
    const accion = accionPorEmision(r.estado, r.mensaje);
    if (accion.tipo !== "actualizar") return { id, consulta, accion: accion.tipo };
    const { error: errGuardar } = await supabase.rpc("actualizar_transmision_comprobante", {
      p_comprobante_id: c.id,
      p_estado: accion.estado,
      p_entorno: r.entorno,
      p_respuesta_sunat: respuestaConConsulta(c.respuesta_sunat, r),
      p_motivo_rechazo: accion.motivoRechazo ?? undefined,
    });
    if (errGuardar) {
      capturarError("lucode/consultar: SUNAT respondió pero sin guardar", errGuardar, { comprobante: `${c.serie}-${c.numero}`, estado: r.estado });
      return { id, consulta, accion: "error" };
    }
    return { id, consulta, accion: accion.tipo };
  }

  const r = await consultarAnulacionLucode(tipo, c.serie, c.numero);
  if (!r.ok) return { id, consulta, accion: "error" };
  const accion = accionPorBaja(r.anulacion);
  if (accion.tipo !== "confirmar_baja") return { id, consulta, accion: accion.tipo };
  const rpcLibre = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
  const { error: errBaja } = await rpcLibre("fn_confirmar_baja_sunat", {
    p_comprobante_id: c.id,
    p_respuesta: { estado: r.estadoCrudo, mensaje: r.mensaje, consultado_at: new Date().toISOString() },
  });
  if (errBaja) {
    capturarError("lucode/consultar: SUNAT confirmó la baja pero sin guardar", errBaja, { comprobante: `${c.serie}-${c.numero}` });
    return { id, consulta, accion: "error" };
  }
  return { id, consulta, accion: accion.tipo };
}
