import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";

// El cliente con la LLAVE DE SERVICIO: salta todo candado (RLS). Existe por UNA razón —crear la cuenta de Auth de una
// terminal y cambiarle la clave (`lib/terminales-alta.ts`)— y solo se abre DESPUÉS de comprobar con la sesión de quien
// llama que es líder. `server-only` hace que Next falle al compilar si algún componente cliente lo importa, y la
// variable NO lleva `NEXT_PUBLIC_`: nunca viaja al navegador.
//
// Nunca se guarda en una variable de módulo: se crea en cada llamada y muere con la petición.

export const FALTA_LLAVE = "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor";

export function crearClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!llave) throw new Error(FALTA_LLAVE);
  if (!url) throw new Error("Falta configurar NEXT_PUBLIC_SUPABASE_URL en el servidor");
  return createClient<Database, "retail">(url, llave, {
    db: { schema: "retail" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
