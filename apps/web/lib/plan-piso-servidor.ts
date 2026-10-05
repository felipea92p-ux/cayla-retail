import { createClient } from "@/lib/supabase/server";
import { getCapacidadPiso } from "@/lib/capacidad-piso-servidor";
import { armarPropuesta, type PropuestaMix } from "@/lib/mix-piso";
import { leerLecturaDelPiso } from "@/lib/piso-plan-servidor";
import { leerCategorias, leerGrupos, type CategoriaMix, type GrupoMix } from "@/lib/plan-piso-grupos";
import { codigoDeTienda } from "@/lib/terminales-reglas";

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

export type LecturaPropuesta = { ok: true; propuesta: PropuestaMix; capacidadProvisional: boolean } | { ok: false; motivo: string };

/**
 * La propuesta del mix de UNA sede frente a lo que cuelga y se vende (ADR-0329, actividad 12): une la lectura del motor del piso
 * (`fn_piso_plan_lectura`: lo colgado por categoría y las ventas de 14 días), la capacidad (`fn_capacidad_piso`) y los grupos, y le
 * pasa todo a `armarPropuesta` (lógica pura).
 *
 * PROMETE: la propuesta, o «no se pudo leer» con su motivo; nunca una propuesta calculada sobre un piso que no se leyó (un piso
 * vacío diría «faltan 600 prendas» sin saberlo). NUNCA lanza.
 * Si solo falla la capacidad, la propuesta sale en porcentajes y sin prendas (`capacidad: null`): es un dato secundario.
 * ASUME: la llama el servidor con la sesión de quien mira; `nombreSede` es el de la sede que se mira (decide su punto de partida).
 */
export async function getPropuestaDelMix(args: { ubicacionId: string; nombreSede: string; grupos: GrupoMix[]; categorias: CategoriaMix[] }): Promise<LecturaPropuesta> {
  try {
    const [lectura, capacidad] = await Promise.all([leerLecturaDelPiso(args.ubicacionId), getCapacidadPiso(args.ubicacionId)]);
    if (!lectura) return { ok: false, motivo: "No se pudo leer lo que cuelga y se vende en esta sede." };
    const propuesta = armarPropuesta({
      grupos: args.grupos,
      categorias: args.categorias,
      lectura,
      capacidad: capacidad?.capacidad ?? null,
      codigoSede: codigoDeTienda(args.nombreSede),
    });
    return { ok: true, propuesta, capacidadProvisional: capacidad?.provisional ?? false };
  } catch (e) {
    console.error("Plan del piso: no se pudo armar la propuesta del mix", e);
    return { ok: false, motivo: "No se pudo armar la propuesta." };
  }
}
