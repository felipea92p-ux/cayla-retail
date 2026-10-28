// «Restablecer acceso a la tienda web» desde la ficha de un cliente (Felipe 2026-10-15, migración 20261015132000). Lógica pura, sin React
// ni red: lo que la ficha lee de `fn_clienta_acceso_web`, lo que la ruta `/api/clientas/acceso-web` recibe y lo que la tienda le
// contesta, y lo que la hoja dice con eso. La prueba: `acceso-web-reglas.test.ts`.
//
// EL CAMINO (lo hace la ruta del SERVIDOR del ERP: la ficha de un solo uso nunca llega al navegador):
//   1. la base deja pedido el cambio del correo de entrada de su cuenta web al correo nuevo que da el cliente (vive un día) y devuelve una
//      ficha de un solo uso (`restablecer_acceso_tienda_web`: firma el Responsable y queda en la Actividad, sin datos suyos);
//   2. el servidor del ERP se la pasa a la tienda (`POST ${TIENDA_URL}/api/restablecer-acceso`), que le manda un código al correo nuevo;
//   3. el cliente escribe ese código en la tienda online («Restablecer mi acceso»), con su contraseña nueva: recién ahí cambia el correo con
//      que entra (y al anterior le llega un aviso).
//   Si la tienda no contesta, el pedido queda igual y el cliente pide su código desde esa página («Obtener código»).

import type { CampoDeGuia } from "./guia-campos";
import type { ErrorEscritura } from "./error-escritura";
import { correoVisible, esRechazoDelCorreo, normalizarCorreo } from "./correo-clienta-reglas";

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const FORMATO_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ Lo que la ficha muestra */

/** El restablecimiento pedido en tienda que todavía espera su código. */
export type RestablecerPendiente = { correo: string; pedidoEn: string; venceEn: string; ultimoEnvioEn: string | null; envios: number };
export type AccesoWeb = { cuentaWeb: boolean; restablecer: RestablecerPendiente | null };

/** La respuesta de `fn_clienta_acceso_web`. null si no tiene la forma esperada (la base sin la migración): la ficha no muestra nada. */
export function leerAccesoWeb(json: unknown): AccesoWeb | null {
  if (!esObjeto(json) || typeof json.cuenta_web !== "boolean") return null;
  const r = json.restablecer;
  const restablecer =
    esObjeto(r) && typeof r.correo === "string" && typeof r.pedido_en === "string" && typeof r.vence_en === "string"
      ? {
          correo: normalizarCorreo(r.correo),
          pedidoEn: r.pedido_en,
          venceEn: r.vence_en,
          ultimoEnvioEn: typeof r.ultimo_envio_en === "string" ? r.ultimo_envio_en : null,
          envios: typeof r.envios === "number" && Number.isInteger(r.envios) && r.envios >= 0 ? r.envios : 0,
        }
      : null;
  return { cuentaWeb: json.cuenta_web, restablecer };
}

/** «vence en 40 min», «vence en 23 h», o «ya venció». */
export function venceEnPalabras(venceEn: string, ahora: Date): string {
  const ms = Date.parse(venceEn) - ahora.getTime();
  if (!(ms > 0)) return "ya venció";
  const minutos = Math.ceil(ms / 60_000);
  if (minutos < 60) return `vence en ${minutos} min`;
  return `vence en ${Math.floor(minutos / 60)} h`;
}

/**
 * Lo que dice la ficha bajo «Tienda online»: si no hay nada pendiente, para qué sirve «Restablecer acceso»; si lo hay, a qué correo le
 * llegó el código (completo para el líder, a medias para los demás, como el resto de la ficha) y cuánto le queda al pedido.
 */
export function textoDeLaTiendaOnline(a: AccesoWeb, verCompleto: boolean, ahora: Date): string {
  const r = a.restablecer;
  if (!r) return "Si ya no puede entrar porque perdió su correo, escribe aquí el correo nuevo que te da: le llega un código para confirmarlo y crear su contraseña.";
  const correo = correoVisible(r.correo, verCompleto) ?? "su correo nuevo";
  const vence = venceEnPalabras(r.venceEn, ahora);
  if (r.envios === 0) {
    return `Pediste restablecer su acceso con ${correo}, pero el código todavía no salió: que lo pida en la tienda online, en «Restablecer mi acceso» ▸ «Obtener código». El pedido ${vence}.`;
  }
  return `Le mandamos un código a ${correo}: lo escribe en la tienda online, en «Restablecer mi acceso», con su contraseña nueva. El pedido ${vence}.`;
}

