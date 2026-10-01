import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";

// El cliente ANÓNIMO del servidor: la llave pública y NINGUNA sesión, así que en la base siempre es el rol `anon`. Existe
// para la página pública del club (`/club/[token]`, ADR-0288 act. c), que abre una clienta en su celular sin cuenta.
//
// Por qué no `lib/supabase/server.ts`: ese lee las cookies de la petición. Si el celular que abre el enlace tiene abierta
// una sesión del ERP (el de la tienda, al probar), la consulta viajaría como esa persona y no como `anon`, y la página
// se comportaría distinto según quién la abre. Aquí no se lee ni se escribe ninguna cookie: la página es igual para todos.
//
// Solo alcanza lo que la base concede a `anon` (hoy, `fn_invitacion_club` y `confirmar_invitacion_club`); RLS sigue
// cerrando todo lo demás. `server-only`: si un componente cliente lo importara, Next falla al compilar. Como el de
// `lib/supabase-admin.ts`, se crea en cada llamada y muere con la petición.
export function crearClienteAnonimo() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !llave) throw new Error("Falta configurar NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en el servidor");
  return createClient<Database, "retail">(url, llave, {
    db: { schema: "retail" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
