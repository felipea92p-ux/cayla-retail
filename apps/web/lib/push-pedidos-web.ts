// El aviso en el celular de la sede cuando llega un pedido web (ADR-0582). Lógica pura, con su prueba al lado
// (`push-pedidos-web.test.ts`): la usan la ruta que envía (`app/api/pedidos-web/avisar`) y el botón que lo activa.
//
// CONTRATO
//   PROMETE: armar lo que el teléfono muestra con el texto que Felipe eligió en la maqueta (`docs/maquetas/aviso-pedido-web-2026-10/`,
//            «A · Directo»): «Pedido web nuevo · W-0018» / «Tienda TRU · 1 prenda · S/ 109.00»; validar lo que entrega el navegador
//            al activar; y decidir qué hacer con cada respuesta del servicio de envío.
//   ASUME:   la base ya eligió a qué teléfonos va cada aviso y si la cuenta todavía atiende esa sede (`fn_pedidos_web_push_reclamar`).
//   NO HACE: no envía ni guarda nada. Nunca pone el nombre del cliente ni la prenda: el teléfono está en el mostrador y cualquiera ve
//            la pantalla bloqueada.

/** Un teléfono que pidió el aviso: la dirección que da el navegador y sus dos claves. */
export type AparatoPush = { endpoint: string; p256dh: string; auth: string };

/** Lo que la base entrega de cada pedido por avisar (`fn_pedidos_web_push_reclamar`). */
export type PedidoPorAvisar = {
  id: string;
  pedidoId: string;
  codigo: string;
  sede: string;
  prendas: number;
  total: number;
  foto: string | null;
  aparatos: AparatoPush[];
};

/**
 * Lo que recibe el service worker (`public/sw.js`). Viaja cifrado al teléfono; el service worker le pone el ícono, la vibración y
 * los botones.
 */
export type PaqueteAviso = {
  tipo: "pedido_web";
  titulo: string;
  texto: string;
  /** A qué pantalla ir al tocarlo: el pedido abierto en Tienda web ▸ Pedidos. */
  enlace: string;
  /** La foto de la primera prenda (solo la muestra el Android al abrir el aviso). */
  imagen: string | null;
  /** Una etiqueta por pedido: si el mismo aviso llega dos veces, el teléfono lo reemplaza en vez de apilarlo. */
  etiqueta: string;
};

/** Cuánto espera el servicio de envío a un teléfono apagado o sin señal (una hora: después el pedido ya se ve en el ERP). */
export const VIDA_DEL_AVISO_S = 60 * 60;

const soles = (monto: number) => `S/\u00a0${monto.toFixed(2)}`;
const prendas = (n: number) => (n === 1 ? "1 prenda" : `${n} prendas`);

/** Solo una foto https de nuestro almacenamiento de fotos; cualquier otra cosa no viaja. */
function fotoSegura(foto: unknown): string | null {
  return typeof foto === "string" && foto.startsWith("https://") && foto.length <= 1000 && foto.includes("/storage/v1/object/public/")
    ? foto
    : null;
}

/** El aviso de un pedido, con el texto «A · Directo» de la maqueta. */
export function paqueteDelPedido(p: Pick<PedidoPorAvisar, "pedidoId" | "codigo" | "sede" | "prendas" | "total" | "foto">): PaqueteAviso {
  return {
    tipo: "pedido_web",
    titulo: `Pedido web nuevo · ${p.codigo}`.slice(0, 120),
    texto: `${p.sede} · ${prendas(p.prendas)} · ${soles(p.total)}`.slice(0, 240),
    enlace: `/tienda-web/pedidos?pedido=${encodeURIComponent(p.pedidoId)}`,
    imagen: fotoSegura(p.foto),
    etiqueta: `pedido-web-${p.codigo}`,
  };
}

const cadena = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : null);

/** La dirección de un teléfono: una URL https de un servicio de avisos de verdad (no vale cualquier texto). */
function direccionValida(endpoint: unknown): endpoint is string {
  return typeof endpoint === "string" && endpoint.length >= 20 && endpoint.length <= 1000 && endpoint.startsWith("https://");
}

function aparatoDe(x: unknown): AparatoPush | null {
  if (typeof x !== "object" || x === null) return null;
  const f = x as Record<string, unknown>;
  const p256dh = cadena(f.p256dh);
  const auth = cadena(f.auth);
  return direccionValida(f.endpoint) && p256dh && auth ? { endpoint: f.endpoint, p256dh, auth } : null;
}

