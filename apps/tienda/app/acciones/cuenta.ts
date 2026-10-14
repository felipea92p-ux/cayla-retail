"use server";

import { isAuthApiError, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import {
  celularNormalizado,
  correoValido,
  errorDeRegistro,
  esquemaRegistro,
  estadoClave,
  hoyLima,
  MENSAJES,
  nombreLimpio,
  normalizarCorreo,
  problemaRegistro,
  TEXTOS_VERSION,
  type CampoRegistro,
  type ConsultaCorreo,
  type ConsultaDni,
} from "@/lib/cuentas";
import { consultarCorreoEnBase, consultarDocumentoEnBase, leerMiCuentaEnBase, registrarCuentaEnBase, revisarRegistroEnBase } from "@/lib/cuentas-servidor";
import { huellas } from "@/lib/intentos-servidor";
import { buscarNombre } from "@/lib/padron-servidor";
import { borrarCookiesDeSesion, clienteAdmin, clienteSesion, clienteSuelto, leerSesion } from "@/lib/sesion-servidor";

// Las acciones de la cuenta de la tienda online (ADR-0408, actividad 2). Las llama una persona sin sesión, como POST a la página
// donde están: no confían en nada de lo que llega (lo vuelven a revisar con las reglas de `lib/cuentas.ts`) y la base decide
// (`retail.tienda_*`, que cuenta los intentos y valida todo otra vez). Ninguna respuesta trae datos de otra persona: el nombre
// del padrón sale a medias. En los registros del servidor nunca va un correo, un DNI, un celular ni un nombre.

/* ------------------------------------------------------------------ Mientras se escribe */

/** «¿Ya hay una cuenta con este correo?» mientras se escribe. Sin respuesta, `sin_revisar`: la base lo vuelve a ver al crear. */
export async function consultarCorreo(correo: unknown): Promise<ConsultaCorreo> {
  if (typeof correo !== "string" || !correoValido(correo)) return "sin_revisar";
  const h = await huellas();
  if (!h) return "sin_revisar";
  const r = await consultarCorreoEnBase(normalizarCorreo(correo), h.ip);
  return r === "repetido" ? "repetido" : r === "libre" ? "libre" : "sin_revisar";
}

/**
 * Con los 8 dígitos: si ese DNI ya tiene cuenta, si su ficha está archivada, si ya era del Club, y su nombre del padrón A MEDIAS
 * («Maria P. S.»). Nunca el nombre completo. Si el padrón no lo encuentra o no responde, la persona escribe su nombre.
 */
export async function consultarDni(dni: unknown): Promise<ConsultaDni> {
  if (typeof dni !== "string" || !/^\d{8}$/.test(dni)) return { estado: "sin_revisar" };
  const h = await huellas(dni);
  if (!h?.documento) return { estado: "sin_nombre", motivo: "sin_padron", delClub: false };
  const enBase = await consultarDocumentoEnBase(dni, h.ip, h.documento);
  if (enBase.estado === "repetido" || enBase.estado === "archivada") return { estado: enBase.estado };
  if (enBase.estado === "limite") return { estado: "sin_nombre", motivo: "limite", delClub: false };
  if (enBase.estado !== "libre") return { estado: "sin_nombre", motivo: "sin_padron", delClub: false };
  const padron = await buscarNombre(dni);
  if (padron.estado === "encontrado") return { estado: "encontrado", aMedias: padron.aMedias, delClub: enBase.delClub };
  return { estado: "sin_nombre", motivo: padron.estado, delClub: enBase.delClub };
}

/* ------------------------------------------------------------------ Crear la cuenta */

export type RespuestaRegistro = { campo: CampoRegistro | null; mensaje: string };

const NO_DISPONIBLE: RespuestaRegistro = { campo: null, mensaje: MENSAJES.noDisponible };

/**
 * «Crear mi cuenta». El orden seguro (principio 9): (1) la base revisa el correo, el DNI y los topes ANTES de crear nada;
 * (2) el nombre: el del padrón, consultado aquí (el del navegador no cuenta); si no, el que escribió; (3) el usuario en el
 * proyecto de clientes; (4) la cuenta en la base, todo o nada. Si (4) dice que no, el usuario de (3) se borra para no dejarlo
 * suelto, salvo que la base diga que ya tiene cuenta (un doble envío la creó) o no conteste (no se borra a ciegas: al entrar,
 * la tienda ve que no tiene cuenta y deja crearla de nuevo). (5) Entra y va a «Mi cuenta».
 */
export async function crearCuenta(entrada: unknown): Promise<RespuestaRegistro> {
  const leido = esquemaRegistro.safeParse(entrada);
  if (!leido.success) return NO_DISPONIBLE;
  const r = leido.data;
  const problema = problemaRegistro(r, hoyLima());
  if (problema) return problema;

  const admin = clienteAdmin();
  const sesion = await clienteSesion();
  const h = await huellas(r.dni);
  if (!admin || !sesion || !h?.documento) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_sin_configurar", admin: !!admin, sesion: !!sesion, huellas: !!h }));
    return NO_DISPONIBLE;
  }
  const correo = normalizarCorreo(r.correo);
  const celular = celularNormalizado(r.celular);

  // 1. La base revisa antes de crear el usuario (y cuenta el intento).
  const revision = await revisarRegistroEnBase(correo, r.dni, celular, h.ip, h.documento);
  if (revision.estado !== "ok") {
    if (revision.estado === "limite") return { campo: null, mensaje: MENSAJES.limite };
    if (revision.estado === "correo_repetido") return { campo: "correo", mensaje: MENSAJES.correoRepetido };
    if (revision.estado === "dni_repetido") return { campo: "dni", mensaje: MENSAJES.dniRepetido };
    if (revision.estado === "archivada") return { campo: "dni", mensaje: MENSAJES.dniArchivada };
    if (revision.estado === "invalido") return errorDeRegistro("cuenta_datos_invalidos", revision.campo);
    return NO_DISPONIBLE;
  }

  // 2. El nombre.
  const padron = await buscarNombre(r.dni);
  const nombre = padron.estado === "encontrado" ? padron.nombre : nombreLimpio(r.nombre);
  if (nombre.length < 3) return { campo: "nombre", mensaje: "Escribe tus nombres y apellidos, tal como están en tu DNI." };

  // 3. El usuario de inicio de sesión.
  const usuario = await crearUsuario(admin, correo, r.clave);
  if ("problema" in usuario) return usuario.problema;

  // 4. La cuenta en la base.
  const [dia, mes] = [Number(r.cumple.d), Number(r.cumple.m)];
  const registro = await registrarCuentaEnBase({
    usuarioWebId: usuario.id,
    correo,
    dni: r.dni,
    nombre,
    nombreDelPadron: padron.estado === "encontrado",
    celular,
    cumpleDia: dia,
    cumpleMes: mes,
    cumpleAnio: r.cumple.a ? Number(r.cumple.a) : null,
    textos: TEXTOS_VERSION,
  });
  let aviso = "bienvenida";
  if (registro.ok) {
    aviso = registro.seUnioASuFicha ? "unida" : "bienvenida";
  } else {
    const quedo = await deshacerUsuario(admin, usuario.id);
    if (quedo !== "tiene_cuenta") return errorDeRegistro(registro.hint, registro.detalle);
  }

  // 5. Entrar. Si el proyecto de clientes no contesta justo ahora, la cuenta igual quedó: que entre con su correo.
  const { error } = await sesion.auth.signInWithPassword({ email: correo, password: r.clave });
  if (error) redirect("/entrar?aviso=cuenta-creada");
  redirect(`/cuenta?aviso=${aviso}`);
}

