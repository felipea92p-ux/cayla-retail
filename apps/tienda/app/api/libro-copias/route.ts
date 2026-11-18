import { pasaComoCron } from "@/lib/cron";
import { mandarCopias, mandarRespuestas } from "@/lib/libro-reclamaciones-servidor";

// GET /api/libro-copias — el trabajo que manda por correo lo que el Libro de Reclamaciones tiene pendiente (ADR-0679): la copia de las
// hojas cuya copia no salió al guardarlas, y las respuestas que CAYLA escribió en el ERP. Vercel lo llama cada 5 minutos (`vercel.json` → `crons`), con `Authorization: Bearer $CRON_SECRET`; sin esa clave no pasa nadie. Toma un lote de
// hojas cuya copia falta, manda cada una y marca las que salieron; lo que falla queda para la vuelta siguiente (hasta 5 intentos, en la
// base). Los registros llevan solo cuentas, nunca un correo ni un dato de la hoja.

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!pasaComoCron(url.pathname, request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const copias = await mandarCopias(url.origin, { limite: 20 });
  const respuestas = await mandarRespuestas(url.origin, 20);
  if (copias === null || respuestas === null) return Response.json({ estado: "sin_respuesta", copias, respuestas }, { status: 503 });
  if (copias.tomadas + respuestas.tomadas > 0) console.info(JSON.stringify({ evento: "tienda_libro_correos_vuelta", copias, respuestas }));
  const sinConfigurar = copias.sinConfigurar || respuestas.sinConfigurar;
  return Response.json({ estado: sinConfigurar ? "sin_configurar" : "ok", copias, respuestas }, { status: sinConfigurar ? 503 : 200 });
}
