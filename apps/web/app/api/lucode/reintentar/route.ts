import { createClient } from "@/lib/supabase/server";
import { transmitirComprobante } from "@/lib/transmitir-comprobante";

// Cada comprobante puede tardar hasta 15 s en Lucode (timeout de `lib/lucode.ts`).
export const maxDuration = 60;

// POST /api/lucode/reintentar  { ubicacion_id?: string }
//
// El barrido de la cola de SUNAT sin cron (D-60 paso 2): lo llaman Vender después de cada cobro (su
// sede) y Comprobantes al abrirse (todas, si es líder). Toma lo vencido con
// `fn_tomar_comprobantes_para_reintento` —que lo reserva 5 minutos en la misma operación, así dos
// pasadas a la vez nunca envían el mismo comprobante— y lo transmite de a uno. Hasta 3 por llamada:
// con cobros todo el día, la cola se vacía sola sin que ninguna pantalla espere mucho.
export async function POST(request: Request) {
  let body: { ubicacion_id?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    // sin cuerpo = todas las sedes (la base exige ser líder)
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { data: ids, error } = await supabase.rpc("fn_tomar_comprobantes_para_reintento", {
    p_ubicacion_id: body.ubicacion_id ?? undefined,
    p_limite: 3,
  });
  if (error) return Response.json({ error: error.message }, { status: 403 });

  const resultados = [];
  for (const id of ids ?? []) {
    const r = await transmitirComprobante(supabase, { comprobanteId: id });
    resultados.push({ id, status: r.status, estado: r.body.estado ?? null });
  }
  return Response.json({ tomados: resultados.length, resultados });
}
