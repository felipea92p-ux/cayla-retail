import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import {
  construirRankingNumeroVentas,
  construirRankingSolesPorHora,
  type FilaRankingNumeroVentas,
  type FilaRankingSolesPorHora,
  type FilaRendimientoCruda,
} from "@/lib/rendimiento-reglas";

// La parte que LEE de Postgres para Rendimiento (ADR-0219): solo dice a quién preguntar y arma
// los dos rankings con las reglas de `rendimiento-reglas.ts` (puras, probadas sin base de datos).
// `fn_rendimiento_equipo` (20260929160000) trae el crudo de todas las tiendas que la cuenta ve, ya
// filtradas por `fn_rendimiento_ubicaciones` DENTRO de la base — acá no se vuelve a decidir quién
// ve qué.

export type RendimientoDeSede = {
  ubicacionId: string;
  ubicacionNombre: string;
  rankingSolesPorHora: FilaRankingSolesPorHora[];
  rankingNumeroVentas: FilaRankingNumeroVentas[];
  totalVentas: number;
  totalSoles: number;
};

/** Una fila cruda de `fn_rendimiento_equipo`, tal cual la devuelve Postgres. */
type FilaEquipoCruda = {
  ubicacion_id: string;
  ubicacion_nombre: string;
  persona_id: string;
  nombre: string;
  es_encargada: boolean;
  ventas: number;
  soles: number;
  horas: number | null;
};

/**
 * El rendimiento del mes, agrupado por sede — una entrada por cada tienda que
 * `fn_rendimiento_ubicaciones` le da a la cuenta (el Admin ve varias; el resto, como mucho una).
 * `mes`: el primer día del mes calendario (Lima) a mirar; sin fecha, el mes de hoy.
 */
export async function leerRendimientoEquipo(mes?: string): Promise<RendimientoDeSede[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_rendimiento_equipo" as never,
    { p_mes: mes ?? null } as never,
  );
  const filas = exigir({ data: data as FilaEquipoCruda[] | null, error }, "el rendimiento del equipo");

  const porSede = new Map<string, FilaEquipoCruda[]>();
  for (const f of filas) {
    const lista = porSede.get(f.ubicacion_id) ?? [];
    lista.push(f);
    porSede.set(f.ubicacion_id, lista);
  }

  return [...porSede.entries()].map(([ubicacionId, filasSede]) => {
    const crudas: FilaRendimientoCruda[] = filasSede.map((f) => ({
      personaId: f.persona_id,
      nombre: f.nombre,
      esEncargada: f.es_encargada,
      ventas: f.ventas,
      soles: Number(f.soles),
      horas: f.horas === null ? null : Number(f.horas),
    }));
    return {
      ubicacionId,
      ubicacionNombre: filasSede[0]?.ubicacion_nombre ?? "",
      rankingSolesPorHora: construirRankingSolesPorHora(crudas),
      rankingNumeroVentas: construirRankingNumeroVentas(crudas),
      totalVentas: crudas.reduce((s, f) => s + f.ventas, 0),
      totalSoles: crudas.reduce((s, f) => s + f.soles, 0),
    };
  });
}
