"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CLAVE_MAXIMA, codigoCompleto, codigoLimpio, correoValido, estadoClave, MENSAJES, mensajeCodigoMalo, normalizarCorreo } from "@/lib/cuentas";
import { COOKIE_ENTRADA, ENTRADA_DURA_S, marcaDeEntrada } from "@/lib/entrada";
import { anotarEntradaEnBase } from "@/lib/entrada-servidor";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { huellas } from "@/lib/intentos-servidor";
import { mensajeClaveBloqueada, mensajeDelTope, TEXTOS_CUENTA, type LoQueFrena, type TopeDeEnvio } from "@/lib/mi-cuenta";
import {
  claveCorrectaEnBase,
  correoConfirmadoEnBase,
  devolverElCorreo,
  eliminarMiCuentaEnBase,
  intentoDeClaveEnBase,
  intentoDelCambioEnBase,
  origenDeLaPeticion,
  pedirCambioDeCorreoEnBase,
  pedirCodigoAlCorreoNuevo,
  ponerClaveNueva,
  probarClave,
  restablecerIntentoEnBase,
  restablecerReenviarEnBase,
  verificarCodigoDelCorreo,
} from "@/lib/mi-cuenta-servidor";
import { borrarCookiesDeSesion, clienteAdmin, clienteSesion, clienteSuelto, leerSesion } from "@/lib/sesion-servidor";
import { borrarUsuarioDeCuentaCerrada } from "@/lib/usuarios-servidor";

// Las acciones de «Mi cuenta» (Felipe 2026-10-15): cambiar el correo con que se entra, restablecer el acceso que se pidió en una tienda y
// eliminar la cuenta. No confían en nada de lo que llega: lo vuelven a revisar, la base decide (topes, qué correo, cuándo se aplica) y el
// proyecto de inicio de sesión de los clientes verifica el código (`lib/mi-cuenta-servidor.ts`). La forma es la de «Crear cuenta»: el
// correo con «Obtener código» al lado y, debajo, la caja del código con «Reenviar» y «✓ Correo confirmado». En los registros nunca va un
// correo, un código ni una contraseña.

/** Lo que contesta «Obtener código» o «Reenviar»: el código salió (y cuánto falta para pedir otro), o por qué no, y en qué campo. */
export type RespuestaObtener =
  | { ok: true; mensaje: string | null; tono: "ok" | "aviso"; espera: number }
  | { ok: false; campo: "correo" | "clave" | null; mensaje: string; espera?: number | null };

/** Lo que contesta el código: listo (el correo quedó confirmado; `destino`: a dónde sigue), o por qué no. `codigo`: `malo` se escribe
 *  otra vez; `vencido` y `bloqueado` piden uno nuevo. */
export type RespuestaConfirmar =
  | { ok: true; correo: string; destino?: string }
  | { ok: false; campo: "correo" | "codigo" | "clave" | null; mensaje: string; codigo?: "malo" | "vencido" | "bloqueado"; espera?: number | null };

/** «No pudimos hacerlo ahora» (la base o el proyecto de clientes no contestaron), bajo el campo que corresponde o sin campo. */
function noDisponible(): { ok: false; campo: null; mensaje: string };
function noDisponible<C extends "correo" | "codigo" | "clave">(campo: C): { ok: false; campo: C; mensaje: string };
function noDisponible(campo: "correo" | "codigo" | "clave" | null = null): { ok: false; campo: "correo" | "codigo" | "clave" | null; mensaje: string } {
  return { ok: false, campo, mensaje: TEXTOS_CUENTA.noDisponible };
}

const origen = async () => origenDeLaPeticion(await headers());

function respuestaDelTope(t: TopeDeEnvio, campo: "correo" | null = null): RespuestaObtener {
  return { ok: false, campo, mensaje: mensajeDelTope(t), espera: t.estado === "esperar" ? t.segundos : t.minutos * 60 };
}

/**
 * La contraseña que ya tiene, antes de cambiar el correo o eliminar la cuenta: la base cuenta el intento ANTES (5 cada 15 minutos), el
 * proyecto la prueba, y una buena borra los intentos. null si está bien; si no, el mensaje para su campo.
 */
