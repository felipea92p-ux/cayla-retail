// Plan de campaña ▸ Calendario (ADR-0525, tarea #7 de la auditoría, Felipe 2026-10-26, spike ①): con cuáles campañas me quedo el año. Lógica pura, sin React ni red.
//
// EL PROBLEMA. El selector ofrecía «armar plan» para TODA campaña de Catálogo ▸ Insignias (14 hoy): lo que sirve para publicar no siempre sirve para comprar (el Día
// del Gato no se compra), nadie podía decir «esta la dejo descansar hasta marzo» o «esta solo este año», y una campaña que vive solo en la compra (el Día del Padre)
// obligaba a crear una insignia en la tienda web. La base guarda ahora lo que se DECIDIÓ de cada campaña (`plan_compra_calendario`); esto la lee y dice qué vale HOY.
//
// CONTRATO
//   PROMETE: una campaña de Insignias SIN decisión se trata como «en mi plan» si ya tuvo algún plan y como «no la compro» si nunca lo tuvo; una pausada con fecha de
//            regreso vuelve sola a «en mi plan» ese día (la base no la toca: se calcula al leer); una quitada no se ofrece en ningún lado; y una campaña «solo un año»
//            cuenta únicamente en ese año. El año de una campaña es el año en que TERMINA (como en Historial y como el nombre de su plan).
//   NO HACE: no mide la historia de cada campaña (eso es `plan-compra-calendario-evidencia.ts`), no arma las listas de la pantalla (`plan-compra-calendario-vista.ts`) ni
//            decide qué campañas ofrece el selector (`ranurasSinPlan`, que llama a las reglas de aquí). No dibuja nada ni guarda nada.

import { mismaFechaEn } from "./plan-compra-historial";

export const RPC_CALENDARIO = "fn_plan_compra_calendario";
export const RPC_GUARDAR_CALENDARIO = "guardar_plan_compra_calendario";
export const RPC_USO_CALENDARIO = "cambiar_uso_plan_compra_calendario";
export const RPC_QUITAR_CALENDARIO = "quitar_plan_compra_calendario";
export const RPC_RESTAURAR_CALENDARIO = "restaurar_plan_compra_calendario";
export const RPC_PLAN_PROPIO = "crear_plan_compra_propio";

export type UsoDeCampana = "activa" | "pausada" | "no";
export type RepiteCampana = "anual" | "unica";

/** El plan de una campaña PROPIA en un año (las de Insignias traen los suyos en `fn_planes_compra`). */
export type PlanDeCampanaPropia = { id: string; nombre: string; anio: number; archivado: boolean };

/** Lo que alguien decidió de una campaña del calendario. `etiquetaId` null = una campaña PROPIA del plan (sin insignia). */
export type DecisionDeCampana = {
  id: string;
  etiquetaId: string | null;
  /** Solo las propias traen su nombre; el de una de Insignias es el de la insignia. */
  nombre: string | null;
  /** Las fechas del PLAN («mm-dd»), si no son las de la insignia; las dos o ninguna. Una propia las trae siempre. */
  desdeMd: string | null;
  hastaMd: string | null;
  uso: UsoDeCampana;
  /** Hasta cuándo descansa («aaaa-mm-dd»); solo una pausada, y puede no traerla (descansa hasta que la reactiven). */
  pausaHasta: string | null;
  repite: RepiteCampana;
  /** El año de una campaña «solo un año»; null si se repite cada año. */
  anioUnico: number | null;
  quitada: boolean;
  /** Los planes de una campaña propia, del más viejo al más nuevo. */
  planes: PlanDeCampanaPropia[];
  /** Quién la tocó por última vez, por su nombre. */
  por: string | null;
};

export type LecturaCalendario = { hoy: string; decisiones: DecisionDeCampana[] };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const mesDia = (v: unknown): string | null => (typeof v === "string" && /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(v) ? v : null);
const entero = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

/**
 * Lo que devuelve `fn_plan_compra_calendario`, sin confiar en su forma. null si no se entiende o si la base no trae la marca `soportado` (la web se publicó antes
 * que la migración): sin calendario, el selector ofrece todas las campañas como antes. Una fila que no calza se descarta (como en `leerCampanas`).
 */
