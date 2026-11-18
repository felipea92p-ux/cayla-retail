import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";
import { EMISOR } from "@/lib/emisor";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDe } from "@/lib/gastos-reglas";
import { traerPropuestaSire } from "@/lib/sire-api";
import { credencialesDe, mesAnterior } from "@/lib/sire-api-reglas";
import { leerPropuestaSire, lineasParaGuardar, type RegistroSire } from "@/lib/sire-propuesta-reglas";

// GET /api/sire/propuesta — el trabajo programado de Vercel (`vercel.json` → `crons`), cada mañana del día 2 al 10 (8:30 de Lima)
// (ADR-0601, actividad 5). Trae de la API del SIRE las propuestas de compras y de ventas del mes anterior y las guarda como si alguien las
// hubiera subido (`origen = 'api'`), para que «Comparar con SUNAT» esté listo sin que nadie entre al portal. Solo LEE en SUNAT.
//
// Correrla dos veces es inofensivo: si la propuesta es igual a la vigente, la base no crea otra versión.
//
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable, o con otra clave, no pasa nadie. Entra con la llave de servicio, y
// `guardar_propuesta_sire_api` es solo del servidor.
//
// SE DEGRADA ASÍ: sin las credenciales del SIRE (`SIRE_*`, `.env.example`) responde 200 «omitido» y no hace nada: la subida a mano sigue.
// Si SUNAT no responde o el archivo no se lee, ese registro queda sin traer, `capturarError` lo cuenta (con el paso, nunca las
// credenciales) y mañana lo intenta otra vez.

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const credenciales = credencialesDe(process.env);
  if (!credenciales.ok) return Response.json({ omitido: "Faltan las credenciales del SIRE", faltan: credenciales.faltan });

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("sire/propuesta (cron): sin llave de servicio", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const mes = mesAnterior(mesDe(hoyLima()));
  const resultado: Record<string, string> = {};
  // Una a la vez: cada una pide su propio token y su ticket, y SUNAT limita las peticiones seguidas.
  for (const registro of ["compras", "ventas"] as RegistroSire[]) {
    const traida = await traerPropuestaSire(registro, mes, credenciales.credenciales);
    if (!traida.ok) {
      capturarError("sire/propuesta (cron): no se trajo la propuesta", new Error(traida.motivo), { registro, mes, paso: traida.paso });
      resultado[registro] = `sin traer: ${traida.motivo}`;
      continue;
    }
    const lectura = leerPropuestaSire(traida.texto, { registro, mes, ruc: EMISOR.ruc });
    if (!lectura.ok) {
      capturarError("sire/propuesta (cron): el archivo de SUNAT no se pudo leer", new Error(lectura.error), { registro, mes, ticket: traida.ticket });
      resultado[registro] = "sin leer";
      continue;
    }
    // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
    const { data, error } = await supabase.rpc(
      "guardar_propuesta_sire_api" as never,
      { p_registro: registro, p_mes: `${mes}-01`, p_lineas: lineasParaGuardar(lectura.propuesta.lineas) } as never,
    );
    if (error) {
      capturarError("sire/propuesta (cron): guardar_propuesta_sire_api falló", error, { registro, mes });
      resultado[registro] = "sin guardar";
      continue;
    }
    resultado[registro] = data ? `${lectura.propuesta.lineas.length} comprobantes` : "igual a la vigente";
  }
  return Response.json({ mes, ...resultado });
}
