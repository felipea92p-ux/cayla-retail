import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";
import { FRESCURA_DIAS_LECTURA } from "@/lib/frescura";
import { calcularVaraCayla, filasParaGuardar } from "@/lib/frescura-vara-cayla";

// GET /api/inventario/frescura-vara-cayla — el trabajo programado de Vercel (`vercel.json` → `crons`), cada madrugada a las 3:20 de
// Lima (08:20 UTC). ADR-0208, actualización 2026-10-07: la vara de CAYLA como respaldo. Lee las tres tiendas con la llave de servicio
// (una `fn_frescura_sede` por tienda: su candado deja pasar a `service_role` desde 20261008120000), arma una curva por categoría con
// todas juntas (`calcularVaraCayla`, la receta de `referenciaCayla`) y la guarda en `retail.frescura_vara_cayla` por
// `guardar_frescura_vara_cayla` (solo del servidor). La pantalla la usa cuando una categoría en una tienda no llega a 10 ventas.
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie (la ruta lo comprueba aunque
// `proxy.ts` también lo haga). No trae sesión de persona.
//
// SE DEGRADA ASÍ: si una tienda no responde, no se guarda nada (una vara «de las tres» hecha con dos miente) y la fila de ayer sigue
// valiendo hasta 3 días (`VIGENCIA_VARA_CAYLA_DIAS`); si la base no responde o la migración no está pegada, 500 y `capturarError`:
// la respuesta la recibe el cron de Vercel y nadie la lee, así que sin el log la vara dejaría de calcularse sin aviso. Correrla dos veces
// el mismo día es inofensivo: la segunda pisa a la primera con lo mismo.

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("inventario/frescura-vara-cayla (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const tiendas = await supabase.from("ubicaciones").select("id, nombre").eq("activo", true).eq("tipo", "tienda").order("nombre");
  if (tiendas.error) {
    capturarError("inventario/frescura-vara-cayla (cron): no se pudieron leer las tiendas", tiendas.error);
    return Response.json({ error: tiendas.error.message }, { status: 500 });
  }

  const calculo = await calcularVaraCayla(
    tiendas.data,
    (fn, args) => supabase.rpc(fn, args as { p_ubicacion_id: string; p_dias: number }),
    FRESCURA_DIAS_LECTURA,
  );
  if (calculo.caidas.length > 0) {
    capturarError("inventario/frescura-vara-cayla (cron): una tienda no respondió, no se guarda nada", null, { caidas: calculo.caidas });
    return Response.json({ error: `No respondió ${calculo.caidas.join(", ")}: la vara de CAYLA no se guardó.` }, { status: 500 });
  }

  // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
  const { data, error } = await supabase.rpc("guardar_frescura_vara_cayla" as never, { p_filas: filasParaGuardar(calculo.filas) } as never);
  if (error) {
    capturarError("inventario/frescura-vara-cayla (cron): guardar_frescura_vara_cayla falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ tiendas: tiendas.data.length, categorias: calculo.filas.length, ...((data as object) ?? {}) });
}