async function revisarClave(usuarioWebId: string, correo: string, clave: string): Promise<string | null> {
  const intento = await intentoDeClaveEnBase(usuarioWebId);
  if (intento.estado === "bloqueado") return mensajeClaveBloqueada(intento.minutos);
  if (intento.estado !== "puede") return TEXTOS_CUENTA.noDisponible;
  const prueba = await probarClave(correo, clave);
  if (prueba === "mala") return intento.quedan > 0 ? TEXTOS_CUENTA.claveMala : mensajeClaveBloqueada(15);
  if (prueba !== "buena") return TEXTOS_CUENTA.noDisponible;
  await claveCorrectaEnBase(usuarioWebId);
  return null;
}

/** Con su sesión y su cuenta; si no hay sesión, a «Entrar». `sin_respuesta`: no se sabe, no se hace nada. */
async function laCuenta(): Promise<{ usuarioWebId: string; correo: string } | null> {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  if (sesion.estado !== "con_sesion") return null;
  const lectura = await leerMiCuentaEnBase(sesion.usuarioId);
  if (lectura.estado === "sin_cuenta") redirect("/cuenta");
  if (lectura.estado !== "cuenta") return null;
  return { usuarioWebId: sesion.usuarioId, correo: normalizarCorreo(lectura.cuenta.correo) };
}

/* ------------------------------------------------------------------ Cambiar mi correo */

const esquemaPedir = z.object({ correo: z.string().max(400), clave: z.string().max(400) });

/**
 * «Obtener código» en «Cambiar mi correo»: (1) su contraseña; (2) la base revisa el correo nuevo (ni el de ahora, ni el de otra persona)
 * y los topes; (3) el proyecto le manda el código SOLO a ese correo (con su sesión). Hasta escribir el código, nada cambia.
 */
export async function pedirCodigoCorreoNuevo(entrada: unknown): Promise<RespuestaObtener> {
  const leido = esquemaPedir.safeParse(entrada);
  if (!leido.success) return noDisponible();
  const { clave } = leido.data;
  if (!correoValido(leido.data.correo)) return { ok: false, campo: "correo", mensaje: MENSAJES.correoMal };
  if (!clave || clave.length > CLAVE_MAXIMA) return { ok: false, campo: "clave", mensaje: TEXTOS_CUENTA.claveActualAyuda };
  const nuevo = normalizarCorreo(leido.data.correo);

  const cuenta = await laCuenta();
  if (!cuenta) return noDisponible();
  if (nuevo === cuenta.correo) return { ok: false, campo: "correo", mensaje: TEXTOS_CUENTA.mismoCorreo };

  const problemaClave = await revisarClave(cuenta.usuarioWebId, cuenta.correo, clave);
  if (problemaClave) return { ok: false, campo: "clave", mensaje: problemaClave };

  const pedido = await pedirCambioDeCorreoEnBase(cuenta.usuarioWebId, nuevo);
  switch (pedido.estado) {
    case "enviar": {
      const sesion = await clienteSesion();
      if (!sesion) return noDisponible();
      const envio = await pedirCodigoAlCorreoNuevo({ sesion }, nuevo, `${await origen()}/cuenta/correo`);
      if (envio === "correo_tomado") return { ok: false, campo: "correo", mensaje: MENSAJES.correoDeOtraPersona };
      if (envio !== "enviado") return { ok: false, campo: null, mensaje: TEXTOS_CUENTA.codigoNoEnviado };
      return { ok: true, mensaje: null, tono: "ok", espera: 60 };
    }
    case "esperar":
    case "limite":
    case "bloqueado":
      return respuestaDelTope(pedido);
    case "mismo_correo":
      return { ok: false, campo: "correo", mensaje: TEXTOS_CUENTA.mismoCorreo };
    case "correo_de_otra_persona":
      return { ok: false, campo: "correo", mensaje: MENSAJES.correoDeOtraPersona };
    case "invalido":
      return { ok: false, campo: "correo", mensaje: MENSAJES.correoMal };
    default:
      return noDisponible();
  }
}

