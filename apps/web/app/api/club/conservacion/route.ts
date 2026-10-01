import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";

// GET /api/club/conservacion — el trabajo programado de Vercel (`vercel.json` → `crons`), una vez al día a las 3:00 de Lima (08:00
// UTC). ADR-0288 act. g, G-15: los datos del club se guardan 3 años desde la última compra (sin compras: desde que se registró); pasado
// eso, la ficha se anonimiza sola con la misma rutina de «Archivar» y su historia guarda el permiso `anonimizar`. Lo decide y lo hace
// la base (`fn_club_anonimizar_inactivas`); esta ruta solo la llama y dice cuántas fichas anonimizó.
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie (la ruta lo comprueba aunque
// `proxy.ts` también lo haga). No trae sesión de persona: entra con la llave de servicio, y la función es solo del servidor (ni `anon`
// ni `authenticated` la pueden llamar).

// TODO tipos: lo trae el agente de base (`packages/database/src/types.ts`, tanda 1g). Al integrar se quita el cast.
type RpcSuelta = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: number | null; error: { message: string; code?: string } | null }>;

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    // La respuesta la recibe el cron de Vercel y nadie la lee: sin el log, la conservación deja de correr sin aviso.
    capturarError("club/conservacion (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data, error } = await (supabase.rpc as unknown as RpcSuelta)("fn_club_anonimizar_inactivas", {});
  if (error) {
    capturarError("club/conservacion (cron): fn_club_anonimizar_inactivas falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ anonimizadas: data ?? 0 });
}
