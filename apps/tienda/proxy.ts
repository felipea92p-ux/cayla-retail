import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { configAuth, OPCIONES_COOKIE_SESION, redireccionDelProxy, tieneCookieDeSesion } from "@/lib/sesion";

// La barrera por delante de la tienda (Next 16 llama `proxy` a lo que antes era `middleware`). Hace dos cosas:
//   1. Refresca la sesión del cliente: una página no puede escribir cookies, y sin esto la sesión se vencería a la hora
//      (`@supabase/ssr`). Solo si trae la cookie: un visitante sin cuenta no le cuesta ni una consulta al proyecto de clientes.
//   2. Lleva a cada uno a su lado: con sesión, de la portada, «Entrar», «Crear mi cuenta» y «Olvidé mi contraseña» al Inicio;
//      sin sesión, del Inicio, el catálogo y «Mi cuenta» a «Entrar» (`lib/sesion.ts`). Si el proyecto de clientes no contesta,
//      no manda a nadie a ningún lado.
// No es la que protege los datos: cada página y cada acción vuelve a preguntar quién es, y la base decide en sus funciones.
export async function proxy(request: NextRequest) {
  const ajustes = configAuth();
  const ruta = request.nextUrl.pathname;
  if (!ajustes || !tieneCookieDeSesion(request.cookies.getAll().map((c) => c.name))) {
    const destino = redireccionDelProxy(ruta, request.method, "no");
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
  const { data, error } = await supabase.auth.getUser();
  const usuario = data.user ? "si" : error && isAuthRetryableFetchError(error) ? "no_se" : "no";
  const destino = redireccionDelProxy(ruta, request.method, usuario);
  if (!destino) return respuesta;
  const redireccion = NextResponse.redirect(new URL(destino, request.url));
  for (const cookie of respuesta.cookies.getAll()) redireccion.cookies.set(cookie);
  return redireccion;
}

export const config = {
  // Todo menos lo que arma Next y los archivos estáticos (el colibrí, los íconos).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
