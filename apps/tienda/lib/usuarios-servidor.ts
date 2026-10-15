import "server-only";
import { isAuthApiError, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { leerMiCuentaEnBase } from "./cuentas-servidor";
import { usuarioBorradoEnBase, usuariosPorBorrarEnBase } from "./entrada-servidor";
import { clienteSuelto } from "./sesion-servidor";

// Los usuarios del proyecto de inicio de sesión de los CLIENTES al crear una cuenta (ADR-0408, actividad 2b). El código que
// confirma el correo es la invitación de ese proyecto: invitar crea un usuario SIN contraseña (no puede entrar) o reusa el que
// ya estaba invitado, y le manda un código de 6 cifras; uno nuevo anula el anterior, y el de otro correo no sirve (medido el
// 2026-10-14 en local). Los topes (cuántos códigos, cuántos intentos) los lleva la base, no este proyecto: no frena nada solo.
// Nunca va a un registro un correo, un código ni una contraseña: solo qué pasó.
//
// Y al final de la vida de una cuenta (`20261015055000`): cuando su ficha se anonimiza (3 años sin comprar ni entrar, o lo pidió en
// tienda), la base la cierra y deja su usuario «por borrar». La base no puede borrarlo (es otro proyecto): lo borra este servidor
// cuando la persona intenta entrar y, si nunca vuelve, la ruta programada de cada madrugada (`/api/cuentas-cerradas`).

/**
 * Borra del proyecto de clientes el usuario de una cuenta cerrada (que ya no esté es lo mismo) y se lo anota a la base. Devuelve
 * si quedó borrado; si el proyecto no contesta, la próxima entrada o la próxima madrugada lo vuelven a intentar.
 */
export async function borrarUsuarioDeCuentaCerrada(admin: SupabaseClient, usuarioWebId: string): Promise<boolean> {
  const { error } = await admin.auth.admin.deleteUser(usuarioWebId);
  if (error && error.status !== 404) {
    console.error(JSON.stringify({ evento: "tienda_borrar_usuario_cerrado_fallo", usuario_web_id: usuarioWebId, estado: error.status ?? null }));
    return false;
  }
  return (await usuarioBorradoEnBase(usuarioWebId)) !== null;
}

/** La madrugada: borra hasta `limite` usuarios de cuentas cerradas que nadie borró todavía. null si la base no contestó. */
export async function barrerCuentasCerradas(admin: SupabaseClient, limite = 50): Promise<{ borrados: number; pendientes: number } | null> {
  const usuarios = await usuariosPorBorrarEnBase(limite);
  if (usuarios === null) return null;
  let borrados = 0;
  // De a uno: son pocos (los que cumplieron 3 años sin volver ese día) y así un fallo no tapa a los demás.
  for (const id of usuarios) if (await borrarUsuarioDeCuentaCerrada(admin, id)) borrados++;
  return { borrados, pendientes: usuarios.length - borrados };
}

/** Un usuario confirmado hace menos que esto puede estar a mitad de crear su cuenta en otra pestaña: no se toca. */
const RECIEN_CONFIRMADO_MS = 2 * 60_000;

export type Invitacion = { estado: "invitado"; usuarioWebId: string } | { estado: "tiene_cuenta" } | { estado: "no_disponible" };

/**
 * Manda el código a ese correo. Si el correo ya es de un usuario CONFIRMADO (un intento que se rompió después del código, o una
 * cuenta de antes de la 2b sin terminar) y la base dice que no tiene cuenta, se borra y se invita de nuevo: un correo nunca queda
 * tomado por alguien que no terminó.
 */
export async function invitarCorreo(admin: SupabaseClient, correo: string): Promise<Invitacion> {
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(correo);
    if (data.user) return { estado: "invitado", usuarioWebId: data.user.id };
    const yaExiste = error && isAuthApiError(error) && (error.code === "email_exists" || error.code === "user_already_exists");
    if (!yaExiste || vuelta > 0) {
      console.error(JSON.stringify({ evento: "tienda_invitar_fallo", codigo: error?.code ?? null, estado: error?.status ?? null, vuelta }));
      return { estado: "no_disponible" };
    }
    const id = await idDelUsuarioConfirmado(admin, correo);
    if (!id) return { estado: "no_disponible" };
    const quedo = await borrarSiNoTieneCuenta(admin, id, { respetarRecientes: true });
    if (quedo === "tiene_cuenta") return { estado: "tiene_cuenta" };
    if (quedo !== "borrado") return { estado: "no_disponible" };
  }
  return { estado: "no_disponible" };
}

