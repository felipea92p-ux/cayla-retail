"use server";

import { esTipoDocumentoClienta, type TipoDocumentoClienta } from "@cayla-retail/shared";
import { isAuthApiError, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  borrarConfirmacion,
  confirmacionDeEsteAparato,
  guardarConfirmacion,
  hayLlaveDeConfirmacion,
  usuarioConfirmadoDeEsteAparato,
} from "@/lib/correo-confirmado-servidor";
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
  documentoCompleto,
  documentoRepetido,
  errorDeRegistro,
  esquemaCrearCuenta,
  estadoClave,
  hoyLima,
  MENSAJES,
  mensajeCodigoBloqueado,
  mensajeCodigoEsperar,
  mensajeCodigoLimite,
  mensajeCodigoMalo,
  mensajeSinNombre,
  nombreEscrito,
  normalizarCorreo,
  problemaRegistro,
  TEXTOS_VERSION,
  type CampoProblema,
  type CasillaWhatsapp,
  type ConsultaCorreo,
  type ConsultaDocumento,
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
  type DatosCuenta,
} from "@/lib/cuentas-servidor";
import { huellas } from "@/lib/intentos-servidor";
import { anotarLecturaDelPadron, buscarNombre } from "@/lib/padron-servidor";
import { borrarCookiesDeSesion, clienteAdmin, clienteSesion, leerSesion } from "@/lib/sesion-servidor";
import { borrarSiNoTieneCuenta, estaConfirmado, invitarCorreo, limpiarInvitados, ponerClave, verificarCodigo } from "@/lib/usuarios-servidor";

// Las acciones de la cuenta de la tienda online (ADR-0408, actividades 2 y 2b). Las llama una persona sin sesión, como POST a la
// página donde están: no confían en nada de lo que llega (lo vuelven a revisar con las reglas de `lib/cuentas.ts`) y la base
// decide (`retail.tienda_*`, que cuenta los intentos y valida todo otra vez). Ninguna respuesta trae datos de otra persona: el
// nombre del padrón sale a medias. En los registros del servidor nunca va un correo, un DNI, un celular, un nombre ni un código.
// Desde el 2026-10-15 el código se pide y se confirma bajo el correo, antes de lo demás («Obtener código»), y «Crear mi cuenta»
// vuelve a exigir esa confirmación: la prueba firmada de este aparato (`lib/correo-confirmado.ts`), nunca lo que diga el navegador.

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
 * Con el documento completo: si ya tiene cuenta, si su ficha está archivada, si ya era del Club y, con DNI, su nombre del padrón A
 * MEDIAS («María P. G.»). Nunca el nombre completo. Con DNI, si el padrón no lo encuentra o no responde, no se puede crear la cuenta:
 * el nombre no se escribe a mano (Felipe 2026-10-15), y la página ofrece «Volver a intentar». Con carné de extranjería o pasaporte
 * (Felipe 2026-10-15, «como en las tiendas») no hay padrón: el nombre se escribe tal cual está en el documento.
 */
export async function consultarDocumento(tipo: unknown, numero: unknown): Promise<ConsultaDocumento> {
  if (!esTipoDocumentoClienta(tipo) || typeof numero !== "string" || !documentoCompleto(tipo, numero)) return { estado: "sin_revisar" };
  const h = await huellas({ tipo, numero });
  const sinRespuesta: ConsultaDocumento = { estado: "sin_nombre", motivo: "sin_padron", delClub: false };
  if (!h?.documento) return sinRespuesta;
  const enBase = await consultarDocumentoEnBase(tipo, numero, h.ip, h.documento);
  if (enBase.estado === "repetido" || enBase.estado === "archivada") return { estado: enBase.estado };
  if (enBase.estado === "limite") return { estado: "sin_nombre", motivo: "limite", delClub: false };
  if (enBase.estado !== "libre") return sinRespuesta;
  if (tipo !== "dni") return { estado: "libre", delClub: enBase.delClub };
  const padron = await buscarNombre(numero);
  if (padron.estado === "encontrado") return { estado: "encontrado", aMedias: padron.aMedias, delClub: enBase.delClub };
  return { estado: "sin_nombre", motivo: padron.estado, delClub: enBase.delClub };
}

