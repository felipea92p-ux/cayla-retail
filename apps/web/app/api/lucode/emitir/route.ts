import { createClient } from "@/lib/supabase/server";
import { firmaDeEncabezados, mensajeErrorResponsable } from "@/lib/responsable-reglas";
import { papelesDelCambioPorEnviar } from "@/lib/transmision-reglas";
import { transmitirComprobante } from "@/lib/transmitir-comprobante";

// POST /api/lucode/emitir  { comprobante_id: string } | { venta_id: string } | { cambio_id: string }
//
// Con `venta_id` la dispara Vender sola al cobrar (D-60, envío automático): busca la boleta o factura
// de esa venta; una venta sin comprobante responde 404 y no pasa nada. Con `cambio_id`, Cambios al guardar
// (ADR-0672): la nota de crédito y la boleta nueva de ese cambio, en ese orden; un cambio sin papeles no manda
// nada. Con `comprobante_id`, «Reintentar ahora». La lógica y su contrato viven en `lib/transmitir-comprobante.ts`.
export async function POST(request: Request) {
  let body: { comprobante_id?: string; venta_id?: string; cambio_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!body.comprobante_id && !body.venta_id && !body.cambio_id) {
    return Response.json({ error: "Falta comprobante_id, venta_id o cambio_id" }, { status: 400 });
  }

  // La firma del combo «Responsable» (ADR-0161) que mandó la pantalla viaja en cada consulta de este cliente.
  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  // «Reintentar ahora» es una acción de una persona: el responsable se valida ANTES de llamar a Lucode, porque lo
  // que llega a SUNAT no se deshace. El envío automático al cobrar (`venta_id`) NO se frena aquí: la venta ya quedó
  // firmada por su responsable al cobrar (registrar_venta), y exigirlo de nuevo dejaría sin enviar las boletas de una
  // terminal (esa llamada no lleva el combo). `fn_actor_persona_id` es la misma función de las escrituras
  // (20260923010000); si todavía no existe en esta base, no frena nada (el candado se degrada al de antes).
  if (body.comprobante_id) {
    const rpcLibre = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { code?: string; hint?: string; message: string } | null }>;
    const { error: errResponsable } = await rpcLibre("fn_actor_persona_id", { p_de_tienda: true });
    const porResponsable = mensajeErrorResponsable(errResponsable);
    if (porResponsable) return Response.json({ error: porResponsable }, { status: 403 });
  }

  // Un cambio (ADR-0672): como la venta, ya quedó firmado por su responsable al guardarse; no se le vuelve a pedir. Si Lucode no
  // responde, cada papel queda en la cola de reintento como cualquier boleta.
  if (body.cambio_id) {
    const { data: papeles, error } = await supabase.from("comprobantes").select("id, tipo, estado").eq("cambio_id" as never, body.cambio_id as never);
    if (error) return Response.json({ error: "No se pudieron leer los papeles del cambio. Quedan en la cola de reintento." }, { status: 503 });
    const resultados: Record<string, unknown>[] = [];
    for (const p of papelesDelCambioPorEnviar((papeles ?? []) as { id: string; tipo: string; estado: string }[])) {
      const r = await transmitirComprobante(supabase, { comprobanteId: p.id });
      resultados.push({ comprobante_id: p.id, status: r.status, ...r.body });
    }
    return Response.json({ resultados }, { status: 200 });
  }

  const r = await transmitirComprobante(supabase, body.comprobante_id ? { comprobanteId: body.comprobante_id } : { ventaId: body.venta_id! });
  return Response.json(r.body, { status: r.status });
}
