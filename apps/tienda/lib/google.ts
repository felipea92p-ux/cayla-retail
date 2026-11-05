// Entrar con Google (ADR-0438, Felipe 2026-10-17: «que se pueda iniciar sesión con Google»). El proyecto de clientes hace el
// intercambio con Google; aquí, sin red, lo que la tienda decide con lo que vuelve: si el usuario de verdad entró con Google y con un
// correo que Google confirmó (solo así se crea la cuenta sin código), y con qué nombre se saluda. Lógica pura: la usa
// `lib/google-servidor.ts` y su prueba.

/** Lo que de un usuario del proyecto de clientes importa aquí (la forma de `User` de supabase-js, sin depender de ella). */
export type UsuarioDelProyecto = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: { provider?: string; identity_data?: Record<string, unknown> | null }[] | null;
};

export type UsuarioDeGoogle = { id: string; correo: string; nombre: string };

/** El tope del nombre de una ficha (la base acepta 120). */
const MAX_NOMBRE = 120;

const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * El usuario, si entró con Google y Google confirmó su correo; si no, null (la cuenta NO se crea: un correo sin confirmar no sirve
 * como prueba de que es de quien entra). El nombre: el que Google dice (su nombre completo), o lo que va antes de la @ del correo.
 */
export function usuarioDeGoogle(u: UsuarioDelProyecto): UsuarioDeGoogle | null {
  const identidad = u.identities?.find((i) => i.provider === "google") ?? null;
  const providers = Array.isArray(u.app_metadata?.providers) ? (u.app_metadata?.providers as unknown[]) : [];
  if (!identidad && !providers.includes("google")) return null;
  const correo = texto(u.email ?? identidad?.identity_data?.email).toLowerCase();
  if (!correo) return null;
  // Confirmado por Google (`email_verified`) o por el proyecto (`email_confirmed_at`): con cualquiera de los dos, el correo es suyo.
  const confirmado = identidad?.identity_data?.email_verified === true || u.user_metadata?.email_verified === true || !!u.email_confirmed_at;
  if (!confirmado) return null;
  const nombre =
    texto(identidad?.identity_data?.full_name) || texto(identidad?.identity_data?.name) || texto(u.user_metadata?.full_name) || texto(u.user_metadata?.name) || correo.split("@")[0];
  return { id: u.id, correo, nombre: nombre.slice(0, MAX_NOMBRE) };
}

/** Qué sigue cuando entra alguien con Google que todavía no tiene cuenta y la base ya contestó si su correo era de una ficha
 *  (ADR-0469). `listo`: la cuenta ya existe (se unió a su ficha, o ya la tenía). `registrar`: no es de ninguna ficha, o la base no
 *  contestó: se crea la cuenta simple de siempre (que dirá lo que ya decía si hay un problema). `rechazar`: hay una ficha con ese
 *  correo pero no se puede unir sola (otro nombre, archivada, cuenta cerrada): nadie queda a medias, y se manda a una tienda.
 *  `otro_correo`: la ficha ya tiene cuenta abierta con otro correo y el nombre coincide: se le dice con cuál entrar (20261021182000). */
export type SiguienteTrasVincular = "listo" | "registrar" | "rechazar" | "otro_correo";

export function siguienteTrasVincular(estado: "vinculada" | "ya_tiene_cuenta" | "no_aplica" | "no_coincide" | "otro_correo" | "sin_respuesta"): SiguienteTrasVincular {
  switch (estado) {
    case "vinculada":
    case "ya_tiene_cuenta":
      return "listo";
    case "no_coincide":
      return "rechazar";
    case "otro_correo":
      return "otro_correo";
    default:
      return "registrar";
  }
}

/** La cookie corta con que la ruta de Google le deja a «Entrar» el correo de la cuenta, a medias: un correo no viaja en la dirección. */
export const COOKIE_GOOGLE_CORREO = "cayla-google-correo";
/** Cuánto vive: lo justo para volver a «Entrar» y leerla. */
export const COOKIE_GOOGLE_CORREO_S = 120;

/** «su••••@gmail.com», tal como lo arma la base (dos letras, cuatro puntos y el dominio); cualquier otra cosa no se muestra. */
export function correoOcultoValido(valor: unknown): string | null {
  return typeof valor === "string" && /^[^\s@•]{1,4}•{4}@[^\s@•]{3,100}$/.test(valor) ? valor : null;
}

/** Lo que dice la cookie (`document.cookie`), o null si no está o no es un correo a medias. */
export function correoOcultoDeLaCookie(cookies: string): string | null {
  for (const parte of cookies.split(";")) {
    const [nombre, ...resto] = parte.trim().split("=");
    if (nombre === COOKIE_GOOGLE_CORREO) {
      try {
        return correoOcultoValido(decodeURIComponent(resto.join("=")));
      } catch {
        return null;
      }
    }
  }
  return null;
}
