import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";

// El cliente con la LLAVE DE SERVICIO: salta todo candado (RLS). Existe para: crear la cuenta de Auth de una terminal y
// cambiarle la clave (`lib/terminales-alta.ts`), que solo se abre DESPUÉS de comprobar con la sesión de quien llama que es
// líder; los trabajos programados (la cola de SUNAT, PL-113, `GET /api/lucode/reintentar`, y los demás `app/api/*` de cron),
// que solo se abren con `CRON_SECRET` y escriben por las mismas funciones que la pantalla (`20260924113817`); anotar una lectura
// del padrón para el nombre de una ficha (`lib/padron-lecturas.ts`, `fn_anotar_lectura_padron`); y la política y
// los términos públicos del Club CAYLA (ADR-0288 act. g, `lib/club-pagina.ts`), que leen el id de una tienda activa. El
// registro del cartel, que llamaba a `club_intento` y `registrarse_en_el_club`, se retiró el 2026-10-16 (el cartel lleva a la
// tienda online, 20261016154000). `server-only` hace que Next falle al compilar si algún
// componente cliente lo importa, y la variable NO lleva `NEXT_PUBLIC_`: nunca viaja al navegador.
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
