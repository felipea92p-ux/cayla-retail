// La sesión de los clientes de la tienda online (ADR-0408, decisión 2). Las cuentas viven en un proyecto de inicio de sesión
// APARTE, solo de clientes: nunca el del ERP. Aquí lo que comparten el navegador, el servidor y el proxy, sin red: dónde está
// ese proyecto (sus dos variables públicas), cómo se llama la cookie y a dónde lleva el proxy a quien tiene o no tiene cuenta.

/** La cookie de la sesión. Con nombre propio: el ERP en local también vive en «localhost» y su cookie no debe pisarse con esta. */
export const COOKIE_SESION = "tienda-sesion";

export type ConfigAuth = { url: string; llavePublica: string };

/**
 * El proyecto de inicio de sesión de los clientes. Solo sus dos datos públicos (los mismos que viajan al navegador para entrar y
 * recuperar la contraseña); la llave secreta la lee solo `lib/sesion-servidor.ts`. null si la tienda no lo tiene configurado:
 * entonces nadie entra, pero ninguna página se cae (la compilación del CI corre así).
 */
export function configAuth(): ConfigAuth | null {
  // Escritas enteras: Next solo lleva al navegador las variables NEXT_PUBLIC_ que ve escritas así.
  const url = process.env.NEXT_PUBLIC_TIENDA_AUTH_URL?.trim();
  const llavePublica = process.env.NEXT_PUBLIC_TIENDA_AUTH_ANON_KEY?.trim();
  return url && llavePublica ? { url, llavePublica } : null;
}

/** ¿Trae la cookie de una sesión? No la valida: sirve para elegir la cabecera y para no preguntarle al proyecto en vano. */
export const tieneCookieDeSesion = (nombres: readonly string[]) =>
  nombres.some((nombre) => nombre === COOKIE_SESION || /^tienda-sesion\.\d+$/.test(nombre));

/** Las páginas de quien no tiene cuenta. Con sesión, el proxy lleva al catálogo (la maqueta lleva al Inicio, que arma la
 *  actividad 5: entonces cambia `INICIO_CON_CUENTA`). */
const SOLO_SIN_CUENTA = new Set(["/", "/entrar", "/crear-cuenta", "/olvide-mi-contrasena"]);
/** Las que piden cuenta: «Mi cuenta» (con sus pedidos), todo el catálogo y la bolsa (sin cuenta solo se ve la portada, maqueta v4). */
const soloConCuenta = (ruta: string) => ["/cuenta", "/catalogo", "/bolsa"].some((base) => ruta === base || ruta.startsWith(`${base}/`));
export const INICIO_CON_CUENTA = "/catalogo";

/**
 * A dónde manda el proxy, o null para seguir. Solo navegaciones (GET/HEAD): una acción del servidor viaja como POST a la misma
 * ruta y se valida sola. `no_se`: el proyecto de clientes no contestó; no se manda a nadie a ningún lado por eso.
 */
export function redireccionDelProxy(ruta: string, metodo: string, usuario: "si" | "no" | "no_se"): string | null {
  if (metodo !== "GET" && metodo !== "HEAD") return null;
  if (usuario === "si" && SOLO_SIN_CUENTA.has(ruta)) return INICIO_CON_CUENTA;
  if (usuario === "no" && soloConCuenta(ruta)) return "/entrar";
  return null;
}