/* ------------------------------------------------------------------ El formulario de la hoja */

/** Lo que dice la caja del correo nuevo si está mal escrito (el mismo texto que la base, `correo_invalido`). */
export const CORREO_NUEVO_MAL_ESCRITO = "Revisa el correo: parece incompleto.";

/** Qué está mal del correo nuevo, o null si está bien. Aquí es obligatorio. */
export function problemaCorreoNuevo(texto: string): string | null {
  const c = normalizarCorreo(texto);
  if (c === "") return "Escribe el correo nuevo que te da el cliente.";
  return c.length > 254 || !FORMATO_CORREO.test(c) ? CORREO_NUEVO_MAL_ESCRITO : null;
}

/** ¿La base rechazó el CORREO? (mal escrito, de otra ficha o cuenta, o el mismo con que ya entra): va bajo la caja, no en un aviso suelto. */
export function esRechazoDelCorreoNuevo(error: ErrorEscritura): boolean {
  return esRechazoDelCorreo(error) || (!!error && error.hint === "acceso_web_mismo_correo");
}

/**
 * La guía de foco de la hoja (ADR-0284): el correo nuevo y quién lo hace. Sale de lo que la base exige (`restablecer_acceso_tienda_web`):
 * el correo, bien escrito y no rechazado (`rechazo`: lo que dijo la base de ESE correo, mientras siga escrito), y el Responsable.
 */
export function camposDelRestablecer(e: { correo: string; rechazo: string | null; responsableListo: boolean }): CampoDeGuia[] {
  const problema = e.rechazo ?? problemaCorreoNuevo(e.correo);
  return [
    { id: "correo", nombre: "Correo nuevo", requerido: true, hecho: problema === null, pendiente: problema ?? "" },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién lo hace." },
  ];
}

/* ------------------------------------------------------------------ La ruta del servidor del ERP */

/** El cuerpo que manda la hoja: el cliente y el correo nuevo. null si no tiene esa forma. */
export function leerPedidoDeRestablecer(cuerpo: unknown): { clientaId: string; correo: string } | null {
  if (!esObjeto(cuerpo) || typeof cuerpo.clientaId !== "string" || typeof cuerpo.correo !== "string") return null;
  if (!UUID.test(cuerpo.clientaId) || cuerpo.correo.length > 400) return null;
  return { clientaId: cuerpo.clientaId, correo: normalizarCorreo(cuerpo.correo) };
}

/** Lo que devuelve `restablecer_acceso_tienda_web`: la ficha de un solo uso (64 cifras hexadecimales), el correo y hasta cuándo vale. */
export function leerFichaDeUnUso(json: unknown): { token: string; correo: string; venceEn: string } | null {
  if (!esObjeto(json) || typeof json.token !== "string" || !/^[0-9a-f]{64}$/.test(json.token)) return null;
  if (typeof json.correo_nuevo !== "string" || typeof json.vence_en !== "string") return null;
  return { token: json.token, correo: normalizarCorreo(json.correo_nuevo), venceEn: json.vence_en };
}

/** La dirección de la ruta de la tienda que manda el código, a partir de `TIENDA_URL`. null si no está o no es http(s). */
export function urlDelEnvio(base: string | undefined): string | null {
  const b = base?.trim().replace(/\/+$/, "");
  if (!b) return null;
  try {
    const u = new URL(b);
    return u.protocol === "http:" || u.protocol === "https:" ? `${b}/api/restablecer-acceso` : null;
  } catch {
    return null;
  }
}

/** Qué pasó con el código, según la tienda (`sin_tienda`: el ERP no sabe dónde está la tienda, falta `TIENDA_URL`). */
export type EnvioDesdeLaTienda =
  | { estado: "enviado" | "correo_tomado" | "invalido" | "no_disponible" | "sin_tienda" }
  | { estado: "esperar"; segundos: number }
  | { estado: "limite" | "bloqueado"; minutos: number };

