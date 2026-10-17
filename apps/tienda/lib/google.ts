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
