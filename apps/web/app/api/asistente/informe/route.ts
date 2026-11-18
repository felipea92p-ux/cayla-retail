import { armarInforme, type ResultadoInforme } from "@/lib/asistente/informe-servidor";
import { capturarError } from "@/lib/errores";
import { cronAutorizado } from "@/lib/rutas-cron";
import { crearClienteAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";

// El informe del lunes de «Pregúntale a CAYLA» (ADR-0536, actividad 10). Dos puertas, la misma lógica (`armarInforme`):
//
//   GET  — el trabajo programado de Vercel (`vercel.json` → `crons`), los lunes 7:00 de Lima (12:00 UTC), con `Authorization: Bearer
//          $CRON_SECRET`; entra con la llave de servicio. El ADR proponía un vigía de GitHub Actions: el cron de Vercel usa la clave y la
//          llave que ya están en producción, sin un secreto nuevo.
//   POST — el botón de Gestión ▸ Preguntas del equipo, si ese lunes no salió: con la sesión del líder (la base exige «Preguntas del
//          equipo» y ver todas las sedes).
//
// Correrlo dos veces es inofensivo: una semana con informe devuelve el mismo, sin llamar a la IA (no se paga dos veces).
//
// SE DEGRADA ASÍ: sin la clave de Anthropic o con el tope del mes gastado, no se arma (la pantalla ofrece el botón para después); si la IA
// no responde o la base no acepta el informe, 500 y `capturarError`, y el botón queda para reintentar.

export const maxDuration = 60;

function responder(r: ResultadoInforme, origen: string): Response {
  if (r.estado === "fallo") {
    capturarError(`asistente/informe (${origen}): ${r.motivo}`, new Error(r.motivo));
    return Response.json({ estado: r.estado, error: "No se pudo armar el informe. Vuelve a intentarlo en un rato." }, { status: 500 });
  }
  return Response.json(r);
}

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("asistente/informe (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  return responder(await armarInforme(supabase as never), "cron");
}

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "Tu sesión se cerró. Vuelve a entrar." }, { status: 401 });
  const r = await armarInforme(supabase as never);
  // Sin el permiso, la base lo dice al leer los informes: no es una falla del sistema.
  if (r.estado === "fallo" && /42501/.test(r.motivo)) return Response.json({ error: "El informe es del líder con «Preguntas del equipo»." }, { status: 403 });
  return responder(r, "botón");
}
