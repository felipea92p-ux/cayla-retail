// Los avisos push de la tienda en el celular (Felipe, 2026-10-20): una talla que esperaba llegó o un cambio en su pedido, aunque la app
// esté cerrada. Lógica pura, con su prueba al lado (`push.test.ts`). Lo que habla con la base vive en `push-servidor.ts`; la ruta que
// envía, en `app/api/push-enviar`.
//
// PROMETE: validar lo que llega del navegador antes de guardarlo; armar el paquete que recibe el teléfono sin datos de la compra (solo
//          título, texto y a qué pantalla ir); y decidir qué hacer con cada respuesta del servicio de push.
// ASUME:   la base ya filtra lo que guarda (`retail.tienda_push_*`); aquí solo se revisa la forma, para no mandar basura.
// NO HACE: no envía nada y no guarda nada.
//
// Todo puede fallar: si el servicio de push no responde, el aviso se queda pendiente y vuelve a intentarse (hasta 5 veces).

/** Un aparato que pidió avisos: la dirección que da el navegador y sus dos claves. */
export type AparatoPush = { endpoint: string; p256dh: string; auth: string };

/** Lo que el teléfono recibe: el título, el texto y a qué pantalla abrir al tocarlo. Nunca un dato de la compra. */
export type PaquetePush = { titulo: string; texto: string; enlace: string };

/** Pantalla por defecto si el enlace de un aviso no sirve: el historial de notificaciones. */
export const ENLACE_POR_DEFECTO = "/notificaciones";

/** Cuánto vive un aviso en el servicio de push si el teléfono no lo recibe (una hora: después ya no sirve). */
export const VIDA_DEL_AVISO_S = 60 * 60;

/** ¿Es un enlace de la propia tienda? Solo rutas internas («/…», sin «//», que sería otro sitio). */
export function enlaceInterno(enlace: unknown): string {
  return typeof enlace === "string" && enlace.startsWith("/") && !enlace.startsWith("//") && enlace.length <= 300
    ? enlace
    : ENLACE_POR_DEFECTO;
}

/** La dirección de un aparato: una URL https de un servicio de push de verdad (no vale cualquier texto). */
export function direccionValida(endpoint: unknown): endpoint is string {
  return typeof endpoint === "string" && endpoint.length >= 20 && endpoint.length <= 1000 && endpoint.startsWith("https://");
}

/** Revisa lo que mandó el navegador al activar. Devuelve la suscripción limpia, o null si la forma no cuadra. */
export function suscripcionValida(entrada: unknown): AparatoPush | null {
  if (typeof entrada !== "object" || entrada === null) return null;
  const f = entrada as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const { p256dh, auth } = f.keys ?? {};
  if (!direccionValida(f.endpoint)) return null;
  if (typeof p256dh !== "string" || p256dh.length < 40 || p256dh.length > 200) return null;
  if (typeof auth !== "string" || auth.length < 10 || auth.length > 100) return null;
  return { endpoint: f.endpoint, p256dh, auth };
}

/** El paquete que recibe el teléfono, con los textos ya cortados a un largo que cabe en la pantalla bloqueada. */
export function paqueteDelAviso(titulo: string, texto: string, enlace: string): PaquetePush {
  return {
    titulo: titulo.slice(0, 120),
    texto: texto.slice(0, 240),
    enlace: enlaceInterno(enlace),
  };
}

/** Qué hacer con un aparato según lo que respondió el servicio de push. */
export type DecisionAparato = "entregado" | "quitar_aparato" | "reintentar";

/**
 * El servicio de push responde 201 si lo recibió. 404 o 410 quiere decir que el aparato ya no acepta avisos (la app se desinstaló o el
 * permiso se revocó): se quita. Cualquier otra cosa es un fallo pasajero: se reintenta.
 */
export function decidirPorRespuesta(codigo: number | null): DecisionAparato {
  if (codigo !== null && codigo >= 200 && codigo < 300) return "entregado";
  if (codigo === 404 || codigo === 410) return "quitar_aparato";
  return "reintentar";
}

/** La clave pública (base64 url) en los bytes que pide el navegador para suscribirse. */
export function claveAUint8(clave: string): Uint8Array {
  const base64 = clave.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(clave.length / 4) * 4, "=");
  const texto = atob(base64);
  return Uint8Array.from(texto, (c) => c.charCodeAt(0));
}