/** «Reenviar» en «Cambiar mi correo»: solo para el correo que ya pidió (la base lo exige: su contraseña ya se probó al pedirlo). */
export async function reenviarCodigoCorreoNuevo(correo: unknown): Promise<RespuestaObtener> {
  if (typeof correo !== "string" || !correoValido(correo)) return { ok: false, campo: "correo", mensaje: MENSAJES.correoMal };
  const nuevo = normalizarCorreo(correo);
  const cuenta = await laCuenta();
  if (!cuenta) return noDisponible();
  const pedido = await pedirCambioDeCorreoEnBase(cuenta.usuarioWebId, nuevo, true);
  if (pedido.estado === "enviar") {
    // Se vuelve a PEDIR el cambio con su sesión (el proyecto manda un código nuevo y el anterior deja de servir). Un «reenvío» del proyecto
    // busca la cuenta por su correo de ANTES y, con el nuevo, no mandaba nada sin decir nada (/chaos, 2026-10-15).
    const sesion = await clienteSesion();
    if (!sesion) return noDisponible();
    const envio = await pedirCodigoAlCorreoNuevo({ sesion }, nuevo, `${await origen()}/cuenta/correo`);
    if (envio === "correo_tomado") return { ok: false, campo: "correo", mensaje: MENSAJES.correoDeOtraPersona };
    return envio === "enviado" ? { ok: true, mensaje: MENSAJES.codigoNuevo, tono: "ok", espera: 60 } : { ok: false, campo: null, mensaje: TEXTOS_CUENTA.codigoNoEnviado };
  }
  if (pedido.estado === "esperar" || pedido.estado === "limite" || pedido.estado === "bloqueado") return respuestaDelTope(pedido);
  if (pedido.estado === "sin_pedido") return { ok: false, campo: "correo", mensaje: TEXTOS_CUENTA.codigoSinPedir };
  if (pedido.estado === "correo_de_otra_persona") return { ok: false, campo: "correo", mensaje: MENSAJES.correoDeOtraPersona };
  return noDisponible();
}

const esquemaCodigo = z.object({ correo: z.string().max(400), codigo: z.string().max(40) });

/**
 * El código, en «Cambiar mi correo»: la base cuenta el intento (5 por código) → el proyecto lo verifica con su sesión (el correo de
 * entrada cambia ahí y avisa al anterior) → la base aplica el correo que el proyecto dice que quedó. Si la base dice que no (otra persona
 * lo tomó en el medio), el correo vuelve al de antes en el proyecto. Dos pestañas con el mismo código: la segunda ve que ya quedó.
 */
