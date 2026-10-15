"use server";

import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_ENTRADA, ENTRADA_DURA_S, marcaDeEntrada } from "@/lib/entrada";
import { anotarEntradaEnBase, usuarioBorradoEnBase } from "@/lib/entrada-servidor";
import {
  avisoAlCrear,
  CODIGO_BLOQUEO_MIN,
  CODIGO_ESPERA_S,
  celularNormalizado,
  codigoCompleto,
  codigoLimpio,
  correoValido,
  errorDeRegistro,
  esquemaConfirmarCodigo,
  esquemaPedirCodigo,
  estadoClave,
  hoyLima,
  MENSAJES,
  mensajeCodigoBloqueado,
  mensajeCodigoEsperar,
  mensajeCodigoLimite,
  mensajeCodigoMalo,
  mensajeSinNombre,
  normalizarCorreo,
  problemaRegistro,
  TEXTOS_VERSION,
  type CampoProblema,
  type CasillaWhatsapp,
  type ConsultaCorreo,
  type ConsultaDni,
} from "@/lib/cuentas";
import {
  anotarInvitadoEnBase,
  consultarCorreoEnBase,
  consultarDocumentoEnBase,
  intentoDeCodigoEnBase,
  leerCasillaDeAvisos,
  leerMiCuentaEnBase,
  registrarCuentaEnBase,
  reservarEnvioEnBase,
  revisarRegistroEnBase,
} from "@/lib/cuentas-servidor";
import { huellas } from "@/lib/intentos-servidor";
import { anotarLecturaDelPadron, buscarNombre } from "@/lib/padron-servidor";
import { borrarCookiesDeSesion, clienteAdmin, clienteSesion, leerSesion } from "@/lib/sesion-servidor";
import { borrarSiNoTieneCuenta, confirmarCorreo, invitarCorreo, limpiarInvitados } from "@/lib/usuarios-servidor";

// Las acciones de la cuenta de la tienda online (ADR-0408, actividades 2 y 2b). Las llama una persona sin sesión, como POST a la
// página donde están: no confían en nada de lo que llega (lo vuelven a revisar con las reglas de `lib/cuentas.ts`) y la base
// decide (`retail.tienda_*`, que cuenta los intentos y valida todo otra vez). Ninguna respuesta trae datos de otra persona: el
// nombre del padrón sale a medias. En los registros del servidor nunca va un correo, un DNI, un celular, un nombre ni un código.

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
 * («Maria P. S.»). Nunca el nombre completo. Si el padrón no lo encuentra o no responde, no se puede crear la cuenta: el nombre no se
 * escribe a mano (Felipe 2026-10-15), y la página ofrece «Volver a intentar».
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

/* ------------------------------------------------------------------ Crear la cuenta: el código y la cuenta (actividad 2b) */

/**
 * Lo que contesta cada paso. `datos`: la persona se queda (o vuelve) en sus datos, con el problema en su campo. `codigo`: está en
 * el paso del código, con lo que dice bajo la caja (o nada), cuántos segundos faltan para poder pedir otro (null: los que ya
 * corrían) y, si el código que probó no sirve, por qué (`malo`: se escribe otra vez; `vencido`: hace falta uno nuevo;
 * `bloqueado`: hay que esperar y pedir uno nuevo). Crear la cuenta bien no contesta: lleva a «Mi cuenta».
 */
export type RespuestaCodigo =
  | { paso: "datos"; campo: CampoProblema | null; mensaje: string; casilla?: CasillaWhatsapp | null }
  | { paso: "codigo"; mensaje: string | null; tono: "error" | "aviso" | "ok"; espera: number | null; codigo?: "malo" | "vencido" | "bloqueado" };

const enDatos = (campo: CampoProblema | null, mensaje: string): RespuestaCodigo => ({ paso: "datos", campo, mensaje });
const enCodigo = (mensaje: string | null, tono: "error" | "aviso" | "ok", espera: number | null, codigo?: "malo" | "vencido" | "bloqueado"): RespuestaCodigo => ({
  paso: "codigo",
  mensaje,
  tono,
  espera,
  ...(codigo ? { codigo } : {}),
});

/**
 * «Mandarme el código». El orden seguro (principio 9): (1) la base revisa el correo, el DNI y los topes (y cuenta el intento,
 * con sus topes por ip, documento y celular); (2) el nombre: el del padrón, que no se escribe a mano (sin él no se manda el código:
 * no habría cuenta); (3) los avisos: el texto que leyó sigue siendo el vigente; (4) la base reserva el envío (60 s entre uno y otro,
 * 5 por hora) y (5) el proyecto de clientes manda el código. Hasta el código bueno no existe ni la cuenta ni la ficha.
 */
