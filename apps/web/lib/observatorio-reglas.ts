// Observatorio, el Inicio de las cuentas Admin (ADR-0322): las cuentas, puras. Sin React ni base: las usan el servidor
// (para la primera pintura), el cliente (al cambiar de periodo, de tienda, al llegar una venta y al «Repetir el día») y las
// pruebas.
//
// PROMETE: de lo que devuelve `fn_observatorio` (por tienda y día, más cada venta de hoy y las del mismo día de la semana
// pasada), las cifras de un foco (toda CAYLA o una tienda) en un periodo (hoy, 7 o 30 días) y «hasta un minuto» (el corte
// de «Repetir el día»): lo vendido, la meta, la comparación con el periodo anterior a la misma altura, las barras por hora o
// por día y la curva del % de la meta acumulado.
// ASUME: las tiendas abren de 10:00 a 21:00 para dibujar (una venta antes o después cae en la primera o la última hora).
// Una meta sin configurar (`null`) no se inventa: el % queda en `null` y la pantalla dice «sin meta».

import { siglaSede } from "./inicio-almacen-reglas";
import { esSiglaConMapa, type SiglaConMapa } from "./observatorio-mapa";

export type Periodo = "hoy" | "7d" | "30d";
export type Ventana = "hoy" | "d7" | "d30";

export type TurnoObs = { id: string; nombre: string; estado: string };
export type TiendaObs = {
  id: string;
  nombre: string;
  /** «TRU», «AQP», «LIM»… (`siglaSede`). */
  sigla: string;
  /** La sigla, si la tienda tiene lugar en el mapa. */
  mapa: SiglaConMapa | null;
  cierre: string | null;
  /** Caja abierta: desde qué minuto del día y quién la abrió. `null` = cerrada. */
  caja: { desde: number; por: string } | null;
  /** Quién está en turno. `null` = no se pudo leer (Dynamic no respondió); `[]` = nadie. */
  turno: TurnoObs[] | null;
};
export type DiaObs = { u: string; f: string; s: number; t: number; p: number; m: number | null };
export type VentaHoy = { id: string; u: string; min: number; s: number; p: number; q: string };
export type VentaSemana = { u: string; min: number; s: number };
export type DatosObservatorio = {
  hoy: string;
  ahoraMin: number;
  tiendas: TiendaObs[];
  dias: DiaObs[];
  hoyVentas: VentaHoy[];
  semanaPasada: VentaSemana[];
};

