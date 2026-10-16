// La prueba de que ESTE aparato confirmó su correo con el código (Felipe 2026-10-15: «al lado del correo debería existir un botón
// de obtener código y abajo un input para colocarlo»). Lógica pura, sin red: la usan la acción del servidor (que la firma y la lee,
// `correo-confirmado-servidor.ts`) y sus pruebas.
//
// EL PROBLEMA. Desde la actividad 2b el código se probaba y la cuenta se creaba en la MISMA petición: el servidor sabía que el
// código era el bueno porque lo acababa de verificar. Ahora el código se confirma bajo el correo, apenas llega, y la cuenta se crea
// después, en otra petición, cuando la persona termina el formulario. El servidor tiene que volver a saber, al crear, que ESE
// aparato confirmó ESE correo: no basta con que el navegador lo diga (cualquiera lo diría), ni con que el correo esté confirmado en
// el proyecto de clientes (lo habría confirmado otra persona, en otro aparato, y aquí cualquiera podría crear la cuenta con él).
//
// LA SALIDA. Al confirmar el código, el servidor deja en el aparato una cookie (httpOnly) con el correo, el usuario del proyecto de
// clientes y hasta cuándo vale, FIRMADA con una llave que solo él tiene. Al crear la cuenta la lee, comprueba la firma, que no
// venció y que el correo es el mismo que trae el formulario; y además le pregunta al proyecto de clientes que ese usuario esté
// confirmado. Sin todo eso no hay cuenta. No es un estado del navegador: el navegador la guarda, pero no la puede escribir.

/** Cuánto vale la confirmación de un correo: lo mismo que el código (30 minutos), para terminar el formulario con calma. */
export const CONFIRMACION_DURA_MIN = 30;

export type Confirmacion = { correo: string; usuarioWebId: string; vence: number };

const base64url = (texto: string) => Buffer.from(texto, "utf8").toString("base64url");
const desdeBase64url = (texto: string) => Buffer.from(texto, "base64url").toString("utf8");

/** El valor de la cookie: los datos y su firma («<datos>.<firma>»). `firmar` es la de quien la arma (el servidor). */
export function armarConfirmacion(c: Confirmacion, firmar: (texto: string) => string): string {
  const datos = base64url(JSON.stringify({ c: c.correo, u: c.usuarioWebId, v: c.vence }));
  return `${datos}.${firmar(datos)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La confirmación de este aparato, si vale para ESE correo: firma correcta (comparada con `mismaFirma`, a tiempo constante), sin
 * vencer y con el mismo correo. null en cualquier otro caso (otro correo, vencida, tocada a mano, o sin cookie).
 */
export function leerConfirmacion(
  valor: string | null | undefined,
  correo: string,
  mismaFirma: (datos: string, firma: string) => boolean,
  ahora = Date.now(),
): Confirmacion | null {
  if (!valor) return null;
  const [datos, firma, ...resto] = valor.split(".");
  if (!datos || !firma || resto.length > 0 || !mismaFirma(datos, firma)) return null;
  let leido: unknown;
  try {
    leido = JSON.parse(desdeBase64url(datos));
  } catch {
    return null;
  }
  const { c, u, v } = (leido ?? {}) as { c?: unknown; u?: unknown; v?: unknown };
  if (typeof c !== "string" || typeof u !== "string" || typeof v !== "number" || !UUID.test(u)) return null;
  if (v <= ahora || c !== correo) return null;
  return { correo: c, usuarioWebId: u, vence: v };
}

/** El usuario de una confirmación firmada, sin mirar el correo (para limpiar el usuario de un correo que se dejó atrás). */
export function usuarioDeConfirmacion(valor: string | null | undefined, mismaFirma: (datos: string, firma: string) => boolean): string | null {
  if (!valor) return null;
  const [datos, firma] = valor.split(".");
  if (!datos || !firma || !mismaFirma(datos, firma)) return null;
  try {
    const { u } = JSON.parse(desdeBase64url(datos)) as { u?: unknown };
    return typeof u === "string" && UUID.test(u) ? u : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ El código bajo el correo, en la página */

/** Lo que dice la caja del código: un mensaje, con su tono. */
export type MensajeCodigo = { texto: string; tono: "error" | "aviso" | "ok" } | null;

/**
 * El código del correo, en la página. `enviado`: se mandó a `correo` (se puede pedir otro desde `hasta`; `necesitaNuevo`: venció o
 * se gastaron los intentos; `malo`: el último que se probó y no era). `confirmado`: `correo` quedó confirmado en este aparato.
 */
export type CodigoDelCorreo =
  | { estado: "sin_pedir" }
  | { estado: "enviado"; correo: string; hasta: number; mensaje: MensajeCodigo; necesitaNuevo: boolean; malo: string | null }
  | { estado: "confirmado"; correo: string };

/** Lo que vale para el correo escrito AHORA: si la persona cambió el correo, el código de antes deja de valer. */
export function codigoDelCorreoActual(c: CodigoDelCorreo, correo: string): CodigoDelCorreo {
  if (c.estado === "sin_pedir") return c;
  return c.correo === correo ? c : { estado: "sin_pedir" };
}

/** ¿Se revisa solo este código? Con sus 6 números, si no es el mismo que ya salió mal y si todavía sirve pedirlo. */
export function codigoParaProbar(c: CodigoDelCorreo, codigo: string): boolean {
  return c.estado === "enviado" && /^\d{6}$/.test(codigo) && !c.necesitaNuevo && c.malo !== codigo;
}
