import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar } from "@/lib/resultado";
import { hoyLima } from "@/lib/fechas-lima";
import {
  construirRankingNumeroVentas,
  construirRankingSolesPorHora,
  type FilaRankingNumeroVentas,
  type FilaRankingSolesPorHora,
  type FilaRendimientoCruda,
} from "@/lib/rendimiento-reglas";
import { rangoDeLectura, type CambioMeta, type DiaSerie, type PersonaMeta } from "@/lib/rendimiento-meta-reglas";

// La parte que LEE de Postgres para Rendimiento (ADR-0219, ADR-0318). Dos cosas distintas:
//   · los RANKINGS del mes (`fn_rendimiento_equipo`, 20260929160000): solo quien vendió, con las reglas
//     puras de `rendimiento-reglas.ts`;
//   · el PANEL de la meta (`fn_metas_equipo`, `fn_rendimiento_serie`, `fn_metas_historial`,
//     20260930050000): una fila por persona aunque no haya vendido, con su meta y lo que lleva.
// Todo llega ya filtrado por `fn_rendimiento_ubicaciones` DENTRO de la base — acá no se vuelve a decidir
// quién ve qué.
//
// SI LA BASE TODAVÍA NO TIENE EL PANEL (la web se despliega antes que la migración, o una función falla),
// la pantalla sigue con los rankings de siempre y dice que las metas no se pudieron leer: el panel es
// una lectura secundaria (`tolerar`), no puede tumbar Rendimiento (principio 9).

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

async function leerEquipoCrudo(mes?: string): Promise<FilaEquipoCruda[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_rendimiento_equipo" as never,
    { p_mes: mes ?? null } as never,
  );
  return exigir({ data: data as FilaEquipoCruda[] | null, error }, "el rendimiento del equipo");
}

/**
 * Los rankings del mes agrupados por sede. `esEncargadaDe`: quién es encargada según el panel de metas
 * (rol con el módulo Rendimiento O líder con esa tienda, D-160); `fn_rendimiento_equipo` solo mira el rol y
 * deja sin la insignia a las encargadas que son «Líder de equipo».
 */
function armarRankings(filas: FilaEquipoCruda[], esEncargadaDe?: Map<string, boolean>): RendimientoDeSede[] {
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
      esEncargada: esEncargadaDe?.get(f.persona_id) ?? f.es_encargada,
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

/**
 * El rendimiento del mes, agrupado por sede — una entrada por cada tienda que
 * `fn_rendimiento_ubicaciones` le da a la cuenta (el Admin ve varias; el resto, como mucho una).
 * `mes`: el primer día del mes calendario (Lima) a mirar; sin fecha, el mes de hoy.
 */
export async function leerRendimientoEquipo(mes?: string): Promise<RendimientoDeSede[]> {
  return armarRankings(await leerEquipoCrudo(mes));
}

// ───────────────────────── el panel de la meta (ADR-0318) ─────────────────────────

/** Una fila cruda de `fn_metas_equipo`. */
type FilaMetasCruda = {
  ubicacion_id: string;
  persona_id: string;
  nombre: string;
  es_encargada: boolean;
  base: string | null;
  entrada_hoy: string | null;
  salida_hoy: string | null;
  horas_hoy: number | null;
  meta_auto_mes: number | null;
  meta_ajustada_mes: number | null;
  meta_mes: number | null;
  meta_hoy: number | null;
  meta_7d: number | null;
  vendido_hoy: number;
  ventas_hoy: number;
  vendido_7d: number;
  ventas_7d: number;
  vendido_mes: number;
  ventas_mes: number;
};

const num = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));

function personaDeFila(f: FilaMetasCruda): PersonaMeta {
  return {
    personaId: f.persona_id,
    nombre: f.nombre,
    esEncargada: f.es_encargada,
    base: f.base === "horas" || f.base === "iguales" ? f.base : null,
    entradaHoy: f.entrada_hoy,
    salidaHoy: f.salida_hoy,
    horasHoy: num(f.horas_hoy),
    metaAutoMes: num(f.meta_auto_mes),
    metaAjustadaMes: num(f.meta_ajustada_mes),
    metaMes: num(f.meta_mes),
    metaHoy: num(f.meta_hoy),
    meta7d: num(f.meta_7d),
    vendidoHoy: Number(f.vendido_hoy ?? 0),
    ventasHoy: Number(f.ventas_hoy ?? 0),
    vendido7d: Number(f.vendido_7d ?? 0),
    ventas7d: Number(f.ventas_7d ?? 0),
    vendidoMes: Number(f.vendido_mes ?? 0),
    ventasMes: Number(f.ventas_mes ?? 0),
  };
}