export async function pedirCodigo(entrada: unknown): Promise<RespuestaCodigo> {
  const leido = esquemaPedirCodigo.safeParse(entrada);
  if (!leido.success) return enDatos(null, MENSAJES.noDisponible);
  const { registro: r, casilla } = leido.data;
  const problema = problemaRegistro(r, hoyLima());
  if (problema) return enDatos(problema.campo, problema.mensaje);

  const admin = clienteAdmin();
  const h = await huellas(r.dni);
  if (!admin || !h?.documento) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_sin_configurar", admin: !!admin, huellas: !!h }));
    return enDatos(null, MENSAJES.noDisponible);
  }
  const correo = normalizarCorreo(r.correo);

  // 1. La base revisa antes de mandar nada (y cuenta el intento).
  const revision = await revisarRegistroEnBase(correo, r.dni, celularNormalizado(r.celular), h.ip, h.documento);
  if (revision.estado !== "ok") {
    if (revision.estado === "limite") return enDatos(null, MENSAJES.limite);
    if (revision.estado === "correo_repetido") return enDatos("correo", MENSAJES.correoRepetido);
    // Un correo es de una sola persona: el de contacto de otra ficha no sirve para esta cuenta (sin decir de quién es).
    if (revision.estado === "correo_de_otra_persona") return enDatos("correo", MENSAJES.correoDeOtraPersona);
    if (revision.estado === "dni_repetido") return enDatos("dni", MENSAJES.dniRepetido);
    if (revision.estado === "archivada") return enDatos("dni", MENSAJES.dniArchivada);
    if (revision.estado === "invalido") {
      const e = errorDeRegistro("cuenta_datos_invalidos", revision.campo);
      return enDatos(e.campo, e.mensaje);
    }
    return enDatos(null, MENSAJES.noDisponible);
  }

  // 2. El nombre del padrón: que no falte después del código.
  const nombre = await nombreParaLaCuenta(r.dni, false);
  if (nombre.estado !== "ok") return enDatos("dni", mensajeSinNombre(nombre.estado));

  // 3. Los avisos citan el texto que leyó: si cambió, que lo vuelva a leer antes de recibir el código.
  if (r.avisos) {
    const vigente = await leerCasillaDeAvisos();
    if (!vigente || vigente.version !== casilla) return { paso: "datos", campo: "avisos", mensaje: MENSAJES.avisosCambio, casilla: vigente };
  }

  // 4 y 5. El código.
  return mandarCodigo(correo, false);
}

/** «Pedir otro código», en el paso del código. Solo para un correo que ya pidió el suyo (la base lo exige). */
export async function reenviarCodigo(correo: unknown): Promise<RespuestaCodigo> {
  if (typeof correo !== "string" || !correoValido(correo)) return enDatos("correo", MENSAJES.correoMal);
  return mandarCodigo(normalizarCorreo(correo), true);
}

async function mandarCodigo(correo: string, reenvio: boolean): Promise<RespuestaCodigo> {
  const admin = clienteAdmin();
  if (!admin) return reenvio ? enCodigo(MENSAJES.codigoNoEnviado, "error", null) : enDatos(null, MENSAJES.noDisponible);
  const reserva = await reservarEnvioEnBase(correo, reenvio);
  // Lo que nadie terminó (pendientes de otros correos que llevan un día quietos): sus usuarios invitados se van, sin esperar.
  const limpieza = reserva.limpiar.length ? limpiarInvitados(admin, reserva.limpiar) : Promise.resolve();

  let respuesta: RespuestaCodigo;
  switch (reserva.estado) {
    case "enviar": {
      const invitacion = await invitarCorreo(admin, correo);
      if (invitacion.estado === "tiene_cuenta") respuesta = enDatos("correo", MENSAJES.correoRepetido);
      else if (invitacion.estado !== "invitado") respuesta = reenvio ? enCodigo(MENSAJES.codigoNoEnviado, "error", null) : enDatos(null, MENSAJES.codigoNoEnviado);
      // Sin el usuario anotado, la base no dejaría crear la cuenta con ese código: mejor decirlo ahora.
      else if ((await anotarInvitadoEnBase(correo, invitacion.usuarioWebId)) !== true)
        respuesta = reenvio ? enCodigo(MENSAJES.codigoNoEnviado, "error", null) : enDatos(null, MENSAJES.codigoNoEnviado);
      else respuesta = enCodigo(reenvio ? MENSAJES.codigoNuevo : null, "ok", CODIGO_ESPERA_S);
      break;
    }
    case "esperar":
      // El último código sigue sirviendo: se va (o se queda) en el paso del código.
      respuesta = enCodigo(reenvio ? mensajeCodigoEsperar(reserva.segundos) : "Ya te mandamos un código hace poco: revisa tu correo.", "aviso", reserva.segundos);
      break;
    case "limite":
      respuesta = enCodigo(mensajeCodigoLimite(reserva.minutos), "aviso", reserva.minutos * 60);
      break;
    case "bloqueado":
      respuesta = reenvio
        ? enCodigo(mensajeCodigoBloqueado(reserva.minutos), "error", reserva.minutos * 60, "bloqueado")
        : enDatos(null, mensajeCodigoBloqueado(reserva.minutos));
      break;
    case "correo_repetido":
      respuesta = enDatos("correo", MENSAJES.correoRepetido);
      break;
    case "invalido":
      respuesta = enDatos("correo", MENSAJES.correoMal);
      break;
    case "sin_codigo":
      respuesta = enDatos(null, MENSAJES.codigoSinPedir);
      break;
    default:
      respuesta = reenvio ? enCodigo(MENSAJES.codigoNoEnviado, "error", null) : enDatos(null, MENSAJES.noDisponible);
  }
  await limpieza;
  return respuesta;
}

