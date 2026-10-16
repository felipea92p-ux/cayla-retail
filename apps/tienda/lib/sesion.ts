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

/** Las páginas de quien no tiene cuenta. Con sesión, el proxy lleva al Inicio (maqueta v4: entrar o crear la cuenta lleva ahí). */
const SOLO_SIN_CUENTA = new Set(["/", "/entrar", "/crear-cuenta", "/olvide-mi-contrasena"]);
/** Las que piden cuenta: el Inicio, «Mi cuenta» (con sus pedidos), todo el catálogo, «Arma tu look» y la bolsa (sin cuenta solo se ve
 * la portada, maqueta v4); y «Recomendaciones» (Felipe 2026-10-15: va siempre con su nombre, así que se escribe con cuenta). */
const soloConCuenta = (ruta: string) =>
  ["/inicio", "/cuenta", "/catalogo", "/looks", "/bolsa", "/recomendaciones"].some((base) => ruta === base || ruta.startsWith(`${base}/`));
export const INICIO_CON_CUENTA = "/inicio";

/**
 * A dónde manda el proxy, o null para seguir. Solo navegaciones (GET/HEAD): una acción del servidor viaja como POST a la misma
 * ruta y se valida sola. `no_se`: el proyecto de clientes no contestó; no se manda a nadie a ningún lado por eso.
 * Sin sesión, «Entrar» lleva `?volver=` con la página que se pidió (y su búsqueda): quien abre el enlace de una prenda o de un pedido
 * vuelve a ESA página al entrar o al crear su cuenta, no al Inicio (`rutaParaVolver`, lib/entrada.ts, lo revisa). El Inicio no lo
 * lleva: es a donde se llega de todos modos.
 */
export function redireccionDelProxy(ruta: string, metodo: string, usuario: "si" | "no" | "no_se", busqueda = ""): string | null {
  if (metodo !== "GET" && metodo !== "HEAD") return null;
  if (usuario === "si" && SOLO_SIN_CUENTA.has(ruta)) return INICIO_CON_CUENTA;
  if (usuario === "no" && soloConCuenta(ruta)) {
    return ruta === INICIO_CON_CUENTA ? "/entrar" : `/entrar?${PARAMETRO_VOLVER_DEL_PROXY}=${encodeURIComponent(ruta + busqueda)}`;
  }
  return null;
}

/** El parámetro de «Entrar» con la página a la que se vuelve: el mismo `PARAMETRO_VOLVER` de lib/entrada.ts (que importa este
 *  archivo: importarlo de allá sería circular; `sesion.test.ts` exige que sean iguales). */
export const PARAMETRO_VOLVER_DEL_PROXY = "volver";
