import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth");
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!user && !isLoginPage && !isAuthCallback) {
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
  if (user && isLoginPage && !tieneError) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
