import { NOMBRES_MES } from "./facturacion-reglas";
import { soles } from "./flujo-caja-reglas";
import { NOMBRE_METODO_HISTORIAL } from "./ventas-historial-reglas";

// Ventas ▸ Reportes ▸ Ventas del mes: las reglas, sin React ni base (maqueta docs/maquetas/reportes-ventas-2026-11/). Lo que dice la base
// (`fn_reporte_ventas_mes`, 20261103230000) se lee aquí una sola vez y de aquí salen las cifras derivadas y la frase de la comparación.
//
// PROMETE: (1) `leerReporteMes` no deja pasar un dato roto: un número que no es número vale 0 y una forma que no es la esperada da `null`;
// (2) las cifras derivadas (ticket, prendas por venta, parte devuelta) son `null` cuando el divisor es 0, nunca `NaN` ni infinito;
// (3) un cambio contra un mes sin ventas es `null` («no hay con qué comparar»), nunca «+∞ %»; (4) la frase dice contra qué se compara
// (los mismos N días si el mes está en curso).
// ASUME: que la base ya hizo la cuenta de qué ventas cuentan (completadas, sin pruebas) y de cuál es el tramo; aquí no se vuelve a decidir.

/** Las cifras de un tramo de días: `desde` incluido, `hasta` excluido (fechas de Lima, «YYYY-MM-DD»). */
export type CifrasMes = { desde: string; hasta: string; vendido: number; tickets: number; unidades: number; devuelto: number };

export type ReporteMes = {
  /** El primer día del mes pedido. */
  mes: string;
  /** Hoy en Lima. */
  hoy: string;
  /** El mes pedido es el de hoy: se mide «a la fecha». */
  enCurso: boolean;
  /** El día de la primera venta que la cuenta ve (null si no hay ninguna). */
  primeraVenta: string | null;
  actual: CifrasMes;
  anterior: CifrasMes;
};

const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const fecha = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function leerCifras(v: unknown): CifrasMes | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const desde = fecha(o.desde);
  const hasta = fecha(o.hasta);
  if (!desde || !hasta) return null;
  return { desde, hasta, vendido: numero(o.vendido), tickets: numero(o.tickets), unidades: numero(o.unidades), devuelto: numero(o.devuelto) };
}

/** Lo que devuelve `fn_reporte_ventas_mes`, ya validado. `null` si la forma no es la esperada. */
export function leerReporteMes(v: unknown): ReporteMes | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const mes = fecha(o.mes);
  const hoy = fecha(o.hoy);
  const actual = leerCifras(o.actual);
  const anterior = leerCifras(o.anterior);
  if (!mes || !hoy || !actual || !anterior) return null;
  return { mes, hoy, enCurso: o.en_curso === true, primeraVenta: fecha(o.primera_venta), actual, anterior };
}

/** Lo que deja cada venta, en promedio. `null` sin ventas. */
export const ticketPromedio = (c: Pick<CifrasMes, "vendido" | "tickets">): number | null => (c.tickets > 0 ? c.vendido / c.tickets : null);

/** Cuántas prendas lleva cada venta, en promedio. `null` sin ventas. */
export const prendasPorVenta = (c: Pick<CifrasMes, "unidades" | "tickets">): number | null => (c.tickets > 0 ? c.unidades / c.tickets : null);

/** Qué parte de lo vendido se devolvió (0 a 1). `null` si no se vendió nada. */
export const parteDevuelta = (c: Pick<CifrasMes, "vendido" | "devuelto">): number | null => (c.vendido > 0 ? c.devuelto / c.vendido : null);

/** Cuánto cambió una cifra contra la del tramo anterior (0,116 = subió 11,6 %). `null` si falta alguna o la anterior es 0: no hay con qué comparar. */
export function cambio(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || !(anterior > 0)) return null;
  return actual / anterior - 1;
}

/** «+11,6 %» / «−3 %» / «igual»: un cambio menor a medio punto es «igual». Sin decimales si es entero. */
export function textoCambio(c: number | null): string {
  if (c === null) return "—";
  const pct = Math.round(c * 1000) / 10;
  if (Math.abs(pct) < 0.5) return "igual";
  const cuerpo = Math.abs(pct).toLocaleString("es-PE", { maximumFractionDigits: 1 });
  return `${pct > 0 ? "+" : "−"}${cuerpo} %`;
}

export type SentidoCambio = "sube" | "baja" | "igual" | null;
export const sentidoDe = (c: number | null): SentidoCambio => (c === null ? null : Math.abs(c * 100) < 0.5 ? "igual" : c > 0 ? "sube" : "baja");

