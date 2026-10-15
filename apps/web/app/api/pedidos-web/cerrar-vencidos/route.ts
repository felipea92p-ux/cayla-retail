import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";

// GET /api/pedidos-web/cerrar-vencidos — el trabajo programado de Vercel (`vercel.json` → `crons`), cada 15 minutos. ADR-0408
// (tienda online, DECIDÍ 8; actividad 7): un pedido web que nadie confirmó en su plazo se cierra solo («Se cerró sin confirmar»;
// Felipe: 24 horas corridas). El plazo NO se escribe aquí: lo lee la base de Configuración ▸ Tienda web
// (`fn_cerrar_pedidos_web_sin_confirmar`, que llama a `fn_cerrar_pedidos_web_vencidos` del motor con ese plazo). Esta ruta solo la
// llama y dice cuántos cerró.
//
// No es la que protege nada: un pedido pasado su plazo ya se LEE vencido aunque esta ruta no haya corrido, y nadie lo puede confirmar
// (el motor del pedido web). Correrla dos veces a la vez es inofensivo (lo que otra está cerrando se salta).
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie (la ruta lo comprueba aunque
// `proxy.ts` también lo haga). No trae sesión de persona: entra con la llave de servicio, y la función es solo del servidor (ni `anon`,
// ni `authenticated`, ni la tienda la pueden llamar).
//
// SE DEGRADA ASÍ: si la base no responde o la migración no está pegada, 500 y `capturarError` (la respuesta la recibe el cron y nadie
// la lee: sin el log, el cierre dejaría de correr sin aviso). Mientras tanto, la tienda y el ERP siguen leyendo vencido lo vencido.

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("pedidos-web/cerrar-vencidos (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
  const { data, error } = await supabase.rpc("fn_cerrar_pedidos_web_sin_confirmar" as never);
  if (error) {
    capturarError("pedidos-web/cerrar-vencidos (cron): fn_cerrar_pedidos_web_sin_confirmar falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json((data as object | null) ?? {});
}
