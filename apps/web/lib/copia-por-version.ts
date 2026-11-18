// La copia guardada de una lectura del catálogo entre visitas (solo servidor). La usan el catálogo entero (`getCatalogo`) y lo que se
// calcula solo con el catálogo (las fichas que parecen repetidas, `getPosiblesDuplicados`).
//
// LA REGLA. La llave de la copia es la versión que la BASE sube con cada escritura en las tablas del catálogo (`fn_catalogo_version`,
// 20260923184300: variantes, productos, producto_fotos, codigos_barras, tallas, colores, categorías y marcas): si alguien cambió algo —desde
// donde sea, también el SQL Editor o Dynamic—, la versión ya es otra y se lee fresco. Nunca se sirve una copia vieja. Por eso solo se guarda
// aquí lo que depende ÚNICAMENTE de esas tablas y se lee igual con cualquier sesión: lo que cambia por sede, por cuenta o por stock no entra.
// La llave lleva además la FORMA de lo guardado, que quien llama sube cuando cambia cómo se arma (nunca el commit: la caché de Vercel
// sobrevive a las publicaciones y con el commit cada una la vaciaba; 2026-11-13, `docs/innovacion/2026-11-13-cambiar-de-modulo.md` #3 y #8).

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient as crearClienteSupabase, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";
import { createClient } from "@/lib/supabase/server";

type Cliente = SupabaseClient<Database, "retail">;

/** Cómo se guarda una parte de la copia entre visitas: en la caché de Vercel, o nada (`enVivo`). Lo que lanza un error no se guarda. */
export type Guardar = <T>(partes: string[], leer: () => Promise<T>) => Promise<T>;
const enVivo: Guardar = (_partes, leer) => leer();

/** La versión del catálogo y el token de la sesión, UNA vez por petición aunque dos lecturas los pidan. */
const versionYToken = cache(async () => {
  const supabase = await createClient();
  const [{ data: version, error }, { data: sesion }] = await Promise.all([supabase.rpc("fn_catalogo_version"), supabase.auth.getSession()]);
  return { supabase, version: error || version === null ? null : String(version), token: sesion.session?.access_token ?? null };
});

/** Un cliente sin cookies para usar dentro de la copia guardada, con la sesión de quien la llena (PostgREST la valida igual). */
function clienteConToken(token: string): Cliente {
  return crearClienteSupabase<Database, "retail">(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    db: { schema: "retail" },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Arma una lectura con su copia guardada. `clave` nombra la lectura y su forma (`["catalogo-v2", FORMA]`); la versión del catálogo se suma
 * sola. `armar` recibe el cliente y `guardar`, y decide qué partes guarda. Sin versión (la función no está, o falló) ni sesión, se lee en
 * vivo: más lento, nunca viejo. Cada vez que una parte se lee en vivo queda una línea `copia_por_version_lectura` en los registros: así se
 * cuenta cuánto se ahorra (`vercel logs --query copia_por_version_lectura`).
 */
export async function conCopiaPorVersion<T>(clave: readonly [string, ...string[]], armar: (supabase: Cliente, guardar: Guardar) => Promise<T>): Promise<T> {
  const { supabase, version, token } = await versionYToken();
  if (version === null || token === null) return armar(supabase, enVivo);
  const [nombre, ...forma] = clave;
  const guardar: Guardar = (partes, leer) =>
    unstable_cache(
      async () => {
        console.info(JSON.stringify({ evento: "copia_por_version_lectura", copia: nombre, parte: partes.join("/") }));
        return leer();
      },
      [nombre, version, ...forma, ...partes],
      { revalidate: 3600 },
    )();
  return armar(clienteConToken(token), guardar);
}
