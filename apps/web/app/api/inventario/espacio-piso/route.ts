import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";

// GET /api/inventario/espacio-piso — el trabajo programado de Vercel (`vercel.json` → `crons`), los lunes a las 3:00 de Lima (08:00 UTC).
// ADR-0329 (Plan del piso, actividad 12 de ADR-0328): toma la FOTO del espacio del piso de cada tienda —por categoría, las prendas libres,
// los modelos distintos y si la sede ya cuadró su piso—. Es la historia que permitirá medir cuánto rinde el espacio en ropa (nadie lo ha
// medido); lo que no se fotografía hoy no se reconstruye mañana. Lo decide y lo hace la base (`fn_registrar_espacio_piso`: todo o nada,
// una foto por sede, categoría y día); esta ruta solo la llama y dice cuántas filas hay.
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie (la ruta lo comprueba aunque
// `proxy.ts` también lo haga). No trae sesión de persona: entra con la llave de servicio, y la función es solo del servidor (ni `anon`
// ni `authenticated` la pueden llamar).
//
// SE DEGRADA ASÍ: si la base no responde o la migración no está pegada, la ruta contesta 500 y lo anota con `capturarError`: esa semana
// queda SIN foto (un hueco que la pestaña «Historia» muestra como hueco, no como un cero) y la del lunes siguiente se toma igual. Correrla
// dos veces el mismo día es inofensivo: queda la primera foto.

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    // La respuesta la recibe el cron de Vercel y nadie la lee: sin el log, la foto deja de tomarse sin aviso.
    capturarError("inventario/espacio-piso (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
  const { data, error } = await supabase.rpc("fn_registrar_espacio_piso" as never);
  if (error) {
    capturarError("inventario/espacio-piso (cron): fn_registrar_espacio_piso falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data ?? {});
}