export const ABRE = 600;
export const CIERRA = 1260;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const numONull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Lo que devuelve `fn_observatorio`, con sus números como números y la sigla de cada tienda. */
export function parsearObservatorio(j: unknown): DatosObservatorio {
  const o = (j ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    hoy: String(o.hoy ?? ""),
    ahoraMin: num(o.ahora_min),
    tiendas: arr(o.tiendas).map((t) => {
      const sigla = siglaSede(String(t.nombre ?? ""));
      const caja = t.caja as Record<string, unknown> | null;
      return {
        id: String(t.id),
        nombre: String(t.nombre),
        sigla,
        mapa: esSiglaConMapa(sigla) ? sigla : null,
        cierre: t.cierre ? String(t.cierre) : null,
        caja: caja ? { desde: num(caja.desde), por: String(caja.por ?? "") } : null,
        turno: Array.isArray(t.turno)
          ? (t.turno as Record<string, unknown>[]).map((p) => ({ id: String(p.id), nombre: String(p.nombre ?? ""), estado: String(p.estado ?? "") }))
          : null,
      };
    }),
    dias: arr(o.dias).map((d) => ({ u: String(d.u), f: String(d.f), s: num(d.s), t: num(d.t), p: num(d.p), m: numONull(d.m) })),
    hoyVentas: arr(o.hoy_ventas).map((v) => ({ id: String(v.id), u: String(v.u), min: num(v.min), s: num(v.s), p: num(v.p), q: String(v.q ?? "—") })),
    semanaPasada: arr(o.semana_pasada).map((v) => ({ u: String(v.u), min: num(v.min), s: num(v.s) })),
  };
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const suma = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const recortar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** La hora (0 = 10:00 … 10 = 20:00) en que cae un minuto del día. */
export const horaDe = (min: number) => recortar(Math.floor(min / 60) - 10, 0, 10);

export type Calculo = {
  foco: string;
  ids: string[];
  periodo: Periodo;
  total: number;
  tickets: number;
  prendas: number;
  /** Meta del periodo entero (un día, 7 o 30). `null` = ninguna tienda del foco tiene meta configurada. */
  meta: number | null;
  /** Lo vendido sobre la meta del periodo entero (por eso, a media tarde, hoy todavía no llega a 100). */
  pct: number | null;
  /** El periodo anterior cortado a la misma altura (hoy: el mismo día de la semana pasada a esta hora). */
  prev: number | null;
  delta: number | null;
  medio: number | null;
  /** Prendas por ticket. */
  ppt: number | null;
  /** Barras: por hora (hoy, 11) o por día (7 o 30). */
  barras: number[];
  /** Tickets y prendas en las mismas barras (los mini gráficos de «De un vistazo»). */
  barrasTickets: number[];
  barrasPrendas: number[];
  /** La misma barra del periodo anterior (la sombra). */
  sombra: number[];
  barraActual: number;
  /** Curva del % de la meta acumulado: [x de 0 a 1, %]. Sin meta, [x, soles]. */
  curva: [number, number][];
  curvaAnterior: [number, number][];
  /** Dónde está «ahora» en el eje x (0 a 1). */
  xAhora: number;
  /** Qué parte de un día típico ya pasó a esta hora (sale del mismo día de la semana pasada). */
  parteDelDia: number;
  dias: number;
};

/** Las cifras de un foco (`"TODAS"` o el id de una tienda) en un periodo, hasta el minuto `corte` de hoy. */
export function calcular(d: DatosObservatorio, foco: string, periodo: Periodo, corte: number = d.ahoraMin): Calculo {
  const ids = foco === "TODAS" ? d.tiendas.map((t) => t.id) : [foco];
  const es = new Set(ids);
  const vh = d.hoyVentas.filter((v) => es.has(v.u) && v.min <= corte);
  const sp = d.semanaPasada.filter((v) => es.has(v.u));
  const hoyS = suma(vh, (v) => v.s);
  const hoyT = vh.length;
  const hoyP = suma(vh, (v) => v.p);
  const spHasta = suma(sp.filter((v) => v.min <= corte), (v) => v.s);
  const spTotal = suma(sp, (v) => v.s);
  const parteDelDia = spTotal > 0 ? spHasta / spTotal : recortar((corte - ABRE) / (CIERRA - ABRE), 0, 1);

  const porFecha = new Map<string, { s: number; t: number; p: number; m: number | null }>();
  for (const x of d.dias) {
    if (!es.has(x.u)) continue;
    const a = porFecha.get(x.f) ?? { s: 0, t: 0, p: 0, m: null };
    a.s += x.s;
    a.t += x.t;
    a.p += x.p;
    if (x.m !== null) a.m = (a.m ?? 0) + x.m;
    porFecha.set(x.f, a);
  }
  const dia = (f: string) => porFecha.get(f) ?? { s: 0, t: 0, p: 0, m: null };

  let total: number;
  let tickets: number;
  let prendas: number;
  let meta: number | null;
  let prev: number | null;
  let barras: number[];
  let barrasTickets: number[];
  let barrasPrendas: number[];
  let sombra: number[];
  let barraActual: number;
  let curva: [number, number][];
  let curvaAnterior: [number, number][];
  let xAhora: number;
  let n = 1;

  if (periodo === "hoy") {
    total = hoyS;
    tickets = hoyT;
    prendas = hoyP;
    meta = dia(d.hoy).m;
    prev = sp.length > 0 || dia(sumarDias(d.hoy, -7)).s > 0 ? spHasta : null;
    const enLaHora = (i: number) => vh.filter((v) => horaDe(v.min) === i);
    barras = Array.from({ length: 11 }, (_, i) => suma(enLaHora(i), (v) => v.s));
    barrasTickets = Array.from({ length: 11 }, (_, i) => enLaHora(i).length);
    barrasPrendas = Array.from({ length: 11 }, (_, i) => suma(enLaHora(i), (v) => v.p));
    sombra = Array.from({ length: 11 }, (_, i) => suma(sp.filter((v) => horaDe(v.min) === i), (v) => v.s));
    barraActual = horaDe(corte);
    const eje = (v: number) => (meta ? (v / meta) * 100 : v);
    curva = Array.from({ length: 12 }, (_, i) => {
      const t = Math.min(ABRE + 60 * i, Math.max(corte, ABRE));
      return [(t - ABRE) / (CIERRA - ABRE), eje(suma(vh.filter((v) => v.min <= t), (v) => v.s))];
    });
    curvaAnterior = Array.from({ length: 12 }, (_, i) => {
      const t = ABRE + 60 * i;
      return [i / 11, eje(suma(sp.filter((v) => v.min <= t), (v) => v.s))];
    });
    xAhora = recortar((corte - ABRE) / (CIERRA - ABRE), 0, 1);
  } else {
    n = periodo === "7d" ? 7 : 30;
    const fechas = Array.from({ length: n }, (_, i) => sumarDias(d.hoy, i - (n - 1)));
    const antes = fechas.map((f) => sumarDias(f, -n));
    const del = (f: string) => (f === d.hoy ? { s: hoyS, t: hoyT, p: hoyP } : dia(f));
    total = suma(fechas, (f) => del(f).s);
    tickets = suma(fechas, (f) => del(f).t);
    prendas = suma(fechas, (f) => del(f).p);
    const metas = fechas.map((f) => dia(f).m);
    meta = metas.every((m) => m === null) ? null : suma(metas, (m) => m ?? 0);
    // El periodo anterior, cortado a la misma altura: su último día cuenta hasta esta hora (si es el mismo día de la
    // semana pasada, con sus ventas reales; si no, con la parte de un día típico que ya pasó).
    const ultimoAntes = antes[n - 1];
    const valorAntes = antes.map((f, i) => (i < n - 1 ? dia(f).s : ultimoAntes === sumarDias(d.hoy, -7) && sp.length > 0 ? spHasta : dia(f).s * parteDelDia));
    const hayAntes = antes.some((f) => porFecha.has(f) && dia(f).s > 0);
    prev = hayAntes ? suma(valorAntes, (v) => v) : null;
    barras = fechas.map((f) => del(f).s);
    barrasTickets = fechas.map((f) => del(f).t);
    barrasPrendas = fechas.map((f) => del(f).p);
    sombra = antes.map((f) => dia(f).s);
    barraActual = n - 1;
    const metaCompleta = meta;
    const eje = (v: number) => (metaCompleta ? (v / metaCompleta) * 100 : v);
    let c = 0;
    curva = [[0, 0]];
    fechas.forEach((f, j) => {
      c += del(f).s;
      curva.push([(j + (f === d.hoy ? Math.max(0.02, parteDelDia) : 1)) / n, eje(c)]);
    });
    let c2 = 0;
    curvaAnterior = [[0, 0]];
    antes.forEach((f, j) => {
      c2 += dia(f).s;
      curvaAnterior.push([(j + 1) / n, eje(c2)]);
    });
    xAhora = (n - 1 + parteDelDia) / n;
  }

  const pct = meta ? (total / meta) * 100 : null;
  return {
    foco,
    ids,
    periodo,
    total,
    tickets,
    prendas,
    meta,
    pct,
    prev,
    delta: prev !== null && prev > 0 ? (total / prev - 1) * 100 : null,
    medio: tickets ? total / tickets : null,
    ppt: tickets ? prendas / tickets : null,
    barras,
    barrasTickets,
    barrasPrendas,
    sombra,
    barraActual,
    curva,
    curvaAnterior,
    xAhora,
    parteDelDia,
    dias: n,
  };
}

/** Las tiendas ordenadas por % de la meta (las que no tienen meta, al final, por lo vendido). */
export function rankear(d: DatosObservatorio, periodo: Periodo, corte?: number): Calculo[] {
  return d.tiendas
    .map((t) => calcular(d, t.id, periodo, corte))
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.total - a.total);
}

