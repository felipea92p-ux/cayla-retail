import webpush from "web-push";
import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";
import {
  decidirPorRespuesta,
  fichaCumplida,
  leerPorAvisar,
  paqueteDelPedido,
  VIDA_DEL_AVISO_S,
  type AparatoPush,
  type DecisionAparato,
} from "@/lib/push-pedidos-web";

// GET /api/pedidos-web/avisar — el trabajo que hace sonar los teléfonos de la sede cuando llega un pedido web (ADR-0582). Vercel lo
// llama cada minuto (`vercel.json` → `crons`) con `Authorization: Bearer $CRON_SECRET`; sin esa clave no pasa nadie. Toma un lote de la
// cola (`fn_pedidos_web_push_reclamar`, que ya eligió los teléfonos de cada sede y volvió a preguntar si su cuenta atiende pedidos web),
// arma el aviso con el texto que eligió Felipe (`paqueteDelPedido`) y lo manda a cada teléfono.
//
// SE DEGRADA ASÍ (todo puede fallar): sin las claves de envío (`ERP_VAPID_*`) responde 503 y no toca la cola, que espera; si la base no
// responde, 503 y la vuelta se salta; un teléfono que no responde deja la ficha para la vuelta siguiente (hasta 5 intentos); uno que el
// servicio da por muerto (404 o 410) se quita. El pedido nunca depende de esto: si nadie avisa, igual está en Tienda web ▸ Pedidos.
// Los registros llevan solo cuentas (cuántos avisos, cuántas entregas), nunca un pedido, un total ni la dirección de un teléfono.

export const maxDuration = 60;

const LOTE = 20;

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const publica = process.env.ERP_VAPID_PUBLIC_KEY;
  const privada = process.env.ERP_VAPID_PRIVATE_KEY;
  const asunto = process.env.ERP_VAPID_ASUNTO;
  if (!publica || !privada || !asunto) {
    console.error(JSON.stringify({ evento: "pedidos_web_push_sin_configurar" }));
    return Response.json({ estado: "sin_configurar" }, { status: 503 });
  }
  webpush.setVapidDetails(asunto, publica, privada);

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError("pedidos-web/avisar (cron): sin llave de servicio", e);
    return Response.json({ estado: "sin_llave" }, { status: 500 });
  }

  // Las funciones son nuevas y los tipos generados todavía no las traen: se llaman por nombre.
  const { data, error } = await supabase.rpc("fn_pedidos_web_push_reclamar" as never, { p_limite: LOTE } as never);
  const fichas = error ? null : leerPorAvisar(data);
  if (!fichas) {
    capturarError("pedidos-web/avisar (cron): fn_pedidos_web_push_reclamar falló", error ?? new Error("respuesta sin avisos"));
    return Response.json({ estado: "sin_respuesta" }, { status: 503 });
  }

  const quitar = async (endpoint: string) => {
    await supabase.rpc("fn_pedidos_web_push_quitar_aparato" as never, { p_endpoint: endpoint } as never);
  };
  let entregas = 0;
  let quitados = 0;
  let fallos = 0;
  for (const ficha of fichas) {
    const paquete = JSON.stringify(paqueteDelPedido(ficha));
    const resultados = await Promise.all(ficha.aparatos.map((a) => enviarATelefono(a, paquete, quitar)));
    entregas += resultados.filter((r) => r === "entregado").length;
    quitados += resultados.filter((r) => r === "quitar_aparato").length;
    fallos += resultados.filter((r) => r === "reintentar").length;
    if (fichaCumplida(resultados)) {
      await supabase.rpc("fn_pedidos_web_push_marcar_enviado" as never, { p_envio: ficha.id } as never);
    }
  }

  console.info(JSON.stringify({ evento: "pedidos_web_push_vuelta", avisos: fichas.length, entregas, quitados, fallos }));
  return Response.json({ estado: "ok", avisos: fichas.length, entregas, quitados, fallos });
}

/** Manda el aviso a un teléfono y dice qué pasó (sin registrar su dirección). */
async function enviarATelefono(aparato: AparatoPush, paquete: string, quitar: (endpoint: string) => Promise<void>): Promise<DecisionAparato> {
  try {
    // «high»: el Android lo entrega aunque el teléfono esté en reposo; un pedido que espera en la web es para atender ya.
    await webpush.sendNotification({ endpoint: aparato.endpoint, keys: { p256dh: aparato.p256dh, auth: aparato.auth } }, paquete, {
      TTL: VIDA_DEL_AVISO_S,
      urgency: "high",
    });
    return "entregado";
  } catch (error) {
    const codigo = typeof (error as { statusCode?: unknown })?.statusCode === "number" ? (error as { statusCode: number }).statusCode : null;
    const decision = decidirPorRespuesta(codigo);
    if (decision === "quitar_aparato") await quitar(aparato.endpoint).catch(() => {});
    return decision;
  }
}
