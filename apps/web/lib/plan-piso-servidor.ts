import { createClient } from "@/lib/supabase/server";
import { getCapacidadPiso, getCapacidadPisoConEstado } from "@/lib/capacidad-piso-servidor";
import { leerFotos, type FotoEspacio } from "@/lib/espacio-piso";
import { armarPropuesta, type PropuestaMix } from "@/lib/mix-piso";
import { leerLecturaDelPiso } from "@/lib/piso-plan-servidor";
import { leerCategorias, leerGrupos, type CategoriaMix, type GrupoMix } from "@/lib/plan-piso-grupos";
import { codigoDeTienda } from "@/lib/terminales-reglas";
import type { LecturaParaElInicio, PisoPlanInicio } from "@/lib/inicio-piso-reglas";
import { unstable_rethrow } from "next/navigation";

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
    unstable_rethrow(e);
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

/**
 * Lo que pide la tarjeta «Tu piso» del Inicio (ADR-0395): cuánto cuelga del riel de UNA sede frente a su capacidad y si el piso ya se cuadró.
 * Hace las mismas lecturas que `getPropuestaDelMix` y llama a la misma `armarPropuesta`, pero las TRES a la vez: la pantalla pide primero los
 * grupos y después el piso porque necesita los grupos para dibujar; la tarjeta solo necesita las cifras, y dos viajes en serie en el Inicio se notan.
 *
 * PROMETE: nunca lanza. «no aplica» si la sede no tiene propuesta (no es de las tres tiendas o no tiene piso de venta) o no tiene capacidad medida
 * (un «334» sin su «de N» no dice nada); «falló» si los grupos, el piso o la capacidad no se pudieron leer (la base no respondió).
 * ASUME: la llama el servidor SOLO si la persona ve el módulo `plan_piso`: `fn_grupos_mix` lo exige y, sin esa puerta, cada carga del Inicio dejaría un 42501 en el log.
 */
export async function getPisoDelPlanParaElInicio(args: { ubicacionId: string; nombreSede: string }): Promise<LecturaParaElInicio<PisoPlanInicio>> {
  try {
    const [grupos, lectura, capacidad] = await Promise.all([getGruposDelMix(), leerLecturaDelPiso(args.ubicacionId), getCapacidadPisoConEstado(args.ubicacionId)]);
    // «La base no respondió» y «la sede no tiene capacidad medida» se dicen distinto: lo primero es un fallo (la tarjeta lo dice), lo segundo no dibuja nada.
    if (!grupos.ok || !lectura || capacidad.estado === "fallo") return { estado: "fallo" };
    if (capacidad.estado === "sin_capacidad") return { estado: "no_aplica" };
    const propuesta = armarPropuesta({
      grupos: grupos.grupos,
      categorias: grupos.categorias,
      lectura,
      capacidad: capacidad.capacidad.capacidad,
      codigoSede: codigoDeTienda(args.nombreSede),
    });
    if (propuesta.motivoSinPropuesta !== null || propuesta.capacidad === null) return { estado: "no_aplica" };
    return {
      estado: "ok",
      datos: {
        colgadas: propuesta.colgadasEnElRiel,
        capacidad: propuesta.capacidad,
        cuadrado: propuesta.cuadrado,
        provisional: capacidad.capacidad.provisional,
        sinGrupoColgadas: propuesta.sinGrupo.colgadas,
      },
    };
  } catch (e) {
    console.error("Inicio: no se pudo leer el piso del Plan", e);
    return { estado: "fallo" };
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
    unstable_rethrow(e);
    console.error("Plan del piso: no se pudo leer la historia del espacio", e);
    return { ok: false, motivo: "La base no respondió." };
  }
}
