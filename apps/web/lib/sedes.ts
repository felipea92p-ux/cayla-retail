import { createClient } from "@/lib/supabase/server";

/**
 * Mapa sede_id → { codigo, tipo }. Tras la unificación, las sedes viven en el
 * proyecto de dynamic y la app las ve por una VISTA (retail.sedes) — y las vistas
 * no soportan el "embed" de PostgREST (`... sedes(codigo)`). Como las sedes son
 * pocas (~5), se traen de una sola vez y se cruzan por código en la app.
 */
export async function mapaSedes(): Promise<Map<string, { codigo: string; tipo: string }>> {
  const supabase = await createClient();
  const { data } = await supabase.from("sedes").select("id, codigo, tipo");
  return new Map((data ?? []).map((s) => [s.id, { codigo: s.codigo, tipo: s.tipo }]));
}