/**
 * «Crear mi cuenta», con el código. El orden seguro: (1) los datos y el nombre, otra vez; (2) la base cuenta el intento ANTES de
 * probarlo (5 por código; con el quinto, 15 minutos de bloqueo); (3) el proyecto de clientes verifica el código y se le pone la
 * contraseña; (4) la cuenta en la base, todo o nada (exige el correo pendiente de ESTE usuario). Si (4) dice que no, el usuario de
 * (3) se borra para no dejarlo suelto, salvo que ya tenga cuenta (un doble envío) o la base no conteste. (5) Entra y va a «Mi
 * cuenta».
 */
export async function confirmarCodigo(entrada: unknown): Promise<RespuestaCodigo> {
  const leido = esquemaConfirmarCodigo.safeParse(entrada);
  if (!leido.success) return enDatos(null, MENSAJES.noDisponible);
  const { registro: r, casilla } = leido.data;
  const problema = problemaRegistro(r, hoyLima());
  if (problema) return enDatos(problema.campo, problema.mensaje);
  const codigo = codigoLimpio(leido.data.codigo);
  if (!codigoCompleto(codigo)) return enCodigo("Escribe los 6 números del código.", "error", null);

  const admin = clienteAdmin();
  const sesion = await clienteSesion();
  if (!admin || !sesion) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_sin_configurar", admin: !!admin, sesion: !!sesion }));
    return enCodigo(MENSAJES.noDisponible, "error", null);
  }
  const correo = normalizarCorreo(r.correo);

  // 1. El nombre del padrón (antes de gastar un intento), anotado en la base: sin esa lectura la ficha no lo acepta.
  const nombre = await nombreParaLaCuenta(r.dni, true);
  if (nombre.estado !== "ok") return enDatos("dni", mensajeSinNombre(nombre.estado));

  // 2. ¿Se puede probar? (Cuenta el intento.)
  const intento = await intentoDeCodigoEnBase(correo);
  if (intento.estado === "bloqueado") return enCodigo(mensajeCodigoBloqueado(intento.minutos), "error", intento.minutos * 60, "bloqueado");
  if (intento.estado === "vencido") return enCodigo(MENSAJES.codigoVencido, "error", 0, "vencido");
  if (intento.estado === "sin_codigo") return enDatos(null, MENSAJES.codigoSinPedir);
  if (intento.estado !== "puede") return enCodigo(MENSAJES.codigoNoProbado, "error", null);

  // 3. El código, en el proyecto de clientes.
  const confirmado = await confirmarCorreo(admin, correo, codigo, r.clave);
  if (confirmado.estado === "codigo_malo") {
    // Con el quinto equivocado la base ya dejó el bloqueo: «Pedir otro código» espera esos minutos.
    return intento.quedan > 0
      ? enCodigo(mensajeCodigoMalo(intento.quedan), "error", null, "malo")
      : enCodigo(mensajeCodigoMalo(0), "error", CODIGO_BLOQUEO_MIN * 60, "bloqueado");
  }
  if (confirmado.estado !== "confirmado") return enCodigo(MENSAJES.codigoNoProbado, "error", null);

  // 4. La cuenta en la base.
  const [dia, mes] = [Number(r.cumple.d), Number(r.cumple.m)];
  const registro = await registrarCuentaEnBase({
    usuarioWebId: confirmado.usuarioWebId,
    correo,
    dni: r.dni,
    nombre: nombre.nombre,
    nombreDelPadron: true,
    celular: celularNormalizado(r.celular),
    cumpleDia: dia,
    cumpleMes: mes,
    cumpleAnio: r.cumple.a ? Number(r.cumple.a) : null,
    mayorDeEdad: r.mayor,
    avisosWhatsapp: r.avisos,
    casillaVersion: r.avisos ? casilla : null,
    textos: TEXTOS_VERSION,
  });
  let aviso = "bienvenida";
  if (registro.ok) {
    aviso = avisoAlCrear(registro.seUnioASuFicha, registro.avisos);
  } else {
    const quedo = await borrarSiNoTieneCuenta(admin, confirmado.usuarioWebId, { respetarRecientes: false });
    if (quedo !== "tiene_cuenta") {
      if (quedo !== "borrado") console.error(JSON.stringify({ evento: "tienda_usuario_sin_cuenta", usuario_web_id: confirmado.usuarioWebId }));
      const e = errorDeRegistro(registro.hint, registro.detalle);
      // El código ya se usó: para cualquier arreglo hace falta otro, así que se vuelve a los datos (con el texto nuevo de los
      // avisos, si fue eso lo que cambió).
      if (e.campo === "avisos") return { paso: "datos", campo: "avisos", mensaje: e.mensaje, casilla: await leerCasillaDeAvisos() };
      return enDatos(e.campo === "codigo" ? null : e.campo, e.mensaje);
    }
  }

  // 5. Entrar. Si el proyecto de clientes no contesta justo ahora, la cuenta igual quedó: que entre con su correo.
  const { error } = await sesion.auth.signInWithPassword({ email: correo, password: r.clave });
  if (error) redirect("/entrar?aviso=cuenta-creada");
  // Crear la cuenta también es entrar (la conservación del Club ya la cuenta por `creada_en`): se anota y se deja la marca del día,
  // así el marco de «Mi cuenta» no vuelve a preguntar hoy.
  if ((await anotarEntradaEnBase(confirmado.usuarioWebId)) === "anotada") await marcarEntradaDeHoy(confirmado.usuarioWebId);
  redirect(`/cuenta?aviso=${aviso}`);
}

