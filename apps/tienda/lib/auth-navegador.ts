import { createBrowserClient } from "@supabase/ssr";
import { configAuth, OPCIONES_COOKIE_SESION } from "./sesion";

/**
 * El cliente del proyecto de inicio de sesión de los CLIENTES en el navegador (ADR-0408): solo con su dirección y su llave
 * pública. Desde aquí se entra y se pide el enlace de «Olvidé mi contraseña»: así el proyecto de clientes ve la ip de cada
 * persona y aplica sus topes a cada una (desde el servidor de la tienda, todas llegarían con la misma). Crear la cuenta, no: eso
 * lo hace el servidor (`app/acciones/cuenta.ts`), después de que la base lo revisa. null si la tienda no lo tiene configurado.
 */
export function clienteNavegador() {
  const ajustes = configAuth();
  return ajustes ? createBrowserClient(ajustes.url, ajustes.llavePublica, { cookieOptions: OPCIONES_COOKIE_SESION }) : null;
}