export function ventanaDe(p: Periodo): Ventana {
  return p === "hoy" ? "hoy" : p === "7d" ? "d7" : "d30";
}

/** «hace N días» de un instante ISO, en días enteros de calendario (mínimo 0). */
export function diasDesde(iso: string, ahora: Date = new Date()): number {
  return Math.max(0, Math.floor((ahora.getTime() - new Date(iso).getTime()) / 86400000));
}

/** Una venta nueva (que no estaba en la lectura anterior), para la onda en su tienda. */
export function ventasNuevas(antes: readonly VentaHoy[], ahora: readonly VentaHoy[]): VentaHoy[] {
  const vistas = new Set(antes.map((v) => v.id));
  return ahora.filter((v) => !vistas.has(v.id));
}

// ── El panel de una tienda (lo que devuelve `fn_observatorio_tienda`, más lo que ya existía) ──────────────────────────

export type CategoriaObs = { cat: string; s: number; u: number };
export type ProductoObs = { id: string; n: string; c: string | null; hex: string | null; cat: string; u: number; s: number };
export type IntegranteObs = { id: string; n: string; s: number; t: number };
export type PorAgotarse = { nombre: string; variante: string; unidades: number; dias: number };
export type RutaObs = { origen: string; destino: string; unidades: number; enCamino: boolean; texto: string };
export type DatosTienda = {
  categorias: Record<Ventana, CategoriaObs[]>;
  productos: Record<Ventana, ProductoObs[]>;
  equipo: Record<Ventana, IntegranteObs[]>;
  /** Promedio de 4 semanas por día (1 = lunes) y hora. */
  pico: { d: number; h: number; s: number }[];
  quietas: { variantes: number; unidades: number } | null;
  /** Lo que se va a agotar (días que alcanza, con el ritmo de Existencias). `null` = no se pudo leer. */
  agotar: PorAgotarse[] | null;
  traslados: RutaObs[] | null;
};

