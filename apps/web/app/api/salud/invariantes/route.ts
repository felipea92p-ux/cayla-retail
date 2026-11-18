import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";
import { contextoParaSentry, hayQueAvisar, leerEstadoVigia } from "@/lib/vigia-invariantes-reglas";

// GET /api/salud/invariantes — el vigía diario de invariantes (ADR-0632). El trabajo programado de Vercel (`vercel.json` → `crons`) la
// llama cada madrugada a las 3:30 de Lima (08:30 UTC), cuando ninguna tienda vende. Corre `retail.fn_correr_invariantes()` con la llave
// de servicio: los estados imposibles de `/chaos` (stock que no cuadra con sus movimientos, una venta cuyos pagos no suman…), mirados en
// producción, comparados con lo que ya se sabía.
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie (la ruta lo comprueba aunque
// `proxy.ts` también lo haga). No trae sesión de persona.
//
// SE DEGRADA ASÍ: si la base no responde o la migración no está pegada, 500 y `capturarError` (la respuesta la recibe el cron y nadie
// la lee). Nada se pierde: la próxima corrida recalcula todo desde los datos de verdad, y el Observatorio del Admin dice «el vigía no
// corre» a las 26 horas. Si encuentra algo NUEVO roto o algo que no pudo mirar, avisa a Sentry con conteos e ids de invariante (nunca
// una fila); el detalle lo ve el Admin en el Observatorio. Correrla dos veces el mismo día es inofensivo: la segunda vuelve a mirar.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("salud/invariantes (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
  const { data, error } = await supabase.rpc("fn_correr_invariantes" as never);
  if (error) {
    capturarError("salud/invariantes (cron): fn_correr_invariantes falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  const crudo = data as { ok?: boolean; motivo?: string } | null;
  if (crudo?.ok === false && crudo.motivo === "ya_corriendo") {
    return Response.json({ corrio: false, motivo: "ya_corriendo" });
  }
  const estado = leerEstadoVigia(data);
  // Con un `Error` que dice qué pasó: con `null`, Sentry titula el aviso «Error: null» y quien lo lee no sabe de qué se trata.
  if (!estado) {
    capturarError("salud/invariantes (cron): la base respondió con otra forma", new Error("fn_correr_invariantes devolvió una forma inesperada"));
    return Response.json({ error: "Respuesta inesperada de fn_correr_invariantes" }, { status: 500 });
  }
  if (hayQueAvisar(estado)) {
    capturarError(
      "salud/invariantes (cron): estados imposibles nuevos o sin mirar",
      new Error("El vigía encontró estados imposibles nuevos o reglas que no pudo mirar: el detalle está en el Observatorio del Admin"),
      contextoParaSentry(estado),
    );
  }
  return Response.json(contextoParaSentry(estado));
}