export async function confirmarCorreoNuevo(entrada: unknown): Promise<RespuestaConfirmar> {
  const leido = esquemaCodigo.safeParse(entrada);
  if (!leido.success || !correoValido(leido.data.correo)) return noDisponible();
  const nuevo = normalizarCorreo(leido.data.correo);
  const codigo = codigoLimpio(leido.data.codigo);
  if (!codigoCompleto(codigo)) return { ok: false, campo: "codigo", mensaje: "Escribe los 6 números del código." };

  const cuenta = await laCuenta();
  if (!cuenta) return noDisponible("codigo");
  if (cuenta.correo === nuevo) return { ok: true, correo: nuevo };

  const intento = await intentoDelCambioEnBase(cuenta.usuarioWebId, nuevo);
  if (intento.estado === "bloqueado") return { ok: false, campo: "codigo", mensaje: mensajeDelTope(intento), codigo: "bloqueado", espera: intento.minutos * 60 };
  if (intento.estado === "vencido") return { ok: false, campo: "codigo", mensaje: MENSAJES.codigoVencido, codigo: "vencido", espera: 0 };
  if (intento.estado === "sin_pedido") return { ok: false, campo: "codigo", mensaje: TEXTOS_CUENTA.codigoSinPedir, codigo: "vencido", espera: 0 };
  if (intento.estado !== "puede") return noDisponible("codigo");

  const sesion = await clienteSesion();
  if (!sesion) return noDisponible("codigo");
  const verificado = await verificarCodigoDelCorreo(sesion, nuevo, codigo);
  if (verificado.estado === "codigo_malo") {
    // Otra pestaña ya lo confirmó con este mismo código: quedó.
    const ahora = await leerMiCuentaEnBase(cuenta.usuarioWebId);
    if (ahora.estado === "cuenta" && normalizarCorreo(ahora.cuenta.correo) === nuevo) return { ok: true, correo: nuevo };
    return intento.quedan > 0
      ? { ok: false, campo: "codigo", mensaje: mensajeCodigoMalo(intento.quedan), codigo: "malo" }
      : { ok: false, campo: "codigo", mensaje: mensajeCodigoMalo(0), codigo: "bloqueado", espera: 15 * 60 };
  }
  if (verificado.estado !== "confirmado") return noDisponible("codigo");

  const aplicado = await correoConfirmadoEnBase(verificado.usuarioWebId, verificado.correo);
  if (aplicado.estado === "aplicado" || aplicado.estado === "igual") return { ok: true, correo: verificado.correo };
  if (aplicado.estado === "sin_respuesta") {
    // El proyecto ya lo cambió y la base no contestó: «Mi cuenta» lo pone al día la próxima vez que la abra (lo concilia).
    console.error(JSON.stringify({ evento: "tienda_correo_confirmado_sin_base", usuario_web_id: verificado.usuarioWebId }));
    return { ok: true, correo: verificado.correo };
  }
  // Nadie lo había pedido u otra persona lo tomó en el medio: el correo vuelve al de antes en el proyecto.
  if ("correoActual" in aplicado && aplicado.correoActual) await devolverElCorreo(verificado.usuarioWebId, aplicado.correoActual);
  return aplicado.estado === "de_otra_persona"
    ? { ok: false, campo: "correo", mensaje: TEXTOS_CUENTA.correoTomado }
    : noDisponible("codigo");
}

/* ------------------------------------------------------------------ Restablecer mi acceso (lo pidió en una tienda) */

/**
 * «Obtener código» en «Restablecer mi acceso» (sin sesión): si en una tienda se pidió restablecer el acceso con ese correo, le llega un
 * código nuevo. Dice LO MISMO exista o no ese pedido: así nadie averigua desde aquí a quién se le restableció el acceso.
 */
export async function pedirCodigoDeAcceso(correo: unknown): Promise<RespuestaObtener> {
  if (typeof correo !== "string" || !correoValido(correo)) return { ok: false, campo: "correo", mensaje: MENSAJES.correoMal };
  const nuevo = normalizarCorreo(correo);
  const h = await huellas();
  if (!h) return noDisponible();
  const envio = await restablecerReenviarEnBase(nuevo, h.ip);
  if (envio.estado === "enviar") {
    // Se vuelve a PEDIR el cambio en el proyecto de clientes (con una sesión de un solo uso), no solo a reenviarlo: si el primer envío
    // nunca salió (la tienda no le contestó al ERP), allá no hay ningún cambio pendiente y un reenvío no mandaría nada (/chaos, 2026-10-15).
    const r = envio.correoActual
      ? await pedirCodigoAlCorreoNuevo({ correoActual: envio.correoActual }, nuevo, `${await origen()}/restablecer-acceso`)
      : "no_disponible";
    if (r !== "enviado") return { ok: false, campo: null, mensaje: TEXTOS_CUENTA.codigoNoEnviado };
    return { ok: true, mensaje: TEXTOS_CUENTA.restablecerReenvio, tono: "ok", espera: 60 };
  }
  if (envio.estado === "sin_pedido") return { ok: true, mensaje: TEXTOS_CUENTA.restablecerReenvio, tono: "ok", espera: 60 };
  if (envio.estado === "esperar" || envio.estado === "limite" || envio.estado === "bloqueado") return respuestaDelTope(envio);
  if (envio.estado === "muchos_intentos") return { ok: false, campo: null, mensaje: MENSAJES.limite };
  if (envio.estado === "invalido") return { ok: false, campo: "correo", mensaje: MENSAJES.correoMal };
  return noDisponible();
}

const esquemaRestablecer = z.object({ correo: z.string().max(400), codigo: z.string().max(40), clave: z.string().max(400) });

