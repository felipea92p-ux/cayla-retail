import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { armarConfirmacion, CONFIRMACION_DURA_MIN, leerConfirmacion, usuarioDeConfirmacion, type Confirmacion } from "./correo-confirmado";

// La cookie que prueba que ESTE aparato confirmó su correo con el código (la explicación, en `correo-confirmado.ts`). La firma con
// HMAC-SHA-256 una llave derivada de la sal de la tienda (`TIENDA_INTENTOS_SAL`, que solo tiene el servidor), con su propio rótulo:
// la misma sal da otras huellas para contar intentos (`intentos-servidor.ts`), y una no sirve por la otra. Sin la sal no hay firma
// y nadie confirma un correo (la tienda tampoco consulta ni registra sin ella).

const COOKIE = "tienda-correo-confirmado";

function llave(): string | null {
  const s = process.env.TIENDA_INTENTOS_SAL?.trim();
  return s && s.length >= 16 ? createHmac("sha256", s).update("tienda:correo-confirmado:v1").digest("hex") : null;
}

const firmaCon = (k: string) => (datos: string) => createHmac("sha256", k).update(datos).digest("base64url");

function mismaFirmaCon(k: string) {
  return (datos: string, firma: string) => {
    const esperada = Buffer.from(firmaCon(k)(datos));
    const recibida = Buffer.from(firma);
    return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
  };
}

/** ¿Se puede firmar la prueba? Se pregunta ANTES de probar un código: uno bueno sin prueba quedaría gastado sin dejar nada. */
export const hayLlaveDeConfirmacion = (): boolean => llave() !== null;

/** Deja en el aparato la prueba de que confirmó ESE correo (con ESE usuario del proyecto de clientes). false sin la sal. */
export async function guardarConfirmacion(correo: string, usuarioWebId: string): Promise<boolean> {
  const k = llave();
  if (!k) return false;
  const vence = Date.now() + CONFIRMACION_DURA_MIN * 60_000;
  (await cookies()).set(COOKIE, armarConfirmacion({ correo, usuarioWebId, vence }, firmaCon(k)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONFIRMACION_DURA_MIN * 60,
  });
  return true;
}

/** La confirmación de este aparato para ESE correo, si vale (firma, vigencia y mismo correo). */
export async function confirmacionDeEsteAparato(correo: string): Promise<Confirmacion | null> {
  const k = llave();
  if (!k) return null;
  return leerConfirmacion((await cookies()).get(COOKIE)?.value, correo, mismaFirmaCon(k));
}

/** El usuario de la confirmación de este aparato, para CUALQUIER correo (firma válida): el de un correo que se dejó atrás. */
export async function usuarioConfirmadoDeEsteAparato(): Promise<string | null> {
  const k = llave();
  if (!k) return null;
  return usuarioDeConfirmacion((await cookies()).get(COOKIE)?.value, mismaFirmaCon(k));
}

export async function borrarConfirmacion(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
