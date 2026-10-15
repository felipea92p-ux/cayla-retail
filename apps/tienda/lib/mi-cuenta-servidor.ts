import "server-only";
import { isAuthApiError, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { leerConRespaldo } from "./base";
import {
  correoPorConciliar,
  leerCorreoConfirmado,
  leerEliminacion,
  leerEnvioDelRestablecer,
  leerIntentoDeClave,
  leerIntentoDelCodigo,
  leerLoQueFrena,
  leerPedidoDeCambio,
  type CorreoConfirmado,
  type Eliminacion,
  type EnvioDelRestablecer,
  type IntentoDeClave,
  type IntentoDelCodigo,
  type LoQueFrena,
  type PedidoDeCambio,
} from "./mi-cuenta";
import { normalizarCorreo } from "./cuentas";
import { clienteAdmin, clienteSuelto } from "./sesion-servidor";

// «Mi cuenta» en la base del ERP y en el proyecto de inicio de sesión de los clientes (Felipe 2026-10-15, `20261015132000`).
//
// LA BASE lleva los topes y decide qué correo se puede pedir y cuándo se aplica, solo por sus funciones `retail.tienda_*`. Cada lectura
// dice `sin_respuesta` si la base no contesta: entonces no se manda ni se prueba ningún código, y no se borra nada (principio 9).
//
// EL PROYECTO DE CLIENTES genera, manda y verifica el código: su «cambio de correo» lo manda SOLO al correo nuevo (con «Confirm email»
// encendido y «Secure email change» apagado; medido en local el 2026-10-15) y, al confirmarse, avisa al correo anterior. Si la persona
// no tiene sesión (restablecer en tienda), este servidor abre una sesión de un solo uso con su llave secreta para pedir el cambio, y la
// cierra enseguida. En los registros nunca va un correo, un código ni una contraseña: solo qué pasó.

/**
 * La dirección pública de la tienda en esta petición: el enlace del correo del código lleva a la página donde se escribe. En el proyecto
 * de clientes, esa página tiene que estar entre las direcciones permitidas (si no, el enlace cae en `site_url`).
 */
export function origenDeLaPeticion(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/* ------------------------------------------------------------------ La base */

/** `reenvio`: «Reenviar» del correo que ya pidió (la base exige que sea ese y no cuenta otra vez su contraseña). */
export const pedirCambioDeCorreoEnBase = (usuarioWebId: string, correo: string, reenvio = false): Promise<PedidoDeCambio> =>
  leerConRespaldo<PedidoDeCambio>(
    "tienda_pedir_cambio_correo_fallo",
    async (db) =>
      leerPedidoDeCambio((await db`select retail.tienda_pedir_cambio_correo(${usuarioWebId}::uuid, ${correo}::text, ${reenvio}::boolean) as r`)[0]?.r),
    { estado: "sin_respuesta" },
  );

export const intentoDelCambioEnBase = (usuarioWebId: string, correo: string): Promise<IntentoDelCodigo> =>
  leerConRespaldo<IntentoDelCodigo>(
    "tienda_intento_cambio_correo_fallo",
    async (db) => leerIntentoDelCodigo((await db`select retail.tienda_intento_cambio_correo(${usuarioWebId}::uuid, ${correo}::text) as r`)[0]?.r),
    { estado: "sin_respuesta" },
  );

/** El correo que el PROYECTO dice que quedó (nunca lo que escribió la persona): la base lo aplica solo si se pidió. */
export const correoConfirmadoEnBase = (usuarioWebId: string, correo: string): Promise<CorreoConfirmado> =>
  leerConRespaldo<CorreoConfirmado>(
    "tienda_correo_confirmado_fallo",
    async (db) => leerCorreoConfirmado((await db`select retail.tienda_correo_confirmado(${usuarioWebId}::uuid, ${correo}::text) as r`)[0]?.r),
    { estado: "sin_respuesta" },
  );

export const restablecerEnviarEnBase = (ficha: string): Promise<EnvioDelRestablecer> =>
  leerConRespaldo<EnvioDelRestablecer>(
    "tienda_restablecer_enviar_fallo",
    async (db) => leerEnvioDelRestablecer((await db`select retail.tienda_restablecer_enviar(${ficha}::text) as r`)[0]?.r),
    { estado: "sin_respuesta" },
  );

export const restablecerReenviarEnBase = (correo: string, ipHash: string): Promise<EnvioDelRestablecer> =>
  leerConRespaldo<EnvioDelRestablecer>(
    "tienda_restablecer_reenviar_fallo",
    async (db) => leerEnvioDelRestablecer((await db`select retail.tienda_restablecer_reenviar(${correo}::text, ${ipHash}::text) as r`)[0]?.r),
    { estado: "sin_respuesta" },
  );

export const restablecerIntentoEnBase = (correo: string, ipHash: string): Promise<IntentoDelCodigo> =>
  leerConRespaldo<IntentoDelCodigo>(
    "tienda_restablecer_intento_fallo",
    async (db) => leerIntentoDelCodigo((await db`select retail.tienda_restablecer_intento(${correo}::text, ${ipHash}::text) as r`)[0]?.r),
    { estado: "sin_respuesta" },
  );

export const intentoDeClaveEnBase = (usuarioWebId: string): Promise<IntentoDeClave> =>
  leerConRespaldo<IntentoDeClave>(
    "tienda_intento_de_clave_fallo",
    async (db) => leerIntentoDeClave((await db`select retail.tienda_intento_de_clave(${usuarioWebId}::uuid) as r`)[0]?.r),
    { estado: "sin_respuesta" },
  );

/** La contraseña era la buena: sus intentos se borran. Si la base no contesta, no pasa nada (se borran con la próxima buena). */
export const claveCorrectaEnBase = (usuarioWebId: string): Promise<boolean | null> =>
  leerConRespaldo<boolean | null>(
    "tienda_clave_correcta_fallo",
    async (db) => (await db`select retail.tienda_clave_correcta(${usuarioWebId}::uuid) as r`)[0]?.r === true,
    null,
  );

/**
 * «Mi cuenta» concilia el correo: si el proyecto de clientes dice otro correo de entrada para esta sesión que el de la base (un código que
 * se confirmó y la base no llegó a anotar), la base lo aplica si ese cambio se había pedido. Devuelve el correo que queda en la base.
 */
export async function conciliarCorreo(usuarioWebId: string, deLaSesion: string | null, deLaBase: string): Promise<string> {
  const otro = correoPorConciliar(deLaSesion, deLaBase);
  if (!otro) return deLaBase;
  const r = await correoConfirmadoEnBase(usuarioWebId, otro);
  if (r.estado === "aplicado" || r.estado === "igual") return otro;
  // Nadie lo pidió (o lo tomó otra persona): no se toca nada aquí; queda anotado para revisarlo.
  console.error(JSON.stringify({ evento: "tienda_correo_distinto_sin_pedido", estado: r.estado }));
  return deLaBase;
}

export type LecturaAntesDeEliminar = { estado: "ok"; frena: LoQueFrena } | { estado: "sin_cuenta" | "sin_respuesta" };

/** Lo que frena «Eliminar cuenta» (no escribe nada). */
export const antesDeEliminarEnBase = (usuarioWebId: string): Promise<LecturaAntesDeEliminar> =>
  leerConRespaldo<LecturaAntesDeEliminar>(
    "tienda_antes_de_eliminar_fallo",
    async (db) => {
      const r = (await db`select retail.tienda_antes_de_eliminar(${usuarioWebId}::uuid) as r`)[0]?.r;
      if (r === null || r === undefined) return { estado: "sin_cuenta" };
      const frena = leerLoQueFrena(r);
      return frena ? { estado: "ok", frena } : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

export const eliminarMiCuentaEnBase = (usuarioWebId: string): Promise<Eliminacion> =>
  leerConRespaldo<Eliminacion>(
    "tienda_eliminar_mi_cuenta_fallo",
    async (db) => leerEliminacion((await db`select retail.tienda_eliminar_mi_cuenta(${usuarioWebId}::uuid) as r`)[0]?.r),
    { estado: "sin_respuesta" },
  );

/* ------------------------------------------------------------------ El proyecto de clientes */

/**
 * ¿Es su contraseña? Se prueba entrando con un cliente suelto (sin cookies), y esa sesión se cierra enseguida. `no_disponible`: el
 * proyecto no contestó (no es culpa de ella; no cuenta como equivocada).
 */
export async function probarClave(correo: string, clave: string): Promise<"buena" | "mala" | "no_disponible"> {
  const suelto = clienteSuelto();
  if (!suelto) return "no_disponible";
  const { data, error } = await suelto.auth.signInWithPassword({ email: normalizarCorreo(correo), password: clave });
  if (data.session) await suelto.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (!error) return "buena";
  if (isAuthApiError(error) && error.code === "invalid_credentials") return "mala";
  if (!isAuthRetryableFetchError(error)) console.error(JSON.stringify({ evento: "tienda_probar_clave_fallo", codigo: error.code ?? null, estado: error.status ?? null }));
  return "no_disponible";
}

export type EnvioDelCodigo = "enviado" | "correo_tomado" | "no_disponible";

function envioDe(error: unknown, evento: string): EnvioDelCodigo {
  if (!error) return "enviado";
  // Otro usuario del proyecto ya tiene ese correo (una invitación a medias de otra persona, o una cuenta): no se toca.
  if (isAuthApiError(error) && (error.code === "email_exists" || error.code === "user_already_exists")) return "correo_tomado";
  const e = error as { code?: string; status?: number };
  console.error(JSON.stringify({ evento, codigo: e.code ?? null, estado: e.status ?? null }));
  return "no_disponible";
}

/**
 * Pide el cambio del correo de entrada al correo nuevo: el proyecto le manda el código SOLO a ese correo (plantilla
 * `correo-nuevo.html`, con `volverA` como enlace a la página donde se escribe). Con la sesión de ella (cambiar mi correo) o, sin sesión
 * (restablecer en tienda), con una sesión de un solo uso que se abre con la llave secreta (un enlace mágico canjeado aquí mismo, sin
 * mandar ningún correo) y se cierra enseguida.
 */
export async function pedirCodigoAlCorreoNuevo(
  opciones: { sesion: SupabaseClient } | { correoActual: string },
  correoNuevo: string,
  volverA: string,
): Promise<EnvioDelCodigo> {
  if ("sesion" in opciones) {
    const { error } = await opciones.sesion.auth.updateUser({ email: correoNuevo }, { emailRedirectTo: volverA });
    return envioDe(error, "tienda_pedir_cambio_correo_proyecto_fallo");
  }
  const admin = clienteAdmin();
  const suelto = clienteSuelto();
  if (!admin || !suelto) return "no_disponible";
  const enlace = await admin.auth.admin.generateLink({ type: "magiclink", email: opciones.correoActual });
  const hash = enlace.data.properties?.hashed_token;
  if (enlace.error || !hash) return envioDe(enlace.error ?? new Error("sin_hash"), "tienda_restablecer_enlace_fallo");
  const abierta = await suelto.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  if (abierta.error || !abierta.data.session) return envioDe(abierta.error ?? new Error("sin_sesion"), "tienda_restablecer_sesion_fallo");
  try {
    const { error } = await suelto.auth.updateUser({ email: correoNuevo }, { emailRedirectTo: volverA });
    return envioDe(error, "tienda_restablecer_pedir_cambio_fallo");
  } finally {
    await suelto.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}

/** «Pedir otro código» de un cambio que ya está pedido en el proyecto (no hace falta la sesión): el código anterior deja de servir. */
export async function reenviarCodigoDelCambio(correoNuevo: string, volverA: string): Promise<EnvioDelCodigo> {
  const suelto = clienteSuelto();
  if (!suelto) return "no_disponible";
  const { error } = await suelto.auth.resend({ type: "email_change", email: correoNuevo, options: { emailRedirectTo: volverA } });
  return envioDe(error, "tienda_reenviar_codigo_cambio_fallo");
}

export type VerificacionDelCorreo = { estado: "confirmado"; usuarioWebId: string; correo: string } | { estado: "codigo_malo" | "no_disponible" };

/**
 * El código del correo nuevo, en el proyecto de clientes: si es el bueno, el correo de entrada cambia AHÍ (y el proyecto avisa al
 * anterior). `cliente`: el de las cookies de ella (cambiar mi correo: su sesión sigue con el correo nuevo) o uno suelto (restablecer).
 * Uno equivocado, vencido, anulado por otro más nuevo o de otro correo → `codigo_malo`.
 */
export async function verificarCodigoDelCorreo(cliente: SupabaseClient, correoNuevo: string, codigo: string): Promise<VerificacionDelCorreo> {
  const { data, error } = await cliente.auth.verifyOtp({ email: correoNuevo, token: codigo, type: "email_change" });
  if (error) {
    const malo = isAuthApiError(error) && (error.status === 403 || error.code === "otp_expired");
    if (!malo && !isAuthRetryableFetchError(error)) {
      console.error(JSON.stringify({ evento: "tienda_verificar_correo_nuevo_fallo", codigo: error.code ?? null, estado: error.status ?? null }));
    }
    return { estado: malo ? "codigo_malo" : "no_disponible" };
  }
  const id = data.user?.id;
  const correo = data.user?.email;
  return id && correo ? { estado: "confirmado", usuarioWebId: id, correo: normalizarCorreo(correo) } : { estado: "no_disponible" };
}

/**
 * La base no aplicó el correo que el proyecto ya cambió (otra persona lo tomó en el medio, o nadie lo había pedido): el correo de
 * entrada vuelve al de antes en el proyecto, para que los dos digan lo mismo. Si no se puede, se anota (la próxima vez que entre a «Mi
 * cuenta», la base no lo reconoce y se vuelve a intentar).
 */
export async function devolverElCorreo(usuarioWebId: string, correo: string): Promise<boolean> {
  const admin = clienteAdmin();
  if (!admin) return false;
  const { error } = await admin.auth.admin.updateUserById(usuarioWebId, { email: correo, email_confirm: true });
  if (error) console.error(JSON.stringify({ evento: "tienda_devolver_correo_fallo", usuario_web_id: usuarioWebId, estado: error.status ?? null }));
  return !error;
}

/** La contraseña nueva de quien restableció su acceso. Ponerla cierra TODAS las sesiones de antes (medido el 2026-10-15). */
export async function ponerClaveNueva(usuarioWebId: string, clave: string): Promise<"lista" | "debil" | "no_disponible"> {
  const admin = clienteAdmin();
  if (!admin) return "no_disponible";
  const { error } = await admin.auth.admin.updateUserById(usuarioWebId, { password: clave });
  if (!error) return "lista";
  if (isAuthApiError(error) && error.code === "weak_password") return "debil";
  console.error(JSON.stringify({ evento: "tienda_poner_clave_nueva_fallo", codigo: error.code ?? null, estado: error.status ?? null }));
  return "no_disponible";
}
