import { createClient } from "@/lib/supabase/server";
import { etapasDesdeFilas, type EtapasOcultas } from "@/lib/etapa-prenda-reglas";

/**
 * Los modelos del Taller que todavía no llegan a una tienda (ADR-0614, actividad 14). `null` si la base no respondió o todavía no tiene la
 * función: la pantalla muestra todo, como antes. Es una lista corta (solo los modelos con una orden viva), no pesa en la caja.
 */
export async function getEtapasOcultas(): Promise<EtapasOcultas> {
  const supabase = await createClient();
  // Fuera de los tipos generados hasta el próximo volcado de producción.
  const { data, error } = await (supabase.rpc as unknown as (f: string) => PromiseLike<{ data: { producto_id: string; etapa: string }[] | null; error: unknown }>)(
    "fn_productos_aun_no_en_tienda",
  );
  if (error || !data) return null;
  return etapasDesdeFilas(data);
}