/** La marca de «hoy ya se anotó la entrada» de este aparato (la misma que deja `anotarEntrada`). */
async function marcarEntradaDeHoy(usuarioWebId: string): Promise<void> {
  (await cookies()).set(COOKIE_ENTRADA, marcaDeEntrada(usuarioWebId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ENTRADA_DURA_S,
  });
}

/**
 * El nombre que va a la cuenta: SOLO el del padrón, consultado aquí (lo que diga el navegador no cuenta; Felipe 2026-10-15: sin la
 * API no se registra). `anotar`: justo antes de crear la cuenta, deja la lectura en la base (`tienda_anotar_lectura_padron`), que es
 * lo que la ficha exige para aceptar el nombre; si no se pudo anotar, se lee como que el padrón no respondió (se vuelve a intentar).
 */
async function nombreParaLaCuenta(
  dni: string,
  anotar: boolean,
): Promise<{ estado: "ok"; nombre: string } | { estado: "no_encontrado" | "sin_padron" }> {
  const padron = await buscarNombre(dni);
  if (padron.estado !== "encontrado") return { estado: padron.estado };
  if (anotar && !(await anotarLecturaDelPadron(dni, padron.nombre))) return { estado: "sin_padron" };
  return { estado: "ok", nombre: padron.nombre };
}

/* ------------------------------------------------------------------ Salir y rehacer */

/** «Salir»: cierra la sesión de este aparato y vuelve a la portada. */
export async function salir(): Promise<void> {
  const sesion = await clienteSesion();
  if (sesion) await sesion.auth.signOut({ scope: "local" }).catch(() => undefined);
  await borrarCookiesDeSesion();
  // La marca de la entrada de hoy es de esta sesión: la próxima que entre en este aparato se anota igual.
  (await cookies()).delete(COOKIE_ENTRADA);
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
    // Si era el usuario de una cuenta CERRADA (su ficha se anonimizó hoy mismo, con la sesión abierta), la base lo anota como borrado;
    // si no lo era, no cambia nada.
    else if (admin) await usuarioBorradoEnBase(lectura.usuarioId);
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