/** El id del usuario de un correo que el proyecto dijo que ya existe. `generateLink` lo devuelve sin mandar ningún correo (y
 *  solo se llama cuando el usuario existe: con un correo nuevo, lo crearía). */
async function idDelUsuarioConfirmado(admin: SupabaseClient, correo: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  if (data.user?.id) return data.user.id;
  console.error(JSON.stringify({ evento: "tienda_buscar_usuario_fallo", codigo: error?.code ?? null, estado: error?.status ?? null }));
  return null;
}

export type Borrado = "borrado" | "tiene_cuenta" | "reciente" | "quedo_suelto";

/**
 * Borra un usuario del proyecto de clientes SOLO si la base CONTESTA que no tiene cuenta. Con `respetarRecientes`, no borra uno
 * confirmado hace menos de 2 minutos (puede estar creando su cuenta en otra pestaña). Si la base no contesta, no borra nada.
 */
export async function borrarSiNoTieneCuenta(admin: SupabaseClient, id: string, { respetarRecientes }: { respetarRecientes: boolean }): Promise<Borrado> {
  const cuenta = await leerMiCuentaEnBase(id);
  if (cuenta.estado === "cuenta") return "tiene_cuenta";
  if (cuenta.estado !== "sin_cuenta") return "quedo_suelto";
  if (respetarRecientes) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error?.status === 404) return "borrado";
    if (error || !data.user) return "quedo_suelto";
    const confirmado = data.user.email_confirmed_at ?? data.user.confirmed_at;
    if (confirmado && Date.now() - Date.parse(confirmado) < RECIEN_CONFIRMADO_MS) return "reciente";
  }
  const { error } = await admin.auth.admin.deleteUser(id);
  if (!error || error.status === 404) return "borrado";
  console.error(JSON.stringify({ evento: "tienda_borrar_usuario_fallo", usuario_web_id: id, estado: error.status ?? null }));
  return "quedo_suelto";
}

/** Los invitados de pendientes que llevan un día sin moverse (la base los devuelve al reservar un envío): se van si no tienen
 *  cuenta. Lo que no se pueda borrar ahora no traba a nadie: invitar ese correo de nuevo reusa al mismo usuario. */
export async function limpiarInvitados(admin: SupabaseClient, ids: readonly string[]): Promise<void> {
  await Promise.allSettled(ids.slice(0, 20).map((id) => borrarSiNoTieneCuenta(admin, id, { respetarRecientes: true })));
}

export type Confirmacion = { estado: "confirmado"; usuarioWebId: string } | { estado: "codigo_malo" } | { estado: "no_disponible" };

/**
 * El código que llegó al correo: si es el bueno, el usuario queda confirmado y se le pone la contraseña que eligió (con la llave
 * secreta: no hace falta abrir sesión). La sesión que abre la verificación se cierra enseguida: se entra recién con la cuenta
 * creada. Uno equivocado, vencido, anulado por otro más nuevo o de otro correo → `codigo_malo`.
 */
export async function confirmarCorreo(admin: SupabaseClient, correo: string, codigo: string, clave: string): Promise<Confirmacion> {
  const suelto = clienteSuelto();
  if (!suelto) return { estado: "no_disponible" };
  const verificado = await suelto.auth.verifyOtp({ email: correo, token: codigo, type: "invite" });
  if (verificado.error) {
    const malo = isAuthApiError(verificado.error) && (verificado.error.status === 403 || verificado.error.code === "otp_expired");
    if (!malo && !isAuthRetryableFetchError(verificado.error)) {
      console.error(JSON.stringify({ evento: "tienda_verificar_codigo_fallo", codigo: verificado.error.code ?? null, estado: verificado.error.status ?? null }));
    }
    return malo ? { estado: "codigo_malo" } : { estado: "no_disponible" };
  }
  const id = verificado.data.user?.id;
  await suelto.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (!id) return { estado: "no_disponible" };
  const { error } = await admin.auth.admin.updateUserById(id, { password: clave });
  if (error) {
    console.error(JSON.stringify({ evento: "tienda_poner_clave_fallo", codigo: error.code ?? null, estado: error.status ?? null }));
    await borrarSiNoTieneCuenta(admin, id, { respetarRecientes: false });
    return { estado: "no_disponible" };
  }
  return { estado: "confirmado", usuarioWebId: id };
}
