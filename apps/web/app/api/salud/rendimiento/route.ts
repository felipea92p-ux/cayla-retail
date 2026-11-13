import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";
import { leerFotoRendimiento } from "@/lib/vigia-rendimiento-reglas";

// GET /api/salud/rendimiento — el vigía de rendimiento (ADR-0656). El trabajo programado de Vercel (`vercel.json` → `crons`) la llama
// cada hora, a los 7 minutos. Corre `retail.fn_foto_rendimiento()` con la llave de servicio: guarda cuánto costó en esa hora cada
// función y cada tabla de retail (llamadas, milisegundos, bloques leídos), restando la foto anterior de `pg_stat_statements`. Así
// queda historia para decir «esta función tardaba 882 ms y desde el pegado de anoche tarda 140» (`fn_rendimiento_antes_despues`).
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie (la ruta lo comprueba aunque
// `proxy.ts` también lo haga). No trae sesión de persona.
//
// SE DEGRADA ASÍ: si la base no responde o la migración no está pegada, 500 y `capturarError` (la respuesta la recibe el cron y nadie
// la lee). No se pierde nada: la foto siguiente cubre las dos horas, porque resta contra la última que sí se tomó. Correrla dos veces
// seguidas es inofensivo: la segunda cubre los segundos que pasaron entre las dos.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("salud/rendimiento (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
  const { data, error } = await supabase.rpc("fn_foto_rendimiento" as never);
  if (error) {
    capturarError("salud/rendimiento (cron): fn_foto_rendimiento falló", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  const foto = leerFotoRendimiento(data);
  // Con un `Error` que dice qué pasó: con `null`, Sentry titula el aviso «Error: null» y quien lo lee no sabe de qué se trata.
  if (!foto) {
    capturarError("salud/rendimiento (cron): la base respondió con otra forma", new Error("fn_foto_rendimiento devolvió una forma inesperada"));
    return Response.json({ error: "Respuesta inesperada de fn_foto_rendimiento" }, { status: 500 });
  }
  return Response.json(foto);
}
