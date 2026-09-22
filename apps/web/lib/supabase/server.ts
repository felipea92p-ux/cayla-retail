import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@cayla-retail/database";
import { encabezadosResponsable, type Firma } from "@/lib/responsable-reglas";

/**
 * @param opciones.firma — solo en rutas `/api/*` que guardan una operación de tienda: la firma del combo «Responsable»
 *   que mandó la pantalla (`firmaDeEncabezados(request.headers)`, ADR-0161/0162). Viaja en cada consulta de este
 *   cliente como `x-responsable`/`x-ubicacion`, que la base lee en `fn_actor_persona_id`. Sin firma, igual que antes.
 */
export async function createClient(opciones: { firma?: Firma | null } = {}) {
  const cookieStore = await cookies();
  return createServerClient<Database, "retail">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "retail" },
      ...(opciones.firma ? { global: { headers: encabezadosResponsable(opciones.firma) } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // se llama desde un Server Component — proxy.ts refresca la sesión.
          }
        },
      },
    }
  );
}