export function leerCalendario(v: unknown): LecturaCalendario | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  const hoy = fechaIso(v.hoy);
  if (!hoy || !Array.isArray(v.filas)) return null;
  const decisiones = v.filas.flatMap((f): DecisionDeCampana[] => {
    if (!esObjeto(f)) return [];
    const id = texto(f.id);
    const uso = f.uso === "activa" || f.uso === "pausada" || f.uso === "no" ? f.uso : null;
    const repite = f.repite === "anual" || f.repite === "unica" ? f.repite : null;
    if (!id || !uso || !repite) return [];
    const etiquetaId = texto(f.etiqueta_id);
    const nombre = texto(f.nombre);
    // Una propia sin nombre no puede existir (la base lo cierra): antes que inventarle uno, se descarta.
    if (etiquetaId === null && nombre === null) return [];
    const anioUnico = entero(f.anio_unico);
    if (repite === "unica" && anioUnico === null) return [];
    const desdeMd = mesDia(f.desde_md);
    const hastaMd = mesDia(f.hasta_md);
    const planes = (Array.isArray(f.planes) ? f.planes : []).flatMap((p): PlanDeCampanaPropia[] => {
      if (!esObjeto(p)) return [];
      const pid = texto(p.id);
      const pnombre = texto(p.nombre);
      const anio = entero(p.anio);
      return pid && pnombre && anio !== null ? [{ id: pid, nombre: pnombre, anio, archivado: p.archivado === true }] : [];
    });
    return [
      {
        id,
        etiquetaId,
        nombre: etiquetaId === null ? nombre : null,
        desdeMd: desdeMd && hastaMd ? desdeMd : null,
        hastaMd: desdeMd && hastaMd ? hastaMd : null,
        uso,
        pausaHasta: uso === "pausada" ? fechaIso(f.pausa_hasta) : null,
        repite,
        anioUnico: repite === "unica" ? anioUnico : null,
        quitada: f.quitada === true,
        planes,
        por: texto(f.por),
      },
    ];
  });
  return { hoy, decisiones };
}

// ---------------------------------------------------------------------------------------------------------------------
// Qué vale hoy
// ---------------------------------------------------------------------------------------------------------------------

/** Lo que la campaña vale HOY: una pausada con fecha de regreso ya cumplida vuelve sola a «activa»; las demás, lo que dicen. */
export function usoEfectivo(d: Pick<DecisionDeCampana, "uso" | "pausaHasta">, hoy: string): UsoDeCampana {
  return d.uso === "pausada" && d.pausaHasta !== null && d.pausaHasta <= hoy ? "activa" : d.uso;
}

/** ¿La campaña cuenta en ese año? «Cada año» siempre; «solo un año», solo en el suyo. */
export const cuentaEnElAnio = (d: Pick<DecisionDeCampana, "repite" | "anioUnico">, anio: number): boolean => d.repite === "anual" || d.anioUnico === anio;

/** Un «mm-dd» llevado a un año; el 29 de febrero cae al 28 donde no hay año bisiesto (la misma regla que `fn_plan_compra_md_en`). */
export const fechaDeMd = (md: string, anio: number): string => mismaFechaEn(`2000-${md}`, anio);

/**
 * Las fechas del plan de una decisión, llevadas al año en que TERMINA la campaña: si el «desde» viene después del «hasta» en el calendario (20 dic a 6 ene), la
 * campaña cruza el año y su principio cae en el anterior. null si la decisión no trae fechas propias (las de la insignia mandan).
 */
export function fechasDeLaDecision(d: Pick<DecisionDeCampana, "desdeMd" | "hastaMd">, anio: number): { desde: string; hasta: string } | null {
  if (!d.desdeMd || !d.hastaMd) return null;
  return { desde: fechaDeMd(d.desdeMd, d.desdeMd > d.hastaMd ? anio - 1 : anio), hasta: fechaDeMd(d.hastaMd, anio) };
}

/** Las decisiones de las campañas de Insignias, por su etiqueta. */
export function decisionesPorEtiqueta(c: LecturaCalendario | null | undefined): Map<string, DecisionDeCampana> {
  const m = new Map<string, DecisionDeCampana>();
  for (const d of c?.decisiones ?? []) if (d.etiquetaId !== null) m.set(d.etiquetaId, d);
  return m;
}

/**
 * ¿Se le ofrece armar su plan a una campaña de Insignias? Con decisión, solo si está «en mi plan» hoy y no la quitaron. Sin decisión, solo si ya tuvo algún plan
 * (la que ya usaste sigue; la que nunca usaste espera a que la prendas en el calendario).
 */
export function seOfrece(e: { planes: readonly unknown[] }, d: DecisionDeCampana | undefined, hoy: string): boolean {
  if (d) return !d.quitada && usoEfectivo(d, hoy) === "activa";
  return e.planes.length > 0;
}

/** Las campañas PROPIAS que hoy se ofrecen: en mi plan y sin quitar. */
export const propiasQueSeOfrecen = (c: LecturaCalendario, hoy: string): DecisionDeCampana[] =>
  c.decisiones.filter((d) => d.etiquetaId === null && !d.quitada && usoEfectivo(d, hoy) === "activa");

// ---------------------------------------------------------------------------------------------------------------------
// Lo que se manda a la base
// ---------------------------------------------------------------------------------------------------------------------

/** Los argumentos del interruptor de la lista: una fila que ya existe va por su id; una insignia sin decisión, por su etiqueta (la base le crea su fila). */
export const argsInterruptor = (c: { decisionId: string | null; etiquetaId: string | null }, uso: "activa" | "no") => ({
  p_id: c.decisionId,
  p_etiqueta_id: c.decisionId ? null : c.etiquetaId,
  p_uso: uso,
});

/** Los argumentos de «quitar» (se archiva, nunca se borra). */
export const argsQuitar = (c: { decisionId: string | null; etiquetaId: string | null }) => ({ p_id: c.decisionId, p_etiqueta_id: c.decisionId ? null : c.etiquetaId });

/** Los argumentos de «restaurar»: una quitada siempre tiene su fila. */
export const argsRestaurar = (id: string) => ({ p_id: id });