export function parsearTienda(j: unknown): Omit<DatosTienda, "agotar" | "traslados"> {
  const o = (j ?? {}) as Record<string, unknown>;
  const porVentana = <T>(v: unknown, f: (x: Record<string, unknown>) => T): Record<Ventana, T[]> => {
    const r = (v ?? {}) as Record<string, unknown>;
    const lista = (k: Ventana) => (Array.isArray(r[k]) ? (r[k] as Record<string, unknown>[]).map(f) : []);
    return { hoy: lista("hoy"), d7: lista("d7"), d30: lista("d30") };
  };
  const q = o.quietas as Record<string, unknown> | null | undefined;
  return {
    categorias: porVentana(o.categorias, (x) => ({ cat: String(x.cat), s: num(x.s), u: num(x.u) })),
    productos: porVentana(o.productos, (x) => ({ id: String(x.id), n: String(x.n ?? ""), c: x.c ? String(x.c) : null, hex: x.hex ? String(x.hex) : null, cat: String(x.cat ?? ""), u: num(x.u), s: num(x.s) })),
    equipo: porVentana(o.equipo, (x) => ({ id: String(x.id), n: String(x.n ?? "—"), s: num(x.s), t: num(x.t) })),
    pico: Array.isArray(o.pico) ? (o.pico as Record<string, unknown>[]).map((x) => ({ d: num(x.d), h: num(x.h), s: num(x.s) })) : [],
    quietas: q ? { variantes: num(q.variantes), unidades: num(q.unidades) } : null,
  };
}

/** Las horas pico en una grilla de 7 filas (lunes a domingo) por 11 columnas (10:00 a 20:00). */
export function grillaPico(pico: readonly { d: number; h: number; s: number }[]): number[][] {
  const g = Array.from({ length: 7 }, () => Array<number>(11).fill(0));
  for (const x of pico) {
    if (x.d < 1 || x.d > 7) continue;
    g[x.d - 1][recortar(x.h - 10, 0, 10)] += x.s;
  }
  return g;
}

