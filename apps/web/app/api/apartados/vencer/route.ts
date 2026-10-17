import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";

// GET /api/apartados/vencer — el trabajo programado de Vercel (`vercel.json` → `crons`), una vez al día de madrugada (3:40 de Lima).
// Felipe 2026-10-15 (D4, 20261016003000): libera en TODAS las tiendas los apartados vencidos hace más de 2 días (la misma regla y la misma
// gracia que la pantalla de Apartados al abrirse) y los apartados simples de Existencias con su fecha pasada, para que una prenda no
// quede guardada porque nadie abrió la pantalla de esa tienda. No toca los pedidos entre tiendas ni los pedidos web. La regla vive en la
// base (`fn_vencer_apartados_de_todas`); esta ruta solo la llama y dice cuántos liberó.
//
// Correrla dos veces es inofensivo (lo que ya se liberó no vuelve a liberarse; lo que una caja está entregando se salta).
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie. No trae sesión: entra con la
// llave de servicio, y la función es solo del servidor (ni `anon`, ni `authenticated`, ni la tienda online la pueden llamar).
//
// SE DEGRADA ASÍ: si la base no responde o la migración no está pegada, 500 y `capturarError`. Mientras tanto, la pantalla de Apartados
// sigue liberando lo vencido de su tienda al abrirse, como siempre.

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("apartados/vencer (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
  const { data, error } = await supabase.rpc("fn_vencer_apartados_de_todas" as never);
  if (error) {
    capturarError("apartados/vencer (cron): fn_vencer_apartados_de_todas falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json((data as object | null) ?? {});
}
