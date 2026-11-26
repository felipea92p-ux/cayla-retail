import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";

// GET /api/empresas/bajas — el trabajo programado de Vercel (`vercel.json` → `crons`), una vez al día de madrugada (3:50 de Lima).
// ADR-0683 (Felipe 2026-11-21: «borrar con doble confirmación y un plazo de una semana»): aplica las bajas de empresas aliadas que ya cumplieron
// sus 7 días. La regla vive en la base (`fn_aplicar_bajas_de_aliadas`): sin historia se borra; con historia deja de estar activa y su pasado queda;
// con prendas en una tienda no se aplica y su tarjeta dice por qué. Esta ruta solo la llama y dice qué hizo.
//
// Correrla dos veces es inofensivo (lo aplicado ya no está pendiente).
//
// SE DEGRADA ASÍ: si la base no responde, 500 y `capturarError`; la aliada sigue activa (vendiendo como antes) hasta la próxima corrida. No se
// pierde nada: la baja pedida sigue anotada.

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("empresas/bajas (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
  const { data, error } = await supabase.rpc("fn_aplicar_bajas_de_aliadas" as never);
  if (error) {
    capturarError("empresas/bajas (cron): fn_aplicar_bajas_de_aliadas falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json((data as object | null) ?? {});
}
