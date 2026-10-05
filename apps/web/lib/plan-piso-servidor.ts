import { createClient } from "@/lib/supabase/server";
import { leerCategorias, leerGrupos, type CategoriaMix, type GrupoMix } from "@/lib/plan-piso-grupos";

export type LecturaGruposMix = { ok: true; grupos: GrupoMix[]; categorias: CategoriaMix[] } | { ok: false; motivo: string };

/**
 * Los grupos del mix y a cuál pertenece cada categoría (`fn_grupos_mix` y `fn_categorias_grupo_mix`, ADR-0329).
 *
 * PROMETE: las dos listas completas o «no se pudo leer» con su motivo; nunca una a medias ni inventada. NUNCA lanza: si la base no
 * responde, si la migración todavía no está pegada o si una lectura llega con otra forma, la pantalla dice que no pudo leer y
 * nada se pierde (la caída se anota en el log del servidor).
 * ASUME: la llama el servidor con la sesión de quien mira (las dos funciones piden la puerta de lectura de retail).
 */
export async function getGruposDelMix(): Promise<LecturaGruposMix> {
  try {
    const supabase = await createClient();
    // Las funciones son nuevas y los tipos generados no las traen todavía: se llaman por nombre y se lee la forma a mano.
    const [g, c] = await Promise.all([supabase.rpc("fn_grupos_mix" as never), supabase.rpc("fn_categorias_grupo_mix" as never)]);
    if (g.error || c.error) {
      console.error("Plan del piso: no se pudieron leer los grupos del mix", g.error?.message ?? c.error?.message);
      return { ok: false, motivo: "La base no respondió." };
    }
    const grupos = leerGrupos(g.data);
    const categorias = leerCategorias(c.data);
    if (!grupos || !categorias) {
      console.error("Plan del piso: los grupos del mix llegaron con una forma inesperada");
      return { ok: false, motivo: "Los datos llegaron incompletos." };
    }
    return { ok: true, grupos, categorias };
  } catch (e) {
    console.error("Plan del piso: no se pudieron leer los grupos del mix", e);
    return { ok: false, motivo: "La base no respondió." };
  }
}