export type SedeDeRendimiento = {
  ubicacionId: string;
  nombre: string;
  /** Los dos rankings del mes; `null` si nadie de esta tienda ha vendido todavía. */
  ranking: RendimientoDeSede | null;
  personas: PersonaMeta[];
  serie: DiaSerie[];
  historial: CambioMeta[];
  /** `false`: la base no entregó el panel de metas (todavía no existe o falló); la pantalla muestra solo los rankings. */
  panelDisponible: boolean;
};

export type PantallaRendimiento = {
  hoy: string;
  sedes: SedeDeRendimiento[];
};

/**
 * Todo lo que necesita la pantalla en UNA lectura: por cada tienda, quiénes son, cuánto llevan contra su
 * meta, la serie de ventas de la semana y del mes, y (de la tienda elegida) el historial de cambios de meta.
 * Las tres vistas —Hoy, Semana, Mes— salen de esto: cambiar de una a otra no vuelve a preguntarle nada a la base.
 * `sedeElegida`: la tienda de la que se pide el historial; con una sola tienda visible, esa.
 */
export async function leerPantallaRendimiento(sedeElegida: string | null): Promise<PantallaRendimiento> {
  const hoy = hoyLima();
  const supabase = await createClient();

  const [equipoCrudo, metas] = await Promise.all([
    leerEquipoCrudo(),
    supabase.rpc("fn_metas_equipo", {}).then((r) => tolerar({ data: r.data as FilaMetasCruda[] | null, error: r.error }, "las metas de cada persona")),
  ]);

  const filasMetas = metas.datos ?? [];
  const esEncargadaDe = new Map(filasMetas.map((f) => [f.persona_id, f.es_encargada]));
  const rankings = armarRankings(equipoCrudo, esEncargadaDe);

  // Las tiendas que la cuenta ve: las de las personas (aunque nadie haya vendido) y las de los rankings.
  const nombres = new Map<string, string>(rankings.map((r) => [r.ubicacionId, r.ubicacionNombre]));
  const idsMetas = new Set(filasMetas.map((f) => f.ubicacion_id));
  const faltanNombres = [...idsMetas].filter((id) => !nombres.has(id));
  if (faltanNombres.length > 0) {
    const { data } = await supabase.from("ubicaciones").select("id, nombre").in("id", faltanNombres);
    for (const u of data ?? []) nombres.set(u.id, u.nombre);
  }
  const ids = [...new Set([...nombres.keys(), ...idsMetas])];
  const { desde, hasta } = rangoDeLectura(hoy);

  const sedes = await Promise.all(
    ids.map(async (ubicacionId): Promise<SedeDeRendimiento> => {
      const personas = filasMetas.filter((f) => f.ubicacion_id === ubicacionId).map(personaDeFila);
      const base = {
        ubicacionId,
        nombre: nombres.get(ubicacionId) ?? "Tienda",
        ranking: rankings.find((r) => r.ubicacionId === ubicacionId) ?? null,
      };
      if (metas.fallo !== null) return { ...base, personas: [], serie: [], historial: [], panelDisponible: false };

      const quiereHistorial = ids.length === 1 || ubicacionId === sedeElegida;
      const [serie, historial] = await Promise.all([
        supabase.rpc("fn_rendimiento_serie", { p_ubicacion_id: ubicacionId, p_desde: desde, p_hasta: hasta }),
        quiereHistorial ? supabase.rpc("fn_metas_historial", { p_ubicacion_id: ubicacionId }) : Promise.resolve(null),
      ]);
      // La serie es la base del gráfico y de las cifras: sin ella el panel no se dibuja a medias, se deja para otro día.
      if (serie.error) return { ...base, personas: [], serie: [], historial: [], panelDisponible: false };

      return {
        ...base,
        personas,
        serie: (serie.data ?? []).map((d) => ({
          fecha: String(d.fecha).slice(0, 10),
          total: Number(d.total),
          ventas: Number(d.ventas),
          metaSede: num(d.meta_sede),
          metaAsignada: num(d.meta_asignada),
        })),
        // El historial es un extra: si falla, el panel sigue y la lista queda vacía.
        historial: (historial?.data ?? []).map((h) => ({
          id: Number(h.id),
          personaId: h.persona_id,
          persona: h.persona,
          mes: String(h.mes).slice(0, 10),
          metaAntes: Number(h.meta_antes),
          meta: num(h.meta),
          motivo: h.motivo,
          detalle: h.detalle,
          cambiadoPor: h.cambiado_por,
          creadoEn: h.creado_en,
        })),
        panelDisponible: true,
      };
    }),
  );

  return { hoy, sedes: sedes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) };
}
