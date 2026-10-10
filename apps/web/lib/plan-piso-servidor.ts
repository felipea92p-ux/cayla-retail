import { createClient } from "@/lib/supabase/server";
import { getCapacidadPiso } from "@/lib/capacidad-piso-servidor";
import { leerFotos, type FotoEspacio } from "@/lib/espacio-piso";
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
 * ASUME: la llama el servidor con la sesión de quien mira (las dos funciones piden la puerta de retail y el módulo «Plan del piso»).
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

export type LecturaFotos = { ok: true; fotos: FotoEspacio[] } | { ok: false; motivo: string };

/**
 * Las fotos del espacio del piso de UNA sede (`fn_espacio_piso`, ADR-0329): lo que el cron fue guardando cada lunes.
 *
 * PROMETE: las fotos, o «no se pudo leer» con su motivo; una sede sin fotos todavía es `ok` con la lista vacía (no un error). NUNCA lanza:
 * es la pestaña «Historia» y, si falla, las demás siguen en pie.
 * ASUME: la llama el servidor con la sesión de quien mira (la función pide la puerta de retail, el módulo «Plan del piso» y la sede).
 */
export async function getFotosDelEspacio(ubicacionId: string): Promise<LecturaFotos> {
  try {
    const supabase = await createClient();
    const res = await supabase.rpc("fn_espacio_piso" as never, { p_ubicacion_id: ubicacionId } as never);
    if (res.error) {
      console.error("Plan del piso: no se pudo leer la historia del espacio", res.error.message);
      return { ok: false, motivo: "La base no respondió." };
    }
    const fotos = leerFotos(res.data);
    if (!fotos) {
      console.error("Plan del piso: la historia del espacio llegó con una forma inesperada");
      return { ok: false, motivo: "Los datos llegaron incompletos." };
    }
    return { ok: true, fotos };
  } catch (e) {
    console.error("Plan del piso: no se pudo leer la historia del espacio", e);
    return { ok: false, motivo: "La base no respondió." };
  }
}