/* ------------------------------------------------------------------ El código, bajo el correo (Felipe 2026-10-15) */

/**
 * Lo que contestan «Obtener código», «Reenviar» y la caja del código. `confirmado`: el correo quedó confirmado en ESTE aparato.
 * `correo`: el código no se pide, por algo del correo (`repetido`: ya tiene cuenta; si no, lo que dice `mensaje`). `codigo`: lo que
 * dice la caja del código (o nada); `enviado`: hay un código mandado a ese correo que puede servir (la caja aparece); cuántos
 * segundos faltan para poder pedir otro (null: los que ya corrían) y, si el código que probó no sirve, por qué (`malo`: se escribe
 * otra vez; `vencido`: hace falta uno nuevo; `bloqueado`: hay que esperar y pedir uno nuevo).
 */
export type RespuestaDelCodigo =
  | { estado: "confirmado" }
  | { estado: "correo"; repetido: boolean; mensaje: string }
  | {
      estado: "codigo";
      enviado: boolean;
      mensaje: string | null;
      tono: "error" | "aviso" | "ok";
      espera: number | null;
      codigo?: "malo" | "vencido" | "bloqueado";
    };

const enCorreo = (mensaje: string, repetido = false): RespuestaDelCodigo => ({ estado: "correo", repetido, mensaje });
const enCodigo = (
  enviado: boolean,
  mensaje: string | null,
  tono: "error" | "aviso" | "ok",
  espera: number | null,
  codigo?: "malo" | "vencido" | "bloqueado",
): RespuestaDelCodigo => ({ estado: "codigo", enviado, mensaje, tono, espera, ...(codigo ? { codigo } : {}) });

/**
 * «Obtener código», al lado del correo (y «Reenviar», con `reenvio`). Solo viaja el correo: el resto del formulario puede estar
 * vacío. El orden seguro (principio 9): (1) si este aparato ya confirmó ESE correo, no se manda otro; si había confirmado OTRO (la
 * persona cambió el correo), ese usuario se borra y el correo de antes queda libre; (2) la primera vez, la base cuenta la consulta
 * (sus topes por ip) y dice si el correo ya tiene cuenta; (3) la base reserva el envío (60 s entre uno y otro, 5 por hora, nada
 * mientras dure un bloqueo); (4) el proyecto de clientes manda el código. Ni la cuenta ni la ficha existen todavía.
 */
export async function obtenerCodigo(correoEscrito: unknown, reenvio: unknown): Promise<RespuestaDelCodigo> {
  if (typeof correoEscrito !== "string" || !correoValido(correoEscrito)) return enCorreo(MENSAJES.correoMal);
  const correo = normalizarCorreo(correoEscrito);
  const admin = clienteAdmin();
  if (!admin) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_sin_configurar", admin: false }));
    return enCodigo(false, MENSAJES.codigoNoEnviado, "error", null);
  }

  // 1. Lo que este aparato ya confirmó.
  const propia = await confirmacionDeEsteAparato(correo);
  if (propia && (await estaConfirmado(admin, propia.usuarioWebId)) === "si") return { estado: "confirmado" };
  if (!propia) await soltarCorreoAnterior(admin);

  // 2. La consulta: cuenta el intento por ip (así nadie manda códigos a correos ajenos sin tope) y dice si ya hay una cuenta con ese
  //    correo. «Reenviar» también la cuenta (Felipe 2026-10-15, D6): si no, una ip mandaba hasta 5 códigos por cada correo consultado.
  const h = await huellas();
  if (!h) return enCodigo(false, MENSAJES.codigoNoEnviado, "error", null);
  const consulta = await consultarCorreoEnBase(correo, h.ip);
  if (consulta === "repetido") return enCorreo(MENSAJES.correoRepetido, true);
  if (consulta === "limite") return enCorreo(MENSAJES.limite);
  if (consulta === "invalido") return enCorreo(MENSAJES.correoMal);
  if (consulta !== "libre") return enCodigo(false, MENSAJES.codigoNoEnviado, "error", null);

  // 3 y 4. El código.
  return mandarCodigo(admin, correo, reenvio === true);
}