/**
 * «Guardar y entrar» en «Restablecer mi acceso»: todo en un paso, para que nunca quede una puerta de «poner contraseña sin la de antes»:
 * (1) la base cuenta el intento del código (solo restablecimientos pedidos EN TIENDA) → (2) el proyecto verifica el código (el correo de
 * entrada cambia ahí y avisa al anterior) y debe ser el de ESA cuenta → (3) la contraseña nueva (cierra toda sesión de antes) → (4) la
 * base aplica el correo → (5) entra con el correo y la contraseña nuevos y va a «Mi cuenta».
 */
export async function restablecerAcceso(entrada: unknown): Promise<RespuestaConfirmar> {
  const leido = esquemaRestablecer.safeParse(entrada);
  if (!leido.success) return noDisponible();
  if (!correoValido(leido.data.correo)) return { ok: false, campo: "correo", mensaje: MENSAJES.correoMal };
  const nuevo = normalizarCorreo(leido.data.correo);
  const codigo = codigoLimpio(leido.data.codigo);
  if (!codigoCompleto(codigo)) return { ok: false, campo: "codigo", mensaje: "Escribe los 6 números del código." };
  const clave = leido.data.clave;
  if (estadoClave(clave) !== "ok") return { ok: false, campo: "clave", mensaje: clave.length > CLAVE_MAXIMA ? MENSAJES.claveLarga : MENSAJES.claveAyuda };

  const h = await huellas();
  if (!h) return noDisponible();
  const intento = await restablecerIntentoEnBase(nuevo, h.ip);
  if (intento.estado === "bloqueado") return { ok: false, campo: "codigo", mensaje: mensajeDelTope(intento), codigo: "bloqueado", espera: intento.minutos * 60 };
  if (intento.estado === "vencido") return { ok: false, campo: "codigo", mensaje: MENSAJES.codigoVencido, codigo: "vencido", espera: 0 };
  if (intento.estado === "sin_pedido") return { ok: false, campo: "codigo", mensaje: TEXTOS_CUENTA.restablecerNoHay, codigo: "malo" };
  if (intento.estado === "muchos_intentos") return { ok: false, campo: null, mensaje: MENSAJES.limite };
  if (intento.estado !== "puede" || !intento.usuarioWebId) return noDisponible("codigo");

  const suelto = clienteSuelto();
  if (!suelto) return noDisponible("codigo");
  const verificado = await verificarCodigoDelCorreo(suelto, nuevo, codigo);
  await suelto.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (verificado.estado === "codigo_malo") {
    return intento.quedan > 0
      ? { ok: false, campo: "codigo", mensaje: mensajeCodigoMalo(intento.quedan), codigo: "malo" }
      : { ok: false, campo: "codigo", mensaje: mensajeCodigoMalo(0), codigo: "bloqueado", espera: 15 * 60 };
  }
  if (verificado.estado !== "confirmado") return noDisponible("codigo");
  if (verificado.usuarioWebId !== intento.usuarioWebId) {
    // El proyecto cambió el correo de OTRO usuario que el del pedido: no debería pasar nunca. No se pone ninguna contraseña.
    console.error(JSON.stringify({ evento: "tienda_restablecer_usuario_distinto" }));
    return noDisponible("codigo");
  }

  // Primero la base: si no acepta el correo (otra persona lo tomó en el medio), vuelve el de antes y la contraseña no se toca.
  const aplicado = await correoConfirmadoEnBase(verificado.usuarioWebId, verificado.correo);
  if (aplicado.estado === "de_otra_persona" || aplicado.estado === "sin_pedido" || aplicado.estado === "invalido") {
    if (aplicado.correoActual) await devolverElCorreo(verificado.usuarioWebId, aplicado.correoActual);
    return aplicado.estado === "de_otra_persona" ? { ok: false, campo: "correo", mensaje: TEXTOS_CUENTA.correoTomado } : noDisponible("codigo");
  }
  if (aplicado.estado === "sin_cuenta") return noDisponible("codigo");
  // `sin_respuesta`: el proyecto ya cambió el correo; «Mi cuenta» lo concilia con la base después. La contraseña se pone igual.
  const puesta = await ponerClaveNueva(verificado.usuarioWebId, clave);
  if (puesta === "debil") return { ok: false, campo: "clave", mensaje: MENSAJES.claveAyuda };
  if (puesta !== "lista") {
    // El correo ya quedó confirmado, pero la contraseña no: con «Olvidé mi contraseña», el enlace llega ya a su correo nuevo.
    return { ok: true, correo: verificado.correo, destino: "/olvide-mi-contrasena?aviso=acceso-sin-clave" };
  }

  const sesion = await clienteSesion();
  const entro = sesion ? !(await sesion.auth.signInWithPassword({ email: verificado.correo, password: clave })).error : false;
  if (!entro) return { ok: true, correo: verificado.correo, destino: "/entrar?aviso=acceso-restablecido-entra" };
  if ((await anotarEntradaEnBase(verificado.usuarioWebId)) === "anotada") {
    (await cookies()).set(COOKIE_ENTRADA, marcaDeEntrada(verificado.usuarioWebId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ENTRADA_DURA_S,
    });
  }
  return { ok: true, correo: verificado.correo, destino: "/cuenta?aviso=acceso-restablecido" };
}