/** Lo que se va a agotar: variantes con ritmo medido y pocos días de stock, de la que menos dura a la que más (hasta `n`). */
export function porAgotarse(
  filas: readonly { referencia: string; color: string | null; talla: string | null; utilizable: number; dias: number | null }[],
  n = 4,
  maxDias = 14
): PorAgotarse[] {
  return filas
    .filter((f) => f.dias !== null && f.utilizable > 0 && f.dias <= maxDias)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
    .slice(0, n)
    .map((f) => ({
      nombre: f.referencia,
      variante: [f.color, f.talla].filter(Boolean).join(" · "),
      unidades: f.utilizable,
      dias: Math.max(1, Math.round(f.dias ?? 0)),
    }));
}

// ── «Por revisar» y el Taller ────────────────────────────────────────────────────────────────────────────────────────

export type NivelObs = "urg" | "hoy" | "semana" | "ok";
export type DetalleAviso =
  | { tipo: "diferencias"; filas: { sede: string; dia: string; diferencia: number }[] }
  | { tipo: "porSede"; filas: { sede: string; n: number }[]; nota: string }
  | { tipo: "tramos"; vencidas: { n: number; monto: number }; semana: { n: number; monto: number } }
  | { tipo: "rutas"; rutas: RutaObs[] }
  | { tipo: "lista"; filas: { titulo: string; detalle: string; chip: string | null }[] };
export type AvisoObs = {
  clave: string;
  nivel: NivelObs;
  /** `null` = no se pudo leer. */
  n: number | null;
  icono: "dolar" | "etiqueta" | "flecha" | "marca" | "doc" | "camara" | "sunat" | "cambio";
  titulo: string;
  corto: string;
  /** Cuántos tiene cada tienda (por id); `null` si el aviso es de toda la empresa. */
  porTienda: Record<string, number> | null;
  /** Días que lleva esperando el más antiguo (el aro se llena a los 7). */
  edad: number | null;
  href: string;
  detalle: DetalleAviso | null;
};

/** Qué tan lleno va el aro de un aviso: los días que lleva esperando el más antiguo, sobre 7. */
export function llenadoDelAro(a: Pick<AvisoObs, "nivel" | "edad">): number {
  if (a.nivel === "ok" || a.edad === null) return 0;
  return recortar(a.edad / 7, 0.08, 1);
}

/** El nivel de un aviso que solo cuenta: al día si no hay ninguno; si no, el nivel que le toca. */
export function nivelPorCuenta(n: number | null, nivel: Exclude<NivelObs, "ok">): NivelObs {
  return n === 0 ? "ok" : nivel;
}

export type TallerObs = {
  enCurso: number;
  atrasadas: number;
  /** Prendas buenas de las órdenes que se cerraron en cada ventana. */
  terminadas: Record<Ventana, number>;
  /** Avance promedio de las órdenes en curso (etapas hechas sobre el total), de 0 a 1. */
  avance: number | null;
};

// ── Formato ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export function hora12(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "p. m." : "a. m."}`;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
}

/** «Hoy · sábado 3 de octubre · 5:40 p. m.», «Últimos 7 días · 27 sep – 3 oct»… */
export function textoDelPeriodo(periodo: Periodo, hoy: string, corte: number): string {
  if (periodo === "hoy") {
    const d = new Date(`${hoy}T12:00:00Z`);
    return `Hoy · ${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} · ${hora12(corte)}`;
  }
  const n = periodo === "7d" ? 7 : 30;
  return `Últimos ${n} días · ${fechaCorta(sumarDias(hoy, -(n - 1)))} – ${fechaCorta(hoy)}`;
}

function textoVs(periodo: Periodo): string {
  return periodo === "hoy" ? "vs sáb. pasado" : periodo === "7d" ? "vs 7 días antes" : "vs 30 días antes";
}

/** El nombre del día de la semana pasada para «vs …» («vs sáb. pasado» un sábado, «vs lun. pasado» un lunes). */
export function textoVsDe(periodo: Periodo, hoy: string): string {
  if (periodo !== "hoy") return textoVs(periodo);
  const corto = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."][new Date(`${hoy}T12:00:00Z`).getUTCDay()];
  return `vs ${corto} pasado`;
}

export function formatoVariacionObs(pct: number): string {
  const r = Math.round(pct);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
}
