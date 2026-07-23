import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@cayla-retail/database";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database, "retail">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "retail" },
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
            // se llama desde un Server Component — el middleware refresca la sesión.
          }
        },
      },
    }
  );
}