const dia = (s: string): number => {
  const [a, m, d] = s.split("-").map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, d);
};
/** Cuántos días hay de `desde` (incluido) a `hasta` (excluido). */
export const diasDelTramo = (c: Pick<CifrasMes, "desde" | "hasta">): number => Math.max(0, Math.round((dia(c.hasta) - dia(c.desde)) / 86_400_000));

const nombreDelMes = (fechaIso: string): string => NOMBRES_MES[Number(fechaIso.slice(5, 7)) - 1]!.toLowerCase();
const capitalizada = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
/** «30 de septiembre». */
const diaYMes = (fechaIso: string): string => `${Number(fechaIso.slice(8, 10))} de ${nombreDelMes(fechaIso)}`;

export type Comparacion =
  | { hay: true; /** «septiembre» */ contra: string; /** Si el mes está en curso: cuántos días se comparan; si no, `null`. */ mismosDias: number | null; frase: string }
  | { hay: false; motivo: string };

/**
 * Contra qué se compara el mes. Un mes cerrado, contra el anterior entero (o el tramo que alcance); el mes en curso, contra los MISMOS días
 * del anterior. Sin ventas en el tramo anterior no hay con qué comparar, y el motivo dice por qué (no es lo mismo «es el primer mes» que
 * «ese mes no se vendió»).
 */
export function comparacionDe(r: ReporteMes): Comparacion {
  // El mes anterior quedó a medias: se empezó a vender DENTRO de él (el ERP es joven). Comparar un mes entero contra unos pocos días da
  // porcentajes de miles que no dicen nada, así que no se compara y se dice por qué.
  if (r.primeraVenta !== null && r.primeraVenta > r.anterior.desde && r.primeraVenta < r.actual.desde) {
    return { hay: false, motivo: `${capitalizada(nombreDelMes(r.anterior.desde))} quedó a medias: se empezó a vender el ${diaYMes(r.primeraVenta)}. No se compara.` };
  }
  if (r.anterior.vendido > 0) {
    const contra = nombreDelMes(r.anterior.desde);
    const mismosDias = r.enCurso ? diasDelTramo(r.actual) : null;
    return { hay: true, contra, mismosDias, frase: mismosDias === null ? `vs ${contra}` : `vs ${contra}, los mismos ${mismosDias} ${mismosDias === 1 ? "día" : "días"}` };
  }
  if (r.primeraVenta === null) return { hay: false, motivo: "Todavía no hay ventas." };
  if (r.primeraVenta >= r.actual.desde) return { hay: false, motivo: "Es el primer mes con ventas: no hay con qué compararlo." };
  return { hay: false, motivo: `No hubo ventas en ${nombreDelMes(r.anterior.desde)} para compararlo.` };
}

/** Lo que se está midiendo, en una línea: «el mes entero» o «a la fecha, 2 días». */
export function tramoEnPalabras(r: ReporteMes): string {
  if (!r.enCurso) return "el mes entero";
  const n = diasDelTramo(r.actual);
  return `a la fecha, ${n} ${n === 1 ? "día" : "días"}`;
}

/** El `?tienda=` de la URL: solo un id (uuid); cualquier otra cosa es «todas». */
export function tiendaDeUrl(v: string | string[] | undefined | null): string | null {
  const t = Array.isArray(v) ? v[0] : v;
  return typeof t === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t.toLowerCase() : null;
}

/** El primer día del mes que pide la base: «2026-10-01». */
export const primerDiaDelMes = ({ anio, mes }: { anio: number; mes: number }): string => `${anio}-${String(mes).padStart(2, "0")}-01`;

/* ====================================================================
   Las series de los gráficos (`fn_reporte_ventas_series`, 20261103232000): ventas por día, mes a mes y cómo se pagó.
   PROMETE: lo mismo que arriba —un dato roto no entra— y que cada gráfico sale de la MISMA lectura que las cifras (misma regla de qué cuenta).
   ASUME: que la base manda un día por cada día del tramo (con ceros) y solo los meses con ventas.
   ==================================================================== */

