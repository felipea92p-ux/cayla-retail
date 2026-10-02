/**
 * Qué hace una pestaña cuando la cuenta del navegador cambia por debajo de ella (ADR-0307).
 *
 * La sesión vive en cookies, compartidas por todas las pestañas. Si en una pestaña alguien sale y entra con otra cuenta,
 * las demás siguen dibujadas con el menú y los datos de la cuenta anterior, aunque cada petición ya viaje como la nueva.
 * Esta regla decide, a partir de quién era el usuario cuando la pestaña se dibujó (`idMio`) y quién es ahora (`idAhora`):
 *  - «nada»: la pestaña no tenía cuenta (login, páginas públicas) o la cuenta es la misma;
 *  - «login»: la cuenta se cerró; se va a /login;
 *  - «inicio»: entró otra cuenta; se va al inicio (no se recarga la misma ruta: la cuenta nueva puede no tener ese módulo).
 */
export type AccionDeSesion = "nada" | "login" | "inicio";

export function decidirAccionDeSesion(idMio: string | null, idAhora: string | null): AccionDeSesion {
  if (idMio === null) return "nada";
  if (idAhora === idMio) return "nada";
  return idAhora === null ? "login" : "inicio";
}

export const DESTINO_DE_ACCION: Record<Exclude<AccionDeSesion, "nada">, string> = {
  login: "/login",
  inicio: "/",
};

/** Dónde se deja el motivo del salto para que la pantalla de destino lo cuente (sessionStorage: solo esta pestaña). */
export const CLAVE_AVISO_DE_SESION = "cayla_aviso_sesion";

export const AVISO_DE_ACCION: Record<Exclude<AccionDeSesion, "nada">, { texto: string; detalle: string }> = {
  login: { texto: "La sesión se cerró en otra pestaña", detalle: "Vuelve a entrar para seguir." },
  inicio: { texto: "La cuenta cambió", detalle: "Te llevamos al inicio con la cuenta que está activa." },
};

/** Lo guardado en la clave solo vale si es una acción conocida: un valor raro no dibuja nada. */
export function avisoGuardado(valor: string | null) {
  return valor === "login" || valor === "inicio" ? AVISO_DE_ACCION[valor] : null;
}