/** Lee lo que devolvió `fn_pedidos_web_push_reclamar`. Una ficha con una forma rara se salta (sin ella, la vuelta sigue). */
export function leerPorAvisar(respuesta: unknown): PedidoPorAvisar[] | null {
  const lista = (respuesta as { avisos?: unknown } | null)?.avisos;
  if (!Array.isArray(lista)) return null;
  return lista.flatMap((x): PedidoPorAvisar[] => {
    if (typeof x !== "object" || x === null) return [];
    const f = x as Record<string, unknown>;
    const id = cadena(f.id);
    const pedidoId = cadena(f.pedido_id);
    const codigo = cadena(f.codigo);
    const sede = cadena(f.sede);
    const total = Number(f.total);
    const n = Number(f.prendas);
    if (!id || !pedidoId || !codigo || !sede || !Number.isFinite(total) || !Number.isInteger(n) || n < 1) return [];
    const aparatos = Array.isArray(f.aparatos) ? f.aparatos.flatMap((a) => aparatoDe(a) ?? []) : [];
    return [{ id, pedidoId, codigo, sede, prendas: n, total, foto: fotoSegura(f.foto), aparatos }];
  });
}

/** Qué hacer con un teléfono según lo que respondió el servicio de envío. */
export type DecisionAparato = "entregado" | "quitar_aparato" | "reintentar";

/**
 * 2xx: lo recibió. 404 o 410: ese teléfono ya no acepta avisos (desinstalaron la app o quitaron el permiso): se quita. Cualquier otra
 * cosa es un fallo pasajero: se reintenta en la vuelta siguiente.
 */
export function decidirPorRespuesta(codigo: number | null): DecisionAparato {
  if (codigo !== null && codigo >= 200 && codigo < 300) return "entregado";
  if (codigo === 404 || codigo === 410) return "quitar_aparato";
  return "reintentar";
}

/**
 * ¿La ficha ya cumplió? Sin teléfonos no hay nada que reintentar; con alguno que lo recibió, la sede ya se enteró. Si todos fallaron,
 * queda para la vuelta siguiente (hasta su quinto intento, en la base).
 */
export function fichaCumplida(resultados: readonly DecisionAparato[]): boolean {
  return resultados.length === 0 || resultados.includes("entregado") || resultados.every((r) => r === "quitar_aparato");
}

// ---- En el teléfono (el botón «Avisos de pedidos») ---------------------------------------------------------------------------------

/** Revisa lo que mandó el navegador al activar (`PushSubscription.toJSON()`). La suscripción limpia, o null si la forma no cuadra. */
export function suscripcionValida(entrada: unknown): AparatoPush | null {
  if (typeof entrada !== "object" || entrada === null) return null;
  const f = entrada as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const { p256dh, auth } = f.keys ?? {};
  if (!direccionValida(f.endpoint)) return null;
  if (typeof p256dh !== "string" || p256dh.length < 40 || p256dh.length > 200) return null;
  if (typeof auth !== "string" || auth.length < 10 || auth.length > 100) return null;
  return { endpoint: f.endpoint, p256dh, auth };
}

/** La clave pública (base64 url) en los bytes que pide el navegador para suscribirse. */
export function claveAUint8(clave: string): Uint8Array<ArrayBuffer> {
  const base64 = clave.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(clave.length / 4) * 4, "=");
  const texto = atob(base64);
  return Uint8Array.from(texto, (c) => c.charCodeAt(0));
}

/** En qué teléfono estamos, para decir lo que de verdad se puede hacer en él. */
export type Telefono = "android" | "iphone" | "otro";

export function telefonoDe(userAgent: string): Telefono {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iphone";
  return "otro";
}

/**
 * ¿Se pueden activar los avisos aquí? El iPhone solo los da a una app agregada a la pantalla de inicio (iOS 16.4 o más nuevo):
 * abierto en Safari no existe `PushManager`, así que se le explica cómo agregarla en vez de decir «no se puede».
 */
export type PuedeAvisar = "si" | "iphone_sin_instalar" | "sin_soporte";

export function puedeAvisar(c: { telefono: Telefono; instalada: boolean; tienePush: boolean }): PuedeAvisar {
  if (c.telefono === "iphone" && !c.instalada) return "iphone_sin_instalar";
  return c.tienePush ? "si" : "sin_soporte";
}

/** El aviso de «Probar el aviso»: el mismo diseño y la misma vibración, sin un número ni un total que alguien vaya a buscar. */
export function paqueteDePrueba(sede: string): PaqueteAviso {
  return {
    tipo: "pedido_web",
    titulo: "Pedido web nuevo · prueba",
    texto: `${sede} · así suena cada pedido nuevo`.slice(0, 240),
    enlace: "/tienda-web/pedidos",
    imagen: null,
    etiqueta: "pedido-web-prueba",
  };
}
