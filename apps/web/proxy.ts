import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Este archivo se llamaba `middleware.ts` hasta Next 16, que renombró la convención a
// `proxy` (el nombre viejo sigue funcionando pero avisa en cada build que está deprecado).
// El nombre importa más de lo que parece: "middleware" se confundía con el de Express —
// algo que corre DENTRO de la app— cuando en realidad es una barrera de red por DELANTE,
// que puede correr en otra región y otro proceso. De ahí que `cache()` de React no
// comparta nada entre este archivo y el render (ver lib/persona.ts).
//
// Cambia solo el nombre del archivo y el de la función; `config.matcher` de abajo sigue
// idéntico. Desde Next 16 corre en runtime Node.js por defecto (antes Edge), así que
// respeta la región de `vercel.json` — ver ADR-0013.
//
// OJO al tocar el matcher: las Server Actions NO son rutas propias — viajan como POST a
// la ruta donde se usan. Si el matcher excluye esa ruta, esta barrera tampoco corre para
// la acción. Por eso cada Server Action valida por su cuenta: `app/actions/sede.ts`
// vuelve a pedir el usuario y su rol antes de escribir la cookie, sin confiar en que este
// archivo la haya cubierto. Toda escritura real de stock pasa además por RPC con
// fn_puede_operar_sede (0012), que es la barrera que de verdad protege los datos.
export async function proxy(request: NextRequest) {
  // El trabajo programado de Vercel (PL-113) no trae sesión: trae `Bearer $CRON_SECRET`. Pasa sin tocar cookies y
  // la ruta vuelve a comprobar la clave (esta barrera puede dejar de cubrirla si alguien cambia el matcher). Solo
  // para SU ruta: la clave no abre ninguna otra pantalla ni API.
  const cron = process.env.CRON_SECRET;
  if (cron && request.nextUrl.pathname === "/api/lucode/reintentar" && request.headers.get("authorization") === `Bearer ${cron}`) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() en vez de getUser(): el proyecto firma los JWT con clave asimétrica
  // (ES256, ver /auth/v1/.well-known/jwks.json), así que la verificación se hace LOCAL
  // con WebCrypto — sin viaje de red. getUser() siempre preguntaba al servidor de Auth,
  // y como este archivo corre en una invocación distinta del render, ese mismo viaje se
  // pagaba dos veces por navegación (acá y en lib/persona.ts). — ADR-0013.
  //
  // Lo que NO cambia: si el token está por vencer, getClaims() refresca la sesión antes
  // de validar, igual que antes; el setAll() de arriba sigue escribiendo las cookies
  // nuevas. Y si algún día el proyecto volviera a firmar con secreto simétrico, getClaims()
  // cae solo al viaje de red — se comporta como hoy, no se rompe.
  const { data: verificado } = await supabase.auth.getClaims();
  const haySesion = verificado?.claims != null;

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth");
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!haySesion && !isLoginPage && !isAuthCallback) {
    // A una pantalla se la manda al login; a una ruta de API, no. Un `fetch()`
    // sigue el redirect en silencio, recibe el HTML del login y revienta al
    // intentar leerlo como JSON — el formulario terminaba diciendo "no se pudo
    // consultar" cuando lo que pasó fue que la sesión venció. Con esto, quien
    // llama recibe un 401 que puede distinguir y explicar.
    if (isApi) {
      return NextResponse.json({ error: "Sesión vencida. Vuelve a entrar." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Si viene con ?error=sin_persona, se queda en /login mostrando el aviso — si no,
  // entraría en un bucle infinito con requirePersonaActual() (login.tsx/lib/persona.ts),
  // que manda para acá cuando el usuario está autenticado pero no tiene fila en `personas`.
  const tieneError = request.nextUrl.searchParams.has("error");
  if (haySesion && isLoginPage && !tieneError) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