/**
 * Si este aparato había confirmado OTRO correo (la persona lo cambió), ese usuario se borra, si no tiene cuenta: el correo de antes
 * queda libre en el acto (sin esperar sus 30 minutos) y su prueba se va. Es de este aparato: lo dice su prueba firmada.
 */
async function soltarCorreoAnterior(admin: SupabaseClient): Promise<void> {
  const anterior = await usuarioConfirmadoDeEsteAparato();
  if (!anterior) return;
  await borrarSiNoTieneCuenta(admin, anterior, { respetarRecientes: false });
  await borrarConfirmacion();
}

async function mandarCodigo(admin: SupabaseClient, correo: string, reenvio: boolean): Promise<RespuestaDelCodigo> {
  const reserva = await reservarEnvioEnBase(correo, reenvio);
  // Lo que nadie terminó (pendientes de otros correos que llevan un día quietos): sus usuarios invitados se van, sin esperar.
  const limpieza = reserva.limpiar.length ? limpiarInvitados(admin, reserva.limpiar) : Promise.resolve();

  let respuesta: RespuestaDelCodigo;
  switch (reserva.estado) {
    case "enviar": {
      const invitacion = await invitarCorreo(admin, correo);
      if (invitacion.estado === "tiene_cuenta") respuesta = enCorreo(MENSAJES.correoRepetido, true);
      // Otro aparato acaba de confirmar este correo y puede estar terminando su cuenta: no se le manda otro código por un rato.
      else if (invitacion.estado === "ocupado") respuesta = enCorreo(MENSAJES.correoOcupado);
      // Sin el usuario anotado, la base no dejaría crear la cuenta con ese código: mejor decirlo ahora.
      else if (invitacion.estado !== "invitado" || (await anotarInvitadoEnBase(correo, invitacion.usuarioWebId)) !== true)
        respuesta = enCodigo(false, MENSAJES.codigoNoEnviado, "error", null);
      else respuesta = enCodigo(true, reenvio ? MENSAJES.codigoNuevo : null, "ok", CODIGO_ESPERA_S);
      break;
    }
    case "esperar":
      // El último código sigue sirviendo: la caja aparece (o se queda) para escribirlo.
      respuesta = enCodigo(true, reenvio ? mensajeCodigoEsperar(reserva.segundos) : MENSAJES.codigoReciente, "aviso", reserva.segundos);
      break;
    case "limite":
      respuesta = enCodigo(true, mensajeCodigoLimite(reserva.minutos), "aviso", reserva.minutos * 60);
      break;
    case "bloqueado":
      respuesta = enCodigo(true, mensajeCodigoBloqueado(reserva.minutos), "error", reserva.minutos * 60, "bloqueado");
      break;
    case "correo_repetido":
      respuesta = enCorreo(MENSAJES.correoRepetido, true);
      break;
    case "invalido":
      respuesta = enCorreo(MENSAJES.correoMal);
      break;
    case "sin_codigo":
      // «Reenviar» de un correo sin código pedido en el último día: se pide de nuevo con «Obtener código».
      respuesta = enCorreo(MENSAJES.codigoSinPedir);
      break;
    default:
      respuesta = enCodigo(false, MENSAJES.codigoNoEnviado, "error", null);
  }
  await limpieza;
  return respuesta;
}