/** El usuario del proyecto de clientes. Si el correo ya existe ahí pero sin cuenta en la base (un intento anterior que quedó a
 *  medias) y la contraseña es la misma, se usa ese. */
async function crearUsuario(admin: SupabaseClient, correo: string, clave: string): Promise<{ id: string } | { problema: RespuestaRegistro }> {
  const creado = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
  if (creado.data.user) return { id: creado.data.user.id };
  const error = creado.error;
  if (error && isAuthApiError(error) && (error.code === "email_exists" || error.code === "user_already_exists")) {
    const suelto = clienteSuelto();
    const prueba = suelto ? await suelto.auth.signInWithPassword({ email: correo, password: clave }) : null;
    const id = prueba?.data.user?.id;
    // Esa sesión solo servía para saber de quién es el usuario: no se deja abierta.
    if (id) await suelto?.auth.signOut({ scope: "local" }).catch(() => undefined);
    if (id && (await leerMiCuentaEnBase(id)).estado === "sin_cuenta") return { id };
    return { problema: { campo: "correo", mensaje: MENSAJES.correoRepetido } };
  }
  if (error && isAuthApiError(error) && error.code === "weak_password") return { problema: { campo: "clave", mensaje: MENSAJES.claveAyuda } };
  console.error(JSON.stringify({ evento: "tienda_crear_usuario_fallo", codigo: error?.code ?? null, estado: error?.status ?? null }));
  return { problema: NO_DISPONIBLE };
}