/* ------------------------------------------------------------------ Eliminar mi cuenta */

export type RespuestaEliminar = { mensaje: string; campo: "clave" | null } | { frena: LoQueFrena };

/**
 * «Eliminar mi cuenta»: (1) su contraseña; (2) la base elimina —si no tiene un pedido web en curso ni un apartado abierto— con la
 * anonimización de siempre, a pedido suyo: sus datos de la ficha se borran, deja el Club y su cuenta se cierra en la misma escritura;
 * (3) su usuario se borra del proyecto de clientes (si no contesta, lo hace la ruta de la madrugada); (4) se cierra su sesión y va a la
 * portada. Dos toques o dos pestañas: la segunda encuentra la cuenta ya cerrada y termina igual.
 */
export async function eliminarMiCuenta(entrada: unknown): Promise<RespuestaEliminar> {
  const leido = z.object({ clave: z.string().max(400) }).safeParse(entrada);
  if (!leido.success || !leido.data.clave) return { mensaje: TEXTOS_CUENTA.claveActualAyuda, campo: "clave" };
  const sesionLeida = await leerSesion();
  if (sesionLeida.estado === "sin_sesion") redirect("/entrar");
  if (sesionLeida.estado !== "con_sesion") return { mensaje: TEXTOS_CUENTA.noDisponible, campo: null };
  const usuarioWebId = sesionLeida.usuarioId;

  const lectura = await leerMiCuentaEnBase(usuarioWebId);
  if (lectura.estado === "sin_respuesta") return { mensaje: TEXTOS_CUENTA.noDisponible, campo: null };
  if (lectura.estado === "cuenta") {
    const problemaClave = await revisarClave(usuarioWebId, normalizarCorreo(lectura.cuenta.correo), leido.data.clave);
    if (problemaClave) return { mensaje: problemaClave, campo: "clave" };
    const r = await eliminarMiCuentaEnBase(usuarioWebId);
    if (r.estado === "en_curso") return { frena: r.frena };
    if (r.estado === "en_tienda") return { mensaje: TEXTOS_CUENTA.eliminarEnTienda, campo: null };
    if (r.estado === "sin_respuesta") return { mensaje: TEXTOS_CUENTA.noDisponible, campo: null };
    // eliminada, o sin_cuenta: otra pestaña la eliminó en este instante. En los dos casos, lo que sigue.
  }
  // sin_cuenta: ya no hay cuenta para este usuario (otra pestaña, o la tienda la anonimizó). Se termina igual.

  const admin = clienteAdmin();
  if (admin) await borrarUsuarioDeCuentaCerrada(admin, usuarioWebId);
  const sesion = await clienteSesion();
  if (sesion) await sesion.auth.signOut({ scope: "local" }).catch(() => undefined);
  await borrarCookiesDeSesion();
  (await cookies()).delete(COOKIE_ENTRADA);
  redirect("/?aviso=cuenta-eliminada");
}
