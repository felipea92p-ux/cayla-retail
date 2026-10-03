/**
 * «Mi meta» en el Inicio de una integrante (ADR-0318, D-149 y D-150): las reglas puras que arman lo que ve de SÍ MISMA —su
 * meta de hoy, su mes y su gráfico— con lo que devuelven `fn_mi_meta` y `fn_mis_ventas_por_dia`. Sin React ni supabase: las
 * usa `inicio.ts` en el servidor y se prueban en `mi-meta-reglas.test.ts`.
 *
 * PROMETE: solo habla de una persona (nunca recibe ni devuelve datos de otra); sin meta —la tienda no la tiene cargada, o ella no
 * tiene horas ni asistencia— devuelve `null` y el Inicio se queda como estaba: jamás dibuja «0 %» ni una meta inventada.
 * ASUME: que `fn_mi_meta` ya trae los días del mes y los últimos 7 con el ajuste de la líder aplicado, y que
 * `fn_mis_ventas_por_dia` trae TODOS los días del rango (con 0).
 */

import { avance, primerDiaDelMes, ultimoDiaDelMes, type DiaSerie } from "./rendimiento-meta-reglas";

/** Una fila de `fn_mi_meta` tal como la devuelve Postgres. */
export type FilaMiMeta = { fecha: string; meta_dia: number | string | null; meta_mes: number | string | null; base: string | null };
/** Una fila de `fn_mis_ventas_por_dia`. */
export type FilaMisVentas = { fecha: string; total: number | string; ventas: number | string };

export type MiMeta = {
  hoy: string;
  /** Sus ventas de cada día (y la parte de la meta que le tocó ese día, en `metaSede`: acá es SU meta). */
  serie: DiaSerie[];
  metaMes: number;
  /** `horas`: por sus horas programadas; `iguales`: partes iguales entre quienes marcaron asistencia. */
  base: "horas" | "iguales" | null;
};

const num = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));

/** `null` si no hay meta: sin filas de `fn_mi_meta` no hay nada que mostrar. */
export function armarMiMeta(hoy: string, meta: FilaMiMeta[], ventas: FilaMisVentas[]): MiMeta | null {
  if (meta.length === 0) return null;
  const metaMes = Math.max(...meta.map((m) => num(m.meta_mes) ?? 0));
  if (!(metaMes > 0)) return null;
  const metaPorDia = new Map(meta.map((m) => [String(m.fecha).slice(0, 10), num(m.meta_dia)]));
  const serie: DiaSerie[] = ventas
    .map((v) => ({
      fecha: String(v.fecha).slice(0, 10),
      total: Number(v.total),
      ventas: Number(v.ventas),
      metaSede: metaPorDia.get(String(v.fecha).slice(0, 10)) ?? null,
      metaAsignada: null,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const base = meta.some((m) => m.base === "horas") ? "horas" : meta.some((m) => m.base === "iguales") ? "iguales" : null;
  return { hoy, serie, metaMes, base };
}

export type ResumenMiMeta = {
  hoy: { vendido: number; ventas: number; meta: number | null; pct: number | null };
  mes: { vendido: number; ventas: number; meta: number; pct: number | null; tocabaPct: number | null };
};

export function resumirMiMeta(m: MiMeta): ResumenMiMeta {
  const hoyDia = m.serie.find((d) => d.fecha === m.hoy);
  const ini = primerDiaDelMes(m.hoy);
  const fin = ultimoDiaDelMes(m.hoy);
  const delMes = m.serie.filter((d) => d.fecha >= ini && d.fecha <= fin);
  const vendidoMes = delMes.reduce((s, d) => s + d.total, 0);
  const metaDelMes = delMes.reduce((s, d) => s + (d.metaSede ?? 0), 0);
  const metaHastaHoy = delMes.filter((d) => d.fecha <= m.hoy).reduce((s, d) => s + (d.metaSede ?? 0), 0);
  const metaHoy = hoyDia?.metaSede ?? null;
  return {
    hoy: { vendido: hoyDia?.total ?? 0, ventas: hoyDia?.ventas ?? 0, meta: metaHoy, pct: avance(hoyDia?.total ?? 0, metaHoy) },
    mes: {
      vendido: vendidoMes,
      ventas: delMes.reduce((s, d) => s + d.ventas, 0),
      meta: m.metaMes,
      pct: avance(vendidoMes, m.metaMes),
      // A hoy tocaba: la parte de SU meta de los días que ya pasaron, sobre la del mes. Sin partes por día no se inventa.
      tocabaPct: metaDelMes > 0 ? Math.round((metaHastaHoy / metaDelMes) * 100) : null,
    },
  };
}