/** Borra el usuario recién creado si la base dice que NO tiene cuenta. Si la tiene, la creó un doble envío: se queda. Si la base
 *  no contesta, no se borra nada (queda anotado; al entrar, la tienda deja crear la cuenta de nuevo). */
async function deshacerUsuario(admin: SupabaseClient, id: string): Promise<"borrado" | "tiene_cuenta" | "quedo_suelto"> {
  const cuenta = await leerMiCuentaEnBase(id);
  if (cuenta.estado === "cuenta") return "tiene_cuenta";
  if (cuenta.estado === "sin_cuenta") {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error || error.status === 404) return "borrado";
  }
  console.error(JSON.stringify({ evento: "tienda_usuario_sin_cuenta", usuario_web_id: id }));
  return "quedo_suelto";
}

/* ------------------------------------------------------------------ Salir y rehacer */

/** «Salir»: cierra la sesión de este aparato y vuelve a la portada. */
export async function salir(): Promise<void> {
  const sesion = await clienteSesion();
  if (sesion) await sesion.auth.signOut({ scope: "local" }).catch(() => undefined);
  await borrarCookiesDeSesion();
  redirect("/?aviso=salir");
}

/**
 * La cuenta que no terminó de crearse (el usuario existe en el proyecto de clientes, pero la base no tiene su cuenta): con su
 * sesión abierta prueba que es suyo, así que se borra para que el correo quede libre, y va a crear la cuenta de nuevo. Solo si la
 * base CONTESTA que no tiene cuenta.
 */
export async function rehacerCuenta(): Promise<void> {
  const lectura = await leerSesion();
  if (lectura.estado === "con_sesion" && (await leerMiCuentaEnBase(lectura.usuarioId)).estado === "sin_cuenta") {
    const admin = clienteAdmin();
    const { error } = admin ? await admin.auth.admin.deleteUser(lectura.usuarioId) : { error: null };
    if (error && error.status !== 404) console.error(JSON.stringify({ evento: "tienda_rehacer_cuenta_fallo", usuario_web_id: lectura.usuarioId }));
  }
  const sesion = await clienteSesion();
  if (sesion) await sesion.auth.signOut({ scope: "local" }).catch(() => undefined);
  await borrarCookiesDeSesion();
  redirect("/crear-cuenta");
}

/* ------------------------------------------------------------------ La contraseña nueva */

export type RespuestaClave = { mensaje: string; vencido: boolean };

/**
 * «Guardar y entrar» desde el enlace del correo. El código de un solo uso se canjea recién aquí (un POST), no al abrir la
 * página: un lector de correos que abre los enlaces solo no lo gasta. Canjearlo abre la sesión; después se guarda la contraseña.
 */
export async function guardarClaveNueva(tokenHash: unknown, clave: unknown): Promise<RespuestaClave> {
  if (typeof clave !== "string" || estadoClave(clave) !== "ok") return { mensaje: MENSAJES.claveAyuda, vencido: false };
  if (typeof tokenHash !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) return { mensaje: MENSAJES.enlaceVencido, vencido: true };
  const sesion = await clienteSesion();
  if (!sesion) return { mensaje: MENSAJES.claveNoDisponible, vencido: false };

  const verificado = await sesion.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (verificado.error) {
    return isAuthRetryableFetchError(verificado.error)
      ? { mensaje: MENSAJES.claveNoDisponible, vencido: false }
      : { mensaje: MENSAJES.enlaceVencido, vencido: true };
  }
  const cambio = await sesion.auth.updateUser({ password: clave });
  if (cambio.error) {
    if (isAuthApiError(cambio.error) && cambio.error.code === "same_password") redirect("/cuenta?aviso=clave-igual");
    if (isAuthApiError(cambio.error) && cambio.error.code === "weak_password") return { mensaje: MENSAJES.claveAyuda, vencido: false };
    console.error(JSON.stringify({ evento: "tienda_guardar_clave_fallo", codigo: cambio.error.code ?? null }));
    return { mensaje: MENSAJES.claveNoDisponible, vencido: false };
  }
  redirect("/cuenta?aviso=clave");
}
