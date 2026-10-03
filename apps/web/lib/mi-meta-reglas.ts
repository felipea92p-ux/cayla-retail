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

import { sumarDias } from "./fechas-lima";
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

// ── «Lo que va bien» y el próximo hito (spike docs/maquetas/rendimiento-vistas-2026-10/inicio-final.html, Felipe 2026-10-03) ──────
//
// PROMETE: reconocer sin inventar. Cada logro sale de SUS ventas y SU meta; si no hay base honesta para decirlo (muestra chica, la cifra
// bajó, no hay racha) no se devuelve, y la pantalla no lo dibuja: callar vale más que un logro falso. Nunca compara con otra persona.

/** Un día cuenta como «cerca de la meta» desde este porcentaje de la meta de ese día. */
export const UMBRAL_CERCA_DE_LA_META = 0.85;
/** Ventas mínimas, en cada mes, para comparar el ticket: con menos, el promedio se mueve por una sola venta. */
export const MIN_VENTAS_PARA_COMPARAR_TICKET = 5;
/** Días con ventas mínimos para proyectar el cierre del mes. */
export const MIN_DIAS_PARA_PROYECTAR = 3;
/** Racha mínima para nombrarla: un solo día no es una racha. */
export const MIN_RACHA = 2;

/** La semana y el mes en curso, MÁS el mes anterior completo (para comparar el ticket): el rango que pide `getMiMeta`. */
export function rangoDeMiLectura(hoy: string): { desde: string; hasta: string } {
  const inicioMes = primerDiaDelMes(hoy);
  const inicioAnterior = primerDiaDelMes(sumarDias(inicioMes, -1));
  const semana = sumarDias(hoy, -6);
  const finMes = ultimoDiaDelMes(hoy);
  return { desde: [inicioAnterior, semana].sort()[0], hasta: finMes > hoy ? finMes : hoy };
}

export type Reconocimientos = {
  /** El día del mes en curso en que más vendió (solo si vendió algo); `pctMeta` es contra SU meta de ese día, si la tenía. */
  mejorDia: { fecha: string; total: number; pctMeta: number | null; esHoy: boolean } | null;
  /** Días seguidos, hacia atrás desde ayer, cerca de su meta (los días sin parte de la meta —descanso— se saltan). 0 si no hay racha. */
  racha: number;
  /** Solo si SUBIÓ: `null` si bajó, si no cambió o si alguno de los dos meses tiene muy pocas ventas. */
  ticket: { actual: number; anterior: number; subioPct: number } | null;
  /** Qué le falta para su meta del mes dicho en días de SU promedio, y dónde cierra a su ritmo. `null` sin base para decirlo. */
  hito: { falta: number; diasDePromedio: number | null; promedio: number | null; diasQueQuedan: number; proyeccion: number | null };
  /** Hoy llegó a su meta del día. */
  hoyLograda: boolean;
};

export function reconocer(m: MiMeta): Reconocimientos {
  const ini = primerDiaDelMes(m.hoy);
  const iniAnterior = primerDiaDelMes(sumarDias(ini, -1));
  const delMes = m.serie.filter((d) => d.fecha >= ini && d.fecha <= m.hoy);
  const delMesAnterior = m.serie.filter((d) => d.fecha >= iniAnterior && d.fecha < ini);

  // Mejor día del mes.
  const conVentas = delMes.filter((d) => d.total > 0);
  const mejor = conVentas.reduce<DiaSerie | null>((a, d) => (a === null || d.total > a.total ? d : a), null);
  const mejorDia = mejor
    ? { fecha: mejor.fecha, total: mejor.total, pctMeta: avance(mejor.total, mejor.metaSede), esHoy: mejor.fecha === m.hoy }
    : null;

  // Racha: hacia atrás desde AYER; hoy todavía está en juego y no la corta.
  let racha = 0;
  for (const d of [...m.serie].filter((x) => x.fecha < m.hoy).sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    if (!(d.metaSede && d.metaSede > 0)) continue; // sin parte de la meta: descansó, no corta ni suma
    if (d.total >= d.metaSede * UMBRAL_CERCA_DE_LA_META) racha += 1;
    else break;
  }

  // Ticket contra el mes pasado: solo si subió y hay muestra en los dos meses.
  const suma = (ds: DiaSerie[]) => ({ total: ds.reduce((s, d) => s + d.total, 0), ventas: ds.reduce((s, d) => s + d.ventas, 0) });
  const a = suma(delMes);
  const b = suma(delMesAnterior);
  let ticket: Reconocimientos["ticket"] = null;
  if (a.ventas >= MIN_VENTAS_PARA_COMPARAR_TICKET && b.ventas >= MIN_VENTAS_PARA_COMPARAR_TICKET) {
    const actual = a.total / a.ventas;
    const anterior = b.total / b.ventas;
    const subioPct = Math.round((actual / anterior - 1) * 100);
    if (subioPct >= 1) ticket = { actual, anterior, subioPct };
  }

  // Próximo hito: lo que falta, en días de SU promedio por día trabajado.
  const vendidoMes = a.total;
  const falta = Math.max(0, m.metaMes - vendidoMes);
  const diasTrabajados = conVentas.length;
  const promedio = diasTrabajados > 0 ? vendidoMes / diasTrabajados : null;
  const diasQueQuedan = Math.max(0, Number(ultimoDiaDelMes(m.hoy).slice(8)) - Number(m.hoy.slice(8)));
  const diasTranscurridos = Number(m.hoy.slice(8));
  const proyeccion =
    promedio !== null && diasTrabajados >= MIN_DIAS_PARA_PROYECTAR
      ? vendidoMes + promedio * Math.round(diasQueQuedan * (diasTrabajados / diasTranscurridos))
      : null;
  const hoyDia = m.serie.find((d) => d.fecha === m.hoy);
  return {
    mejorDia,
    racha: racha >= MIN_RACHA ? racha : 0,
    ticket,
    hito: { falta, diasDePromedio: promedio && falta > 0 ? falta / promedio : null, promedio, diasQueQuedan, proyeccion },
    hoyLograda: !!hoyDia?.metaSede && hoyDia.metaSede > 0 && hoyDia.total >= hoyDia.metaSede,
  };
}
