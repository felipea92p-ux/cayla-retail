// Cuando la base no responde, el ERP dice «sin conexión con la base» y espera; nunca saca a nadie de su sesión (ADR-0450).
//
// EL PROBLEMA (2026-10-17). La base de producción se cayó y `requirePersonaActualV2` leyó el error de red de `fn_persona_actual_resumen`
// como «esta cuenta no tiene persona»: mandó a todos a `/login?error=sin_persona` («Pide a un Líder que te dé de alta»). La sesión seguía
// abierta y la cuenta seguía dada de alta: lo único que pasaba era que la base no contestaba. Y el login, que tampoco podía hablar con la
// base, decía «Correo o contraseña incorrectos». Lógica pura: la usan `proxy.ts`, `persona-actual.ts` y la pantalla `/sin-base`.

/** Lo mínimo que se mira de una respuesta de Supabase (PostgREST): su error y el código HTTP. `status` 0 = el `fetch` ni llegó a responder. */
export type RespuestaDeLaBase = {
  error: { code?: string | null; message?: string | null } | null;
  status?: number | null;
};

// Códigos que dicen «la base no pudo atender», no «lo que pediste no existe o no puedes verlo»: 08 (conexión), 53 (sin recursos:
// demasiadas conexiones, memoria), 57 (consulta cancelada por tiempo —57014—, base apagándose o arrancando), y los PGRST000–003 con que
// PostgREST dice que no llegó a la base o que se agotó la espera de una conexión del pool.
const CODIGOS_DE_BASE_QUE_NO_RESPONDE = /^(?:08|53|57)|^PGRST00[0-3]$/;

/**
 * ¿Esta respuesta dice que la BASE no respondió? Sí si el `fetch` no llegó (status 0), si la puerta devolvió un error del servidor
 * (500 o más) o «demasiadas peticiones» (429), o si el error trae uno de los códigos de arriba. No: un permiso negado (42501), una
 * función que falta (42883, PGRST202) o una consulta que simplemente no devolvió fila son respuestas de la base, y siguen
 * tratándose como antes (falla cerrado: sin fila no se entra).
 */
export function esFalloDeLaBase(respuesta: RespuestaDeLaBase): boolean {
  if (!respuesta.error) return false;
  const { status } = respuesta;
  if (status === 0 || status === 429 || (typeof status === "number" && status >= 500)) return true;
  return CODIGOS_DE_BASE_QUE_NO_RESPONDE.test(respuesta.error.code ?? "");
}

/**
 * ¿Este error de Auth (iniciar sesión, renovarla) es que el servicio no respondió, y no que la contraseña esté mal? Sí si el `fetch` ni llegó
 * (`AuthRetryableFetchError`, status 0) o si Auth devolvió un error del servidor (500 o más, lo que da cuando no llega a su base). Un 400 o
 * un 401 (credenciales inválidas) y un 429 (demasiados intentos) no: esos siguen diciendo lo que dicen.
 */
export function esFalloDeAuth(error: { name?: string | null; status?: number | null }): boolean {
  return error.name === "AuthRetryableFetchError" || error.status === 0 || (typeof error.status === "number" && error.status >= 500);
}

/** A dónde lleva «Volver» cuando la base responde otra vez: solo una ruta del propio ERP, nunca otra dirección ni el propio aviso. */
export function rutaDeVuelta(desde: string | null | undefined): string {
  const ruta = (desde ?? "").trim();
  if (!ruta.startsWith("/") || ruta.startsWith("//") || ruta.includes("\\") || /[\u0000-\u001f]/.test(ruta)) return "/";
  const sinParametros = ruta.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (sinParametros === "/sin-base" || sinParametros === "/login" || sinParametros.startsWith("/auth")) return "/";
  return ruta;
}

/** La dirección de `/sin-base` para una ruta de la que se salió (la ruta va codificada, para que su `?` no se confunda con el de la dirección). */
export function direccionDeSinBase(rutaYBusqueda: string | null | undefined): string {
  const vuelta = rutaDeVuelta(rutaYBusqueda);
  return vuelta === "/" ? "/sin-base" : `/sin-base?desde=${encodeURIComponent(vuelta)}`;
}

const PRIMER_REINTENTO_MS = 8_000;
const TOPE_DE_ESPERA_MS = 60_000;

/**
 * Cuánto esperar antes de volver a preguntarle a la base (la pantalla `/sin-base`). Crece 1,5× por intento hasta un minuto y lleva un
 * margen al azar de ±25 %: cuando la base vuelve, cien aparatos que preguntaban cada 8 s a la vez no deben caerle todos en el mismo
 * segundo (es justo cuando está más frágil). `azar` es un número entre 0 y 1 (se inyecta para poder probarlo).
 */
export function msHastaReintentar(intento: number, azar: number): number {
  const base = Math.min(TOPE_DE_ESPERA_MS, PRIMER_REINTENTO_MS * 1.5 ** Math.max(0, intento));
  const margen = 0.75 + Math.min(1, Math.max(0, azar)) * 0.5;
  return Math.round(base * margen);
}