const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 1);

/** Lo que contestó la ruta de la tienda. Lo que no se entiende, o un código HTTP que no es 200, es `no_disponible`. */
export function respuestaDeLaTienda(status: number, json: unknown): EnvioDesdeLaTienda {
  if (status !== 200 || !esObjeto(json) || typeof json.estado !== "string") return { estado: "no_disponible" };
  switch (json.estado) {
    case "enviado":
    case "correo_tomado":
    case "invalido":
      return { estado: json.estado };
    case "esperar":
      return { estado: "esperar", segundos: entero(json.segundos) };
    case "limite":
    case "bloqueado":
      return { estado: json.estado, minutos: entero(json.minutos) };
    default:
      return { estado: "no_disponible" };
  }
}

/** Lo que la ruta le devuelve a la hoja (nunca la ficha de un solo uso). */
export type ResultadoDelRestablecer = { correo: string; venceEn: string; envio: EnvioDesdeLaTienda };

export function leerResultadoDelRestablecer(json: unknown): ResultadoDelRestablecer | null {
  if (!esObjeto(json) || typeof json.correo !== "string" || typeof json.venceEn !== "string" || !esObjeto(json.envio)) return null;
  const e = json.envio;
  const envio: EnvioDesdeLaTienda =
    e.estado === "esperar"
      ? { estado: "esperar", segundos: entero(e.segundos) }
      : e.estado === "limite" || e.estado === "bloqueado"
        ? { estado: e.estado, minutos: entero(e.minutos) }
        : e.estado === "enviado" || e.estado === "correo_tomado" || e.estado === "invalido" || e.estado === "sin_tienda"
          ? { estado: e.estado }
          : { estado: "no_disponible" };
  return { correo: json.correo, venceEn: json.venceEn, envio };
}

const enMinutos = (n: number) => (n === 1 ? "1 minuto" : `${n} minutos`);
const DONDE = "en la tienda online, en «Restablecer mi acceso» ▸ «Obtener código»";

/**
 * Lo que dice el aviso al terminar. `exito`: el código salió. `aviso`: el pedido quedó, pero el código no salió ahora (la tienda no
 * contestó, o hay que esperar): el cliente lo pide desde la tienda online. `error`: ese correo no sirve (otra cuenta del proyecto de
 * clientes ya lo tiene): hay que escribir otro.
 */
export function avisoDelRestablecer(r: ResultadoDelRestablecer, verCompleto: boolean): { tipo: "exito" | "aviso" | "error"; titulo: string; detalle: string } {
  const correo = correoVisible(r.correo, verCompleto) ?? "su correo nuevo";
  switch (r.envio.estado) {
    case "enviado":
      return {
        tipo: "exito",
        titulo: "Código enviado",
        detalle: `Le llegó a ${correo}, con el enlace a la página donde lo escribe con su contraseña nueva. El código vence en 30 minutos.`,
      };
    case "esperar":
      return {
        tipo: "aviso",
        titulo: "Pedido, pero el código sale en un momento",
        detalle: `Se le mandó uno hace poco. En ${r.envio.segundos} segundos, que pida otro ${DONDE}.`,
      };
    case "limite":
    case "bloqueado":
      return {
        tipo: "aviso",
        titulo: "Pedido, pero ya se mandaron muchos códigos",
        detalle: `En ${enMinutos(r.envio.minutos)}, que pida uno nuevo ${DONDE}.`,
      };
    case "correo_tomado":
      return {
        tipo: "error",
        titulo: "Ese correo ya lo usa otra cuenta de la tienda online",
        detalle: "Puede ser una cuenta a medio crear. Pídele otro correo y vuelve a restablecer su acceso con ese.",
      };
    default:
      // sin_tienda, invalido o no_disponible: el pedido quedó (un día); el código lo pide el cliente.
      return {
        tipo: "aviso",
        titulo: "Pedido, pero la tienda online no respondió",
        detalle: `El pedido quedó por un día: que el cliente pida su código ${DONDE}, con ${correo}.`,
      };
  }
}
