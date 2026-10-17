import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { configAuth, OPCIONES_COOKIE_SESION, redireccionDelProxy, tieneCookieDeSesion } from "@/lib/sesion";

// La barrera por delante de la tienda (Next 16 llama `proxy` a lo que antes era `middleware`). Hace dos cosas:
//   1. Refresca la sesión del cliente: una página no puede escribir cookies, y sin esto la sesión se vencería a la hora
//      (`@supabase/ssr`). Solo si trae la cookie: un visitante sin cuenta no le cuesta ni una consulta al proyecto de clientes; y con
//      cuenta, tampoco, salvo para renovarla (la firma se revisa aquí con la llave pública: `getClaims`).
//   2. Lleva a cada uno a su lado: con sesión, de la portada, «Entrar», «Crear mi cuenta» y «Olvidé mi contraseña» al Inicio;
//      sin sesión, del Inicio, el catálogo y «Mi cuenta» a «Entrar», con la página pedida en `?volver=` (`lib/sesion.ts`). Si el proyecto de clientes no contesta,
//      no manda a nadie a ningún lado.
// No es la que protege los datos: cada página y cada acción vuelve a preguntar quién es, y la base decide en sus funciones.
export async function proxy(request: NextRequest) {
  const ajustes = configAuth();
  const ruta = request.nextUrl.pathname;
  if (!ajustes || !tieneCookieDeSesion(request.cookies.getAll().map((c) => c.name))) {
    const destino = redireccionDelProxy(ruta, request.method, "no", request.nextUrl.search);
    return destino ? NextResponse.redirect(new URL(destino, request.url)) : NextResponse.next();
  }

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(ajustes.url, ajustes.llavePublica, {
    cookieOptions: OPCIONES_COOKIE_SESION,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista, cabeceras) {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
        // Una respuesta que trae cookies de sesión no se guarda en ninguna caché (la de una persona no puede llegarle a otra).
        for (const [clave, valor] of Object.entries(cabeceras ?? {})) respuesta.headers.set(clave, valor);
      },
    },
  });
  // La firma de la sesión se revisa AQUÍ, con la llave pública del proyecto de clientes (ES256, guardada en memoria): sin una consulta al
  // proyecto en cada petición. Antes (`getUser`) cada navegación y cada precarga de un enlace (una por prenda a la vista) le preguntaba
  // al proyecto de clientes, el plan gratis, quién era (medido 2026-10-16). Si la sesión está por vencer, `getClaims` la renueva primero
  // (eso sí llama, una vez por hora). Este paso solo decide a dónde mandar a cada uno: lo que muestra datos de una cuenta vuelve a
  // preguntarle al proyecto (`leerSesion`, con `getUser`), así que una sesión cerrada en otro aparato no ve nada de la cuenta.
  const { data, error } = await supabase.auth.getClaims();
  const usuario = data?.claims?.sub ? "si" : error && isAuthRetryableFetchError(error) ? "no_se" : "no";
  const destino = redireccionDelProxy(ruta, request.method, usuario, request.nextUrl.search);
  if (!destino) return respuesta;
  const redireccion = NextResponse.redirect(new URL(destino, request.url));
  for (const cookie of respuesta.cookies.getAll()) redireccion.cookies.set(cookie);
  return redireccion;
}

export const config = {
  // Todo menos lo que arma Next y los archivos estáticos (el colibrí, los íconos, el manifiesto y el service worker de «instalar CAYLA»: el
  // navegador los pide sin cookies y no debe toparse con ninguna redirección), y la ruta de la medición (ADR-0447): un envío no toca la
  // sesión de nadie (sin esta excepción, el de quien tiene cuenta revisaría y hasta renovaría su sesión).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/medicion|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|js|webmanifest)$).*)"],
};
