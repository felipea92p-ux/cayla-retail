// La sesión de los clientes de la tienda online (ADR-0408, decisión 2). Las cuentas viven en un proyecto de inicio de sesión
// APARTE, solo de clientes: nunca el del ERP. Aquí lo que comparten el navegador, el servidor y el proxy, sin red: dónde está
// ese proyecto (sus dos variables públicas), cómo se llama la cookie y a dónde lleva el proxy a quien tiene o no tiene cuenta.

/** La cookie de la sesión. Con nombre propio: el ERP en local también vive en «localhost» y su cookie no debe pisarse con esta. */
export const COOKIE_SESION = "tienda-sesion";
/** Las opciones de esa cookie en los tres lugares que la escriben (el proxy, el servidor y el navegador). En producción viaja solo por
 *  https (`secure`): `@supabase/ssr` no la marca así por su cuenta. No es `httpOnly` porque el navegador la usa para entrar y
 *  recuperar la contraseña (`lib/auth-navegador.ts`); la sesión de verdad la valida el proyecto de clientes en cada página. */
export const OPCIONES_COOKIE_SESION = { name: COOKIE_SESION, secure: process.env.NODE_ENV === "production" };

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

/**
 * ¿Se ofrece «Continuar con Google»? Solo cuando el proyecto de clientes ya tiene el proveedor encendido (a mano en su panel, con el
 * cliente de Google Cloud): `NEXT_PUBLIC_TIENDA_GOOGLE=si`. Sin eso, el botón no sale (no hay un camino roto a la vista). Escrita entera:
 * Next solo lleva al navegador las variables NEXT_PUBLIC_ que ve escritas así.
 */
export const googleDisponible = () => process.env.NEXT_PUBLIC_TIENDA_GOOGLE?.trim() === "si";

/** ¿Trae la cookie de una sesión? No la valida: sirve para elegir la cabecera y para no preguntarle al proyecto en vano. */
export const tieneCookieDeSesion = (nombres: readonly string[]) =>
  nombres.some((nombre) => nombre === COOKIE_SESION || /^tienda-sesion\.\d+$/.test(nombre));

/** Las páginas de quien todavía no tiene cuenta: con sesión, el proxy lleva al Inicio. */
const SOLO_SIN_CUENTA = new Set(["/entrar", "/crear-cuenta", "/olvide-mi-contrasena"]);
/**
 * Las que piden cuenta: lo que es DE la persona (su perfil con sus pedidos, un pedido ya separado, las recomendaciones que se escriben
 * con su nombre). El catálogo, los precios, cuánto hay en cada tienda, los looks, «Arma el tuyo» y la bolsa son de todos (Felipe
 * 2026-10-17: «no sea obligatorio que inicie sesión para ver los productos, ni los precios ni el stock»): la cuenta se pide al
 * SEPARAR, o cuando la persona quiere guardar algo suyo (un favorito, un aviso), no antes.
 */
const soloConCuenta = (ruta: string) =>
  ["/cuenta", "/bolsa/separado", "/recomendaciones"].some((base) => ruta === base || ruta.startsWith(`${base}/`));
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
  // La portada ya no es otra pantalla: la tienda se ve igual con o sin cuenta, y su puerta es el Inicio.
  if (ruta === "/") return INICIO_CON_CUENTA;
  if (usuario === "si" && SOLO_SIN_CUENTA.has(ruta)) return INICIO_CON_CUENTA;
  if (usuario === "no" && (soloConCuenta(ruta) || esListaDeFavoritos(ruta, busqueda))) {
    return `/entrar?${PARAMETRO_VOLVER_DEL_PROXY}=${encodeURIComponent(ruta + busqueda)}`;
  }
  return null;
}

/** Los favoritos son de la persona: la lista de todos no (`/catalogo?lista=favoritos`). */
const esListaDeFavoritos = (ruta: string, busqueda: string) =>
  ruta === "/catalogo" && new URLSearchParams(busqueda).get("lista") === "favoritos";

/** El parámetro de «Entrar» con la página a la que se vuelve: el mismo `PARAMETRO_VOLVER` de lib/entrada.ts (que importa este
 *  archivo: importarlo de allá sería circular; `sesion.test.ts` exige que sean iguales). */
export const PARAMETRO_VOLVER_DEL_PROXY = "volver";