/**
 * La caja del código, apenas tiene sus 6 números. El orden seguro: (1) la base cuenta el intento ANTES de probarlo (5 por código;
 * con el quinto, 15 minutos de bloqueo); (2) el proyecto de clientes lo verifica (uno de otro correo no sirve; uno nuevo anula el
 * anterior) y (3) este aparato guarda la prueba firmada de que confirmó ESE correo (`lib/correo-confirmado.ts`). La cuenta todavía
 * no existe: nace con «Crear mi cuenta», que vuelve a exigir esa prueba.
 */
export async function confirmarCodigo(correoEscrito: unknown, codigoEscrito: unknown): Promise<RespuestaDelCodigo> {
  if (typeof correoEscrito !== "string" || !correoValido(correoEscrito)) return enCorreo(MENSAJES.correoMal);
  const correo = normalizarCorreo(correoEscrito);
  const codigo = typeof codigoEscrito === "string" ? codigoLimpio(codigoEscrito) : "";
  if (!codigoCompleto(codigo)) return enCodigo(true, MENSAJES.codigoIncompleto, "error", null);
  // Sin la llave de la prueba, un código bueno quedaría gastado sin dejar nada: se dice antes de probarlo.
  if (!hayLlaveDeConfirmacion()) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_sin_configurar", llave: false }));
    return enCodigo(true, MENSAJES.codigoNoProbado, "error", null);
  }

  // 1. ¿Se puede probar? (Cuenta el intento.)
  const intento = await intentoDeCodigoEnBase(correo);
  if (intento.estado === "bloqueado") return enCodigo(true, mensajeCodigoBloqueado(intento.minutos), "error", intento.minutos * 60, "bloqueado");
  if (intento.estado === "vencido") return enCodigo(true, MENSAJES.codigoVencido, "error", 0, "vencido");
  if (intento.estado === "sin_codigo") return enCorreo(MENSAJES.codigoSinPedir);
  if (intento.estado !== "puede") return enCodigo(true, MENSAJES.codigoNoProbado, "error", null);

  // 2. El código, en el proyecto de clientes.
  const verificado = await verificarCodigo(correo, codigo);
  if (verificado.estado === "codigo_malo") {
    // Con el quinto equivocado la base ya dejó el bloqueo: «Reenviar» espera esos minutos.
    return intento.quedan > 0
      ? enCodigo(true, mensajeCodigoMalo(intento.quedan), "error", null, "malo")
      : enCodigo(true, mensajeCodigoMalo(0), "error", CODIGO_BLOQUEO_MIN * 60, "bloqueado");
  }
  if (verificado.estado !== "confirmado") return enCodigo(true, MENSAJES.codigoNoProbado, "error", null);

  // 3. La prueba de este aparato.
  if (!(await guardarConfirmacion(correo, verificado.usuarioWebId))) return enCodigo(true, MENSAJES.codigoNoProbado, "error", null);
  return { estado: "confirmado" };
}

/* ------------------------------------------------------------------ Crear la cuenta */

/** Lo que dice «Crear mi cuenta» si no la crea (si la crea, lleva a «Mi cuenta»): el problema, en su campo. */
export type RespuestaCrear = { campo: CampoProblema | null; mensaje: string; casilla?: CasillaWhatsapp | null };

const sinCrear = (campo: CampoProblema | null, mensaje: string): RespuestaCrear => ({ campo, mensaje });

/**
 * «Crear mi cuenta», con el correo ya confirmado bajo el correo. El orden seguro (principio 9): (1) los datos, otra vez (nada de lo
 * que diga el navegador cuenta); (2) la prueba firmada de que ESTE aparato confirmó ESE correo con su código, y su usuario,
 * confirmado en el proyecto de clientes; (3) la base revisa el correo, el DNI y los topes (y cuenta el intento); (4) los avisos: el
 * texto que leyó sigue siendo el vigente; (5) el nombre del padrón, anotado en la base (sin él no hay ficha); (6) la contraseña que
 * eligió; (7) la cuenta en la base, todo o nada (exige el correo pendiente de ESE usuario con su código probado). Si algo dice que
 * no, la confirmación se queda: se arregla el dato y se vuelve a tocar «Crear mi cuenta», sin pedir otro código. (8) Entra y va a
 * «Mi cuenta».
 */
