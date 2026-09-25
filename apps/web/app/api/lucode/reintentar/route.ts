import { createClient } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase-admin";
import { entornoLucode } from "@/lib/lucode";
import { transmitirComprobante, type Cliente } from "@/lib/transmitir-comprobante";
import { cronNoTransmite } from "@/lib/transmision-reglas";
import { capturarError } from "@/lib/errores";

// Cada comprobante puede tardar hasta 15 s en Lucode (timeout de `lib/lucode.ts`).
export const maxDuration = 60;

// Toma lo vencido de la cola con `fn_tomar_comprobantes_para_reintento` —que lo reserva 5 minutos en la misma
// operación, así dos pasadas a la vez (el cron y una pantalla) nunca envían el mismo comprobante— y lo transmite
// de a uno. Hasta 3 por llamada: 3 × 15 s entra en `maxDuration`, y ninguna pantalla espera mucho.
async function barrer(supabase: Cliente, ubicacionId: string | null) {
  const { data: ids, error } = await supabase.rpc("fn_tomar_comprobantes_para_reintento", {
    p_ubicacion_id: ubicacionId ?? undefined,
    p_limite: 3,
  });
  if (error) return { error: error.message };
  const resultados = [];
  for (const id of ids ?? []) {
    const r = await transmitirComprobante(supabase, { comprobanteId: id });
    resultados.push({ id, status: r.status, estado: r.body.estado ?? null });
  }
  return { tomados: resultados.length, resultados };
}

// POST /api/lucode/reintentar  { ubicacion_id?: string }
//
// El barrido desde el navegador (D-60 paso 2): lo llaman Vender después de cada cobro (su sede) y Comprobantes
// al abrirse (todas, si es líder). Con la sesión de quien pide: la base decide qué sedes puede barrer.
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

  const r = await barrer(supabase, body.ubicacion_id ?? null);
  return Response.json(r, { status: "error" in r ? 403 : 200 });
}

// GET /api/lucode/reintentar — el trabajo programado de Vercel (PL-113, `vercel.json` → `crons`), cada 5 minutos,
// para que la cola avance aunque nadie tenga una pantalla abierta (una caída de Lucode de noche). Vercel manda
// `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie. No trae sesión de
// persona: entra con la llave de servicio, que la base deja tomar la cola de todas las sedes pero solo lo emitido
// en las últimas 4 horas (`20260924113817`); lo más viejo lo avisa el Inicio del líder (PL-114).
export async function GET(request: Request) {
  // Clave del cron y SOLO sandbox: la regla y su porqué, en `cronNoTransmite`.
  const no = cronNoTransmite(request.headers.get("authorization"), process.env.CRON_SECRET, entornoLucode());
  if (no) {
    if (no.status === 200) console.warn("Cron de SUNAT: LUCODE_ENTORNO no es sandbox, no se transmite nada.");
    return Response.json(no.body, { status: no.status });
  }

  let supabase: Cliente;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    // La respuesta la recibe el cron de Vercel y nadie la lee: sin el log, la cola se queda quieta sin aviso.
    capturarError("lucode/reintentar (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const r = await barrer(supabase, null);
  if ("error" in r) console.error("Cron de SUNAT: no se pudo tomar la cola:", r.error);
  return Response.json(r, { status: "error" in r ? 500 : 200 });
}
