import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { COOKIE_SESION, configAuth, OPCIONES_COOKIE_SESION, tieneCookieDeSesion } from "./sesion";

// La sesión de los clientes, del lado del servidor (ADR-0408, decisión 2). Habla con el proyecto de inicio de sesión de los
// CLIENTES, nunca con el del ERP. La llave secreta de ese proyecto (`TIENDA_AUTH_SERVICE_KEY`) se lee solo aquí y solo sirve
// para crear una cuenta (actividad 2b, `lib/usuarios-servidor.ts`): invitar el correo para mandarle el código (después de que la
// base lo revisó), ponerle la contraseña cuando el código fue el bueno, y borrar el usuario que quedó sin cuenta.
// Lo vigila lib/candados.test.ts.

/** El cliente con las cookies de esta petición. En una página no puede escribirlas (las refresca el proxy); en una acción, sí. */
export async function clienteSesion(): Promise<SupabaseClient | null> {
  const ajustes = configAuth();
  if (!ajustes) return null;
  const almacen = await cookies();
  return createServerClient(ajustes.url, ajustes.llavePublica, {
    cookieOptions: OPCIONES_COOKIE_SESION,
    cookies: {
      getAll: () => almacen.getAll(),
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options);
        } catch {
          // Una página (Server Component) no puede escribir cookies: el proxy ya refrescó la sesión antes de llegar aquí.
        }
      },
    },
  });
}

/** Con la llave secreta del proyecto de CLIENTES: solo invita, confirma y borra usuarios. null si la tienda no la tiene configurada. */
export function clienteAdmin(): SupabaseClient | null {
  const ajustes = configAuth();
  const llave = process.env.TIENDA_AUTH_SERVICE_KEY?.trim();
  if (!ajustes || !llave) return null;
  return createClient(ajustes.url, llave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Sin cookies ni sesión guardada: para comprobar el código del correo sin dejar a nadie con la sesión abierta. */
export function clienteSuelto(): SupabaseClient | null {
  const ajustes = configAuth();
  if (!ajustes) return null;
  return createClient(ajustes.url, ajustes.llavePublica, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export type LecturaSesion =
  /** `correo`: el de entrada que dice el proyecto de clientes (lo usa «Mi cuenta» para conciliar un cambio de correo, 20261015132000). */
  | { estado: "con_sesion"; usuarioId: string; correo: string | null }
  | { estado: "sin_sesion" }
  /** El proyecto de clientes no contestó: no se sabe. Nadie se queda sin su cuenta por eso, y nada se borra. */
  | { estado: "sin_respuesta" };

/** Quién es, validado con el proyecto de clientes (no basta con la cookie para mostrar datos de una cuenta). Una vez por petición:
 *  el marco de la página y la página la comparten (una sola consulta al proyecto de clientes). */
export const leerSesion = cache(async (): Promise<LecturaSesion> => {
  const almacen = await cookies();
  if (!tieneCookieDeSesion(almacen.getAll().map((c) => c.name))) return { estado: "sin_sesion" };
  const cliente = await clienteSesion();
  if (!cliente) return { estado: "sin_sesion" };
  const { data, error } = await cliente.auth.getUser();
  if (data.user) return { estado: "con_sesion", usuarioId: data.user.id, correo: data.user.email ?? null };
  return error && isAuthRetryableFetchError(error) ? { estado: "sin_respuesta" } : { estado: "sin_sesion" };
});

/** ¿Trae la cookie de una sesión? Sin preguntarle a nadie: solo para elegir la cabecera de una página que no muestra datos. */
export async function haySesion(): Promise<boolean> {
  const almacen = await cookies();
  return tieneCookieDeSesion(almacen.getAll().map((c) => c.name));
}

/** Borra las cookies de la sesión de este aparato (también si el proyecto de clientes no contestó al cerrar la sesión). */
export async function borrarCookiesDeSesion(): Promise<void> {
  const almacen = await cookies();
  for (const { name } of almacen.getAll()) {
    if (name === COOKIE_SESION || name.startsWith(`${COOKIE_SESION}.`) || name === `${COOKIE_SESION}-code-verifier`) almacen.delete(name);
  }
}