export type DiaVentas = { fecha: string; vendido: number; tickets: number };
export type PagoMes = { metodo: string; monto: number };
export type MesVentas = { mes: string; vendido: number; tickets: number; enCurso: boolean };
export type SeriesMes = { mes: string; hoy: string; dias: DiaVentas[]; pagos: PagoMes[]; meses: MesVentas[] };

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Lo que devuelve `fn_reporte_ventas_series`, ya validado. `null` si la forma no es la esperada; una fila rota se descarta, no tumba el gráfico. */
export function leerSeriesMes(v: unknown): SeriesMes | null {
  const o = objeto(v);
  if (!o) return null;
  const mes = fecha(o.mes);
  const hoy = fecha(o.hoy);
  if (!mes || !hoy) return null;
  const dias = lista(o.dias).flatMap((x): DiaVentas[] => {
    const d = objeto(x);
    const f = d && fecha(d.fecha);
    return d && f ? [{ fecha: f, vendido: numero(d.vendido), tickets: numero(d.tickets) }] : [];
  });
  const pagos = lista(o.pagos).flatMap((x): PagoMes[] => {
    const p = objeto(x);
    return p && typeof p.metodo === "string" && p.metodo ? [{ metodo: p.metodo, monto: numero(p.monto) }] : [];
  });
  const meses = lista(o.meses).flatMap((x): MesVentas[] => {
    const m = objeto(x);
    const f = m && fecha(m.mes);
    return m && f ? [{ mes: f, vendido: numero(m.vendido), tickets: numero(m.tickets), enCurso: m.en_curso === true }] : [];
  });
  return { mes, hoy, dias, pagos, meses };
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
/** «sábado 10». */
export function diaEnPalabras(fechaIso: string): string {
  const [a, m, d] = fechaIso.split("-").map(Number) as [number, number, number];
  return `${DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}`;
}

const pluralVentas = (n: number): string => `${n.toLocaleString("es-PE")} ${n === 1 ? "venta" : "ventas"}`;

/** Una barra de un gráfico, sin dibujo: lo que `BarrasTiempo` necesita, con el texto del globito ya armado. */
export type BarraDeReporte = { clave: string; valor: number; etiqueta: string; fuerte?: boolean; rayada?: boolean; tip: string };

/**
 * Las barras de «Ventas por día»: una por cada día del tramo. Bajo la barra va el número del día, solo en el 1, cada 5 y el último (con 31 barras
 * todas no caben, sobre todo en el celular); el globito dice «sábado 10 · S/ 6,109 · 62 ventas». El fin de semana va en negrita.
 */
export function barrasPorDia(s: SeriesMes): BarraDeReporte[] {
  const n = s.dias.length;
  return s.dias.map((d, i) => {
    const dia = Number(d.fecha.slice(8, 10));
    const sem = new Date(Date.UTC(Number(d.fecha.slice(0, 4)), Number(d.fecha.slice(5, 7)) - 1, dia)).getUTCDay();
    return {
      clave: d.fecha,
      valor: d.vendido,
      etiqueta: dia === 1 || dia % 5 === 0 || i === n - 1 ? String(dia) : "",
      fuerte: sem === 0 || sem === 6,
      tip: `${diaEnPalabras(d.fecha)} · ${soles(d.vendido)} · ${pluralVentas(d.tickets)}`,
    };
  });
}

/** El mejor día del tramo (el de más ventas), o `null` si no se vendió nada. */
export function mejorDia(s: SeriesMes): DiaVentas | null {
  let mejor: DiaVentas | null = null;
  for (const d of s.dias) if (d.vendido > 0 && (mejor === null || d.vendido > mejor.vendido)) mejor = d;
  return mejor;
}

/** El promedio diario del tramo anterior, para la raya punteada. `null` si ese tramo no se puede comparar (no hay con qué). */
export function promedioDiarioAnterior(r: ReporteMes): number | null {
  const c = comparacionDe(r);
  const dias = diasDelTramo(r.anterior);
  return c.hay && dias > 0 ? r.anterior.vendido / dias : null;
}

const MES_CORTO = NOMBRES_MES.map((m) => m.slice(0, 3));

/** Las barras de «Mes a mes»: una por mes con ventas. El mes en curso va rayado (todavía no termina). La clave es «2026-10», la de la URL. */
export function barrasPorMes(s: SeriesMes): BarraDeReporte[] {
  return s.meses.map((m) => ({
    clave: m.mes.slice(0, 7),
    valor: m.vendido,
    etiqueta: MES_CORTO[Number(m.mes.slice(5, 7)) - 1]!,
    fuerte: m.mes === s.mes,
    rayada: m.enCurso,
    tip: `${NOMBRES_MES[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(0, 4)}${m.enCurso ? " (a la fecha)" : ""} · ${soles(m.vendido)} · ${pluralVentas(m.tickets)}`,
  }));
}

// «Redondeo de efectivo» (ADR-0311) y el anticipo de los apartados no son formas de pago que se elijan: van aquí y no en el diccionario del filtro.
const NOMBRE_ESPECIAL: Record<string, string> = { anticipo: "Anticipo de apartados", redondeo: "Redondeo de efectivo" };
export const nombreDeMetodo = (metodo: string): string => NOMBRE_ESPECIAL[metodo] ?? NOMBRE_METODO_HISTORIAL[metodo] ?? metodo;
/** El token de color del medio (`--color-metodo-…`, el mismo de Ventas ▸ Historial). Un medio sin token (uno nuevo) va en taupe, nunca un hex. */
const CON_TOKEN = new Set(["efectivo", "tarjeta", "yape", "plin", "transferencia", "qr", "anticipo"]);
export const colorDeMetodo = (metodo: string): string => (CON_TOKEN.has(metodo) ? `var(--color-metodo-${metodo})` : "var(--color-taupe)");

export type TramoDePago = { metodo: string; nombre: string; monto: number; parte: number; color: string };

/**
 * Cómo se pagó: un tramo por medio, del que más al que menos. No se dibuja lo que vale 0 ni lo menor a una milésima del total (el redondeo de
 * céntimos: un tramo de S/ 0.26 sobre S/ 134,000 es «0 %» y no dice nada); el total y las partes salen de TODO lo cobrado.
 */
export function tramosDePago(s: Pick<SeriesMes, "pagos">): { total: number; tramos: TramoDePago[] } {
  const total = s.pagos.reduce((a, p) => a + (p.monto > 0 ? p.monto : 0), 0);
  if (total <= 0) return { total: 0, tramos: [] };
  const tramos = s.pagos
    .filter((p) => p.monto / total >= 0.001)
    .sort((a, b) => b.monto - a.monto)
    .map((p) => ({ metodo: p.metodo, nombre: nombreDeMetodo(p.metodo), monto: p.monto, parte: p.monto / total, color: colorDeMetodo(p.metodo) }));
  return { total, tramos };
}

/* ====================================================================
   Los cortes (`fn_reporte_ventas_cortes`, 20261103233000): el mes por tienda y por categoría.
   PROMETE: (1) un dato roto no entra (una fila sin nombre se descarta; un número que no es número vale 0); (2) la fila de «Total» sale de LAS CIFRAS
   (`ReporteMes`), no de sumar las filas, y la base garantiza que ambas coinciden (la prueba de Postgres lo exige); (3) la cola larga de categorías se
   junta en «Otras N categorías» y «Sin categoría» queda siempre al final; (4) «vs mes pasado» es `null` donde no hay con qué comparar (el mes anterior
   quedó a medias, o esa fila no vendió nada antes), nunca un porcentaje de miles.
   ==================================================================== */

export type CifrasDeFila = { vendido: number; tickets: number; unidades: number; devuelto: number };
export type FilaDeCorte = { id: string | null; nombre: string; actual: CifrasDeFila; anterior: CifrasDeFila };
export type CortesMes = { mes: string; hoy: string; tiendas: FilaDeCorte[]; categorias: FilaDeCorte[] };

function leerCifrasDeFila(v: unknown): CifrasDeFila {
  const o = objeto(v) ?? {};
  return { vendido: numero(o.vendido), tickets: numero(o.tickets), unidades: numero(o.unidades), devuelto: numero(o.devuelto) };
}
const leerFilasDeCorte = (v: unknown): FilaDeCorte[] =>
  lista(v).flatMap((x): FilaDeCorte[] => {
    const f = objeto(x);
    if (!f || typeof f.nombre !== "string" || !f.nombre) return [];
    return [{ id: typeof f.id === "string" ? f.id : null, nombre: f.nombre, actual: leerCifrasDeFila(f.actual), anterior: leerCifrasDeFila(f.anterior) }];
  });

/** Lo que devuelve `fn_reporte_ventas_cortes`, ya validado. `null` si la forma no es la esperada. */
export function leerCortesMes(v: unknown): CortesMes | null {
  const o = objeto(v);
  const mes = o && fecha(o.mes);
  const hoy = o && fecha(o.hoy);
  if (!o || !mes || !hoy) return null;
  return { mes, hoy, tiendas: leerFilasDeCorte(o.tiendas), categorias: leerFilasDeCorte(o.categorias) };
}

const sumar = (a: CifrasDeFila, b: CifrasDeFila): CifrasDeFila => ({ vendido: a.vendido + b.vendido, tickets: a.tickets + b.tickets, unidades: a.unidades + b.unidades, devuelto: a.devuelto + b.devuelto });
const CERO: CifrasDeFila = { vendido: 0, tickets: 0, unidades: 0, devuelto: 0 };

/** Cuántas categorías se ven sueltas; el resto se junta en «Otras N categorías» (con ~30 categorías, la cola vale poco y la tabla se vuelve un muro). */
export const CATEGORIAS_A_LA_VISTA = 12;

/** La clave de la fila que junta la cola de categorías. */
export const CLAVE_OTRAS = "otras";
const SIN_CATEGORIA = "Sin categoría";

/** Junta la cola: las `max` primeras con más ventas, «Otras N categorías» con el resto y «Sin categoría» (si hay) siempre al final. Una sola categoría de cola no se junta: sería una fila que dice lo mismo con otro nombre. */
export function agruparCola(filas: readonly FilaDeCorte[], max = CATEGORIAS_A_LA_VISTA): FilaDeCorte[] {
  const sin = filas.find((f) => f.nombre === SIN_CATEGORIA && f.id === null);
  const con = filas.filter((f) => f !== sin).sort((a, b) => b.actual.vendido - a.actual.vendido || a.nombre.localeCompare(b.nombre, "es"));
  const vista = con.length > max + 1 ? con.slice(0, max) : con;
  const cola = con.length > max + 1 ? con.slice(max) : [];
  const otras: FilaDeCorte[] = cola.length ? [{ id: CLAVE_OTRAS, nombre: `Otras ${cola.length} categorías`, actual: cola.reduce((a, f) => sumar(a, f.actual), CERO), anterior: cola.reduce((a, f) => sumar(a, f.anterior), CERO) }] : [];
  return [...vista, ...otras, ...(sin ? [sin] : [])];
}

export type FilaDeTabla = {
  clave: string;
  nombre: string;
  vendido: number;
  /** Qué parte del total vendido es (0 a 1); `null` si no se vendió nada. */
  parte: number | null;
  /** Cuánto cambió contra el tramo anterior; `null` donde no hay con qué comparar. */
  cambio: number | null;
  tickets: number;
  ticket: number | null;
  unidades: number;
  devuelto: number;
  /** El largo de la barra respecto de la fila que más vendió (0 a 1). */
  barra: number;
};

/**
 * Las filas de la tabla que se corta. `r` pone el total y dice si se puede comparar (`comparacionDe`): si no se puede, ninguna fila trae cambio.
 * Una fila sin ventas en el tramo anterior tampoco lo trae (de 0 a algo no hay porcentaje).
 */
export function filasDeTabla(filas: readonly FilaDeCorte[], r: ReporteMes): FilaDeTabla[] {
  const compara = comparacionDe(r).hay;
  const total = r.actual.vendido;
  const mayor = Math.max(0, ...filas.map((f) => f.actual.vendido));
  return filas.map((f) => ({
    clave: f.id ?? f.nombre,
    nombre: f.nombre,
    vendido: f.actual.vendido,
    parte: total > 0 ? f.actual.vendido / total : null,
    cambio: compara ? cambio(f.actual.vendido, f.anterior.vendido) : null,
    tickets: f.actual.tickets,
    ticket: ticketPromedio(f.actual),
    unidades: f.actual.unidades,
    devuelto: f.actual.devuelto,
    barra: mayor > 0 ? f.actual.vendido / mayor : 0,
  }));
}

/** La fila de «Total»: las cifras del mes tal cual (lo que dicen las tarjetas de arriba). */
export function totalDeTabla(r: ReporteMes): FilaDeTabla {
  const c = r.actual;
  return {
    clave: "total",
    nombre: "Total",
    vendido: c.vendido,
    parte: c.vendido > 0 ? 1 : null,
    cambio: comparacionDe(r).hay ? cambio(c.vendido, r.anterior.vendido) : null,
    tickets: c.tickets,
    ticket: ticketPromedio(c),
    unidades: c.unidades,
    devuelto: c.devuelto,
    barra: 0,
  };
}

export type CorteDeTabla = "tienda" | "categoria";

/** Qué cortes se ofrecen: por tienda solo si hay más de una a la vista (con una sola, la tabla repetiría el total). */
export const cortesOfrecidos = (c: Pick<CortesMes, "tiendas">): CorteDeTabla[] => (c.tiendas.length > 1 ? ["tienda", "categoria"] : ["categoria"]);

/** El `?corte=` de la URL, dentro de lo que se ofrece; sin él (o con uno que no se ofrece), el primero. */
export function corteDeUrl(v: string | string[] | undefined | null, ofrecidos: readonly CorteDeTabla[]): CorteDeTabla {
  const c = Array.isArray(v) ? v[0] : v;
  return ofrecidos.find((o) => o === c) ?? ofrecidos[0] ?? "categoria";
}