export async function crearCuenta(entrada: unknown): Promise<RespuestaCrear> {
  const leido = esquemaCrearCuenta.safeParse(entrada);
  if (!leido.success) return sinCrear(null, MENSAJES.noDisponible);
  const { registro: r, casilla } = leido.data;
  const problema = problemaRegistro(r, hoyLima());
  if (problema) return problema;

  const admin = clienteAdmin();
  const sesion = await clienteSesion();
  const documento = { tipo: r.documentoTipo, numero: r.documento };
  const h = await huellas(documento);
  if (!admin || !sesion || !h?.documento) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_sin_configurar", admin: !!admin, sesion: !!sesion, huellas: !!h }));
    return sinCrear(null, MENSAJES.noDisponible);
  }
  const correo = normalizarCorreo(r.correo);

  // 2. Sin el código no hay cuenta: la prueba de este aparato, para ESTE correo, y su usuario confirmado.
  const confirmacion = await confirmacionDeEsteAparato(correo);
  if (!confirmacion) return sinCrear("codigo", MENSAJES.codigoSinConfirmar);
  const usuarioWebId = confirmacion.usuarioWebId;
  const confirmado = await estaConfirmado(admin, usuarioWebId);
  if (confirmado === "sin_respuesta") return sinCrear(null, MENSAJES.noDisponible);
  if (confirmado === "no") {
    await borrarConfirmacion();
    return sinCrear("codigo", MENSAJES.codigoSinPedir);
  }

  // 3. La base revisa (y cuenta el intento).
  const revision = await revisarRegistroEnBase(correo, documento, celularNormalizado(r.celular), h.ip, h.documento);
  if (revision.estado !== "ok") {
    if (revision.estado === "limite") return sinCrear(null, MENSAJES.limite);
    if (revision.estado === "correo_repetido") return sinCrear("correo", MENSAJES.correoRepetido);
    // Un correo es de una sola persona: el de contacto de otra ficha no sirve para esta cuenta (sin decir de quién es).
    if (revision.estado === "correo_de_otra_persona") return sinCrear("correo", MENSAJES.correoDeOtraPersona);
    if (revision.estado === "dni_repetido") return sinCrear("documento", documentoRepetido(r.documentoTipo));
    if (revision.estado === "archivada") return sinCrear("documento", MENSAJES.dniArchivada);
    if (revision.estado === "invalido") return errorDeRegistro("cuenta_datos_invalidos", revision.campo, r.documentoTipo);
    return sinCrear(null, MENSAJES.noDisponible);
  }

  // 4. Los avisos citan el texto que leyó: si cambió, que lo vuelva a leer.
  if (r.avisos) {
    const vigente = await leerCasillaDeAvisos();
    if (!vigente || vigente.version !== casilla) return { campo: "avisos", mensaje: MENSAJES.avisosCambio, casilla: vigente };
  }

  // 5. El nombre. Con DNI, el del padrón, anotado en la base: sin esa lectura la ficha no lo acepta. Con carné o pasaporte, el
  //    escrito tal cual, con los nombres primero (la base vuelve a exigir que no lleve números).
  const nombre = await nombreParaLaCuenta(r.documentoTipo, r.documento, nombreEscrito(r));
  if (nombre.estado !== "ok") return sinCrear("documento", mensajeSinNombre(nombre.estado));

  // 6. La contraseña.
  if (!(await ponerClave(admin, usuarioWebId, r.clave))) return sinCrear(null, MENSAJES.noDisponible);

  // 7. La cuenta en la base.
  const datos: DatosCuenta = {
    usuarioWebId,
    correo,
    documentoTipo: r.documentoTipo,
    documento: r.documento,
    nombre: nombre.nombre,
    nombreDelPadron: r.documentoTipo === "dni",
    celular: celularNormalizado(r.celular),
    cumpleDia: Number(r.cumple.d),
    cumpleMes: Number(r.cumple.m),
    cumpleAnio: r.cumple.a ? Number(r.cumple.a) : null,
    mayorDeEdad: r.mayor,
    avisosWhatsapp: r.avisos,
    casillaVersion: r.avisos ? casilla : null,
    textos: TEXTOS_VERSION,
  };
  let registro = await registrarCuentaEnBase(datos);
  // Otro aparato pidió un código para este correo mientras esta persona llenaba lo demás: ese pedido dejó el pendiente sin su código
  // probado (no le llegó ningún código: el correo estaba confirmado aquí). Este aparato ya lo había confirmado (su prueba firmada y
  // su usuario confirmado): se vuelve a anotar el intento y se crea, una sola vez.
  if (!registro.ok && registro.hint === "cuenta_sin_codigo" && (await intentoDeCodigoEnBase(correo)).estado === "puede") {
    registro = await registrarCuentaEnBase(datos);
  }
  // Un doble envío: la cuenta de este mismo usuario ya quedó creada con el primero. Se entra.
  const yaEstaba = !registro.ok && registro.hint === "cuenta_ya_existe";
  if (!registro.ok && !yaEstaba) {
    const e = errorDeRegistro(registro.hint, registro.detalle, r.documentoTipo);
    if (e.campo === "codigo") {
      // Sin el pendiente de este usuario, su confirmación ya no sirve: el usuario se va (el correo queda libre) y se pide otro código.
      await borrarSiNoTieneCuenta(admin, usuarioWebId, { respetarRecientes: false });
      await borrarConfirmacion();
    }
    if (e.campo === "avisos") return { ...e, casilla: await leerCasillaDeAvisos() };
    return e;
  }
  const aviso = registro.ok ? avisoAlCrear(registro.seUnioASuFicha, registro.avisos) : "bienvenida";
  await borrarConfirmacion();

  // 8. Entrar. Si el proyecto de clientes no contesta justo ahora, la cuenta igual quedó: que entre con su correo.
  const { error } = await sesion.auth.signInWithPassword({ email: correo, password: r.clave });
  if (error) redirect("/entrar?aviso=cuenta-creada");
  // Crear la cuenta también es entrar (la conservación del Club ya la cuenta por `creada_en`): se anota y se deja la marca del día,
  // así el marco de «Mi cuenta» no vuelve a preguntar hoy.
  if ((await anotarEntradaEnBase(usuarioWebId)) === "anotada") await marcarEntradaDeHoy(usuarioWebId);
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
 * El nombre que va a la cuenta. Con DNI, SOLO el del padrón, consultado aquí (lo que diga el navegador no cuenta; Felipe 2026-10-15:
 * sin la API no se registra), con los nombres primero; justo antes de crear la cuenta deja la lectura en la base
 * (`tienda_anotar_lectura_padron`), que es lo que la ficha exige para aceptar el nombre; si no se pudo anotar, se lee como que el
 * padrón no respondió (se vuelve a intentar). Con carné o pasaporte, el escrito (`problemaRegistro` ya lo revisó).
 */
async function nombreParaLaCuenta(
  tipo: TipoDocumentoClienta,
  numero: string,
  escrito: string,
): Promise<{ estado: "ok"; nombre: string } | { estado: "no_encontrado" | "sin_padron" }> {
  if (tipo !== "dni") return { estado: "ok", nombre: escrito };
  const padron = await buscarNombre(numero);
  if (padron.estado !== "encontrado") return { estado: padron.estado };
  if (!(await anotarLecturaDelPadron(numero, padron.nombre))) return { estado: "sin_padron" };
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
