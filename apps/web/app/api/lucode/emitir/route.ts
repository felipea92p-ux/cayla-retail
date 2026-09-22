import { createClient } from "@/lib/supabase/server";
import { transmitirComprobante } from "@/lib/transmitir-comprobante";

// POST /api/lucode/emitir  { comprobante_id: string } | { venta_id: string }
//
// Con `venta_id` la dispara Vender sola al cobrar (D-60, envío automático): busca la boleta o factura
// de esa venta; una venta sin comprobante responde 404 y no pasa nada. Con `comprobante_id`,
// «Reintentar ahora». La lógica y su contrato viven en `lib/transmitir-comprobante.ts`.
export async function POST(request: Request) {
  let body: { comprobante_id?: string; venta_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!body.comprobante_id && !body.venta_id) {
    return Response.json({ error: "Falta comprobante_id o venta_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const r = await transmitirComprobante(supabase, body.comprobante_id ? { comprobanteId: body.comprobante_id } : { ventaId: body.venta_id! });
  return Response.json(r.body, { status: r.status });
}
