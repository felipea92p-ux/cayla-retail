import { pasaComoCron } from "@/lib/cron";
import { mandarCopias } from "@/lib/libro-reclamaciones-servidor";

// GET /api/libro-copias — el trabajo que reintenta la copia al correo de las hojas del Libro de Reclamaciones (ADR-0679). Vercel lo
// llama cada 5 minutos (`vercel.json` → `crons`), con `Authorization: Bearer $CRON_SECRET`; sin esa clave no pasa nadie. Toma un lote de
// hojas cuya copia falta, manda cada una y marca las que salieron; lo que falla queda para la vuelta siguiente (hasta 5 intentos, en la
// base). Los registros llevan solo cuentas, nunca un correo ni un dato de la hoja.

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!pasaComoCron(url.pathname, request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const vuelta = await mandarCopias(url.origin, { limite: 20 });
  if (vuelta === null) return Response.json({ estado: "sin_respuesta" }, { status: 503 });
  if (vuelta.tomadas > 0) console.info(JSON.stringify({ evento: "tienda_libro_copias_vuelta", ...vuelta }));
  return Response.json({ estado: vuelta.sinConfigurar ? "sin_configurar" : "ok", ...vuelta }, { status: vuelta.sinConfigurar ? 503 : 200 });
}
