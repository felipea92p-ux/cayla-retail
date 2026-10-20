import webpush from "web-push";
import { pasaComoCron } from "@/lib/cron";
import { decidirPorRespuesta, paqueteDelAviso, VIDA_DEL_AVISO_S, type AparatoPush } from "@/lib/push";
import { marcarEnviado, quitarAparatoMuerto, reclamarAvisos } from "@/lib/push-servidor";

// GET /api/push-enviar — el trabajo que manda los avisos push (Felipe, 2026-10-20). Vercel lo llama cada minuto (`vercel.json` →
// `crons`), con `Authorization: Bearer $CRON_SECRET`; sin esa clave no pasa nadie. Toma un lote de la cola, lo manda a cada aparato y
// marca como enviado lo que llegó a alguno. Un aparato que el servicio de push da por muerto (404 o 410) se quita; un fallo pasajero deja
// el aviso pendiente para la vuelta siguiente (hasta 5 intentos, en la base).
//
// Sin VAPID configurado no envía nada y responde 503: el trabajo no se cae, espera la configuración. Los registros llevan solo cuentas
// (cuántos avisos, cuántas entregas), nunca un título, un texto ni una dirección de aparato.

export const maxDuration = 60;

const LOTE = 50;

export async function GET(request: Request) {
  if (!pasaComoCron(new URL(request.url).pathname, request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const publica = process.env.TIENDA_VAPID_PUBLIC_KEY;
  const privada = process.env.TIENDA_VAPID_PRIVATE_KEY;
  const asunto = process.env.TIENDA_VAPID_ASUNTO;
  if (!publica || !privada || !asunto) {
    console.error(JSON.stringify({ evento: "tienda_push_sin_configurar" }));
    return Response.json({ estado: "sin_configurar" }, { status: 503 });
  }
  webpush.setVapidDetails(asunto, publica, privada);

  const avisos = await reclamarAvisos(LOTE);
  if (avisos === null) return Response.json({ estado: "sin_respuesta" }, { status: 503 });

  let entregas = 0;
  let quitados = 0;
  let fallos = 0;
  for (const aviso of avisos) {
    const paquete = JSON.stringify(paqueteDelAviso(aviso.titulo, aviso.texto, aviso.enlace));
    const resultados = await Promise.all(aviso.aparatos.map((aparato) => enviarAAparato(aparato, paquete)));
    entregas += resultados.filter((r) => r === "entregado").length;
    quitados += resultados.filter((r) => r === "quitar_aparato").length;
    fallos += resultados.filter((r) => r === "reintentar").length;
    // Sin aparatos no hay nada que reintentar; con alguno que lo recibió, el aviso ya cumplió. Si todos fallaron, queda para la vuelta siguiente.
    const cumplido = aviso.aparatos.length === 0 || resultados.includes("entregado");
    if (cumplido) await marcarEnviado(aviso.id);
  }

  console.info(JSON.stringify({ evento: "tienda_push_vuelta", avisos: avisos.length, entregas, quitados, fallos }));
  return Response.json({ estado: "ok", avisos: avisos.length, entregas, quitados, fallos });
}

/** Manda el paquete a un aparato y dice qué pasó (sin registrar la dirección). */
async function enviarAAparato(aparato: AparatoPush, paquete: string) {
  try {
    await webpush.sendNotification(
      { endpoint: aparato.endpoint, keys: { p256dh: aparato.p256dh, auth: aparato.auth } },
      paquete,
      { TTL: VIDA_DEL_AVISO_S, urgency: "normal" },
    );
    return decidirPorRespuesta(201);
  } catch (error) {
    const codigo = typeof (error as { statusCode?: unknown })?.statusCode === "number" ? (error as { statusCode: number }).statusCode : null;
    const decision = decidirPorRespuesta(codigo);
    if (decision === "quitar_aparato") await quitarAparatoMuerto(aparato.endpoint);
    return decision;
  }
}
