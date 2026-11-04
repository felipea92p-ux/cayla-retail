import { NOMBRES_MES, mesDeParametro, type Mes } from "./facturacion-reglas";
import { cambio } from "./reportes-ventas-reglas";

// Ventas ▸ Reportes ▸ Ranking de prendas: las reglas, sin React ni base (maqueta docs/maquetas/reportes-ventas-2026-11/). Lo que dice la base
// (`fn_reporte_ventas_ranking`, 20261103235000) se lee aquí una sola vez, y de aquí salen el período que pide la URL, los filtros que se aceptan,
// las cifras derivadas y la frase de «Quedan».
//
// PROMETE: (1) la URL nunca pide algo que la base rechazaría (un rango roto, un id que no es uuid, un nivel que no existe): lo que no vale vuelve a
// su valor de siempre; (2) un dato roto de la base no entra (un número que no es número vale 0); (3) un cambio contra un período sin ventas, o que empezó
// antes de que se vendiera, es `null`: «no hay con qué comparar», nunca un porcentaje de miles; (4) «para cuántos días alcanza» es `null` si no se vendió
// nada, nunca infinito.
// ASUME: que la base ya decidió qué entra al ranking (modelos registrados, de familias que entran a los motores) y qué se cuenta aparte.

export type RangoRanking = "7" | "30" | "90" | "mes" | "fechas";
export type NivelRanking = "modelo" | "variante";
export type OrdenRanking = "unidades" | "soles";

export type FiltrosRanking = {
  rango: RangoRanking;
  /** El mes, con la forma de la URL («2026-10»), cuando `rango` es «mes». */
  mes: string | null;
  /** Fechas propias («YYYY-MM-DD», `hasta` incluida), cuando `rango` es «fechas». */
  desde: string | null;
  hasta: string | null;
  tienda: string | null;
  categoria: string | null;
  marca: string | null;
  talla: string | null;
  color: string | null;
  q: string;
  nivel: NivelRanking;
  orden: OrdenRanking;
  /** Desde 0. */
  pagina: number;
};

export const POR_PAGINA = 10;
export const RANGO_POR_DEFECTO: RangoRanking = "30";
const MAX_DIAS = 400;
const MAX_LARGO_BUSQUEDA = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO_COLOR = /^[A-Za-z0-9_.-]{1,40}$/;

const uno = (v: string | string[] | undefined | null): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const uuid = (v: string | string[] | undefined | null): string | null => {
  const t = uno(v);
  return t && UUID.test(t) ? t.toLowerCase() : null;
};

const diaUtc = (iso: string): number => {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, d);
};
const aIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const DIA = 86_400_000;
const esFechaReal = (iso: string): boolean => FECHA.test(iso) && aIso(diaUtc(iso)) === iso;

/** Lo que la URL pide, ya validado: cualquier valor que no sea de la lista o del formato vuelve a su valor de siempre. */
export function filtrosDeUrl(sp: Record<string, string | string[] | undefined>): FiltrosRanking {
  const rangoPedido = uno(sp.rango);
  const rango: RangoRanking = rangoPedido === "7" || rangoPedido === "90" || rangoPedido === "mes" || rangoPedido === "fechas" ? rangoPedido : RANGO_POR_DEFECTO;
  const desde = uno(sp.desde);
  const hasta = uno(sp.hasta);
  const color = uno(sp.color);
  const pag = Number(uno(sp.pag));
  return {
    rango,
    mes: uno(sp.m),
    desde: desde && esFechaReal(desde) ? desde : null,
    hasta: hasta && esFechaReal(hasta) ? hasta : null,
    tienda: uuid(sp.tienda),
    categoria: uuid(sp.cat),
    marca: uuid(sp.marca),
    talla: uuid(sp.talla),
    color: color && CODIGO_COLOR.test(color) ? color : null,
    q: (uno(sp.q) ?? "").trim().slice(0, MAX_LARGO_BUSQUEDA),
    nivel: uno(sp.nivel) === "variante" ? "variante" : "modelo",
    orden: uno(sp.orden) === "soles" ? "soles" : "unidades",
    pagina: Number.isInteger(pag) && pag >= 0 && pag < 10_000 ? pag : 0,
  };
}

export type PeriodoRanking = {
  rango: RangoRanking;
  /** Primer día (incluido), «YYYY-MM-DD», de Lima. */
  desde: string;
  /** Día en que ya no cuenta (excluido). */
  hasta: string;
  dias: number;
  /** En palabras: «Últimos 30 días», «Octubre 2026», «Del 3 al 18 de octubre». */
  etiqueta: string;
};

const diaYMes = (iso: string): string => `${Number(iso.slice(8, 10))} de ${NOMBRES_MES[Number(iso.slice(5, 7)) - 1]!.toLowerCase()}`;

/**
 * El rango que se mide. 7, 30 y 90 días terminan HOY (hoy incluido); «mes» es un mes calendario (a la fecha si es el de hoy; uno futuro, vacío no:
 * se vuelve al de hoy); «fechas» son dos días propios, `hasta` incluida, que no pasan de hoy ni de 400 días: si no valen, se miden los últimos 30.
 */
export function periodoDe(f: Pick<FiltrosRanking, "rango" | "mes" | "desde" | "hasta">, hoy: string): PeriodoRanking {
  const manana = aIso(diaUtc(hoy) + DIA);
  const ultimosDias = (n: number): PeriodoRanking => ({ rango: String(n) as RangoRanking, desde: aIso(diaUtc(hoy) - (n - 1) * DIA), hasta: manana, dias: n, etiqueta: `Últimos ${n} días` });

  if (f.rango === "7" || f.rango === "30" || f.rango === "90") return ultimosDias(Number(f.rango));
  if (f.rango === "mes") {
    const actual: Mes = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
    const m = mesDeParametro(f.mes, actual);
    const futuro = m.anio * 12 + m.mes > actual.anio * 12 + actual.mes;
    const elegido = futuro ? actual : m;
    const desde = `${elegido.anio}-${String(elegido.mes).padStart(2, "0")}-01`;
    const sig = elegido.mes === 12 ? `${elegido.anio + 1}-01-01` : `${elegido.anio}-${String(elegido.mes + 1).padStart(2, "0")}-01`;
    const hasta = sig < manana ? sig : manana;
    return { rango: "mes", desde, hasta, dias: Math.round((diaUtc(hasta) - diaUtc(desde)) / DIA), etiqueta: `${NOMBRES_MES[elegido.mes - 1]} ${elegido.anio}` };
  }
  // fechas propias
  if (f.desde && f.hasta && f.desde <= f.hasta && f.hasta <= hoy) {
    const hastaExcl = aIso(diaUtc(f.hasta) + DIA);
    const dias = Math.round((diaUtc(hastaExcl) - diaUtc(f.desde)) / DIA);
    if (dias <= MAX_DIAS) {
      const mismoDia = f.desde === f.hasta;
      return { rango: "fechas", desde: f.desde, hasta: hastaExcl, dias, etiqueta: mismoDia ? `El ${diaYMes(f.desde)}` : `Del ${diaYMes(f.desde)} al ${diaYMes(f.hasta)}` };
    }
  }
  return ultimosDias(30);
}

/** ¿Hay algún filtro de prenda o de tienda puesto? (el período y la forma de ver no son filtros). */
export const hayFiltros = (f: FiltrosRanking): boolean => !!(f.tienda || f.categoria || f.marca || f.talla || f.color || f.q);

/** El `?…` de la pantalla para estos filtros, sin lo que vale lo de siempre (una URL corta se puede compartir). */
export function hrefRanking(f: FiltrosRanking, cambios: Partial<FiltrosRanking> = {}): string {
  const x = { ...f, ...cambios };
  const p = new URLSearchParams();
  if (x.rango !== RANGO_POR_DEFECTO) p.set("rango", x.rango);
  if (x.rango === "mes" && x.mes) p.set("m", x.mes);
  if (x.rango === "fechas") {
    if (x.desde) p.set("desde", x.desde);
    if (x.hasta) p.set("hasta", x.hasta);
  }
  if (x.tienda) p.set("tienda", x.tienda);
  if (x.categoria) p.set("cat", x.categoria);
  if (x.marca) p.set("marca", x.marca);
  if (x.talla) p.set("talla", x.talla);
  if (x.color) p.set("color", x.color);
  if (x.q) p.set("q", x.q);
  if (x.nivel !== "modelo") p.set("nivel", x.nivel);
  if (x.orden !== "unidades") p.set("orden", x.orden);
  if (x.pagina > 0) p.set("pag", String(x.pagina));
  const qs = p.toString();
  return qs ? `/vender/reportes/ranking?${qs}` : "/vender/reportes/ranking";
}

/* ---------- lo que dice la base ---------- */

export type FilaRanking = {
  pos: number;
  productoId: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  categoriaPrefijo: string | null;
  categoriaFamilia: string | null;
  marca: string | null;
  colorNombre: string | null;
  colorHex: string | null;
  talla: string | null;
  unidades: number;
  vendido: number;
  unidadesAnt: number;
  vendidoAnt: number;
  /** Lo que hay hoy en las tiendas de esta fila. */
  stock: number;
};

export type Ranking = {
  desde: string;
  hasta: string;
  anterior: { desde: string; hasta: string };
  total: { unidades: number; vendido: number };
  totalPeriodo: { unidades: number; vendido: number };
  sinRegistrar: { unidades: number; vendido: number };
  primeraVenta: string | null;
  cuantos: number;
  primerosDiez: { unidades: number; vendido: number };
  /** La fila que más vendió de TODAS (no solo de esta página): la barra de cada fila se mide contra ella. */
  mayor: { unidades: number; vendido: number };
  filas: FilaRanking[];
  tallas: { talla: string; unidades: number }[];
  colores: { codigo: string; nombre: string; hex: string | null; unidades: number }[];
};

const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const par = (v: unknown): { unidades: number; vendido: number } => {
  const o = objeto(v) ?? {};
  return { unidades: numero(o.unidades), vendido: numero(o.vendido) };
};

/** Lo que devuelve `fn_reporte_ventas_ranking`, ya validado. `null` si la forma no es la esperada; una fila rota se descarta. */
export function leerRanking(v: unknown): Ranking | null {
  const o = objeto(v);
  if (!o) return null;
  const desde = fechaIso(o.desde);
  const hasta = fechaIso(o.hasta);
  const ant = objeto(o.anterior);
  const antDesde = ant && fechaIso(ant.desde);
  const antHasta = ant && fechaIso(ant.hasta);
  if (!desde || !hasta || !antDesde || !antHasta) return null;
  const filas = lista(o.filas).flatMap((x): FilaRanking[] => {
    const f = objeto(x);
    const productoId = f && texto(f.producto_id);
    const nombre = f && texto(f.nombre);
    if (!f || !productoId || !nombre) return [];
    return [
      {
        pos: numero(f.pos),
        productoId,
        nombre,
        codigo: texto(f.codigo),
        categoria: texto(f.categoria),
        categoriaPrefijo: texto(f.categoria_prefijo),
        categoriaFamilia: texto(f.categoria_familia),
        marca: texto(f.marca),
        colorNombre: texto(f.color_nombre),
        colorHex: texto(f.color_hex),
        talla: texto(f.talla),
        unidades: numero(f.unidades),
        vendido: numero(f.vendido),
        unidadesAnt: numero(f.unidades_ant),
        vendidoAnt: numero(f.vendido_ant),
        stock: numero(f.stock),
      },
    ];
  });
  return {
    desde,
    hasta,
    anterior: { desde: antDesde, hasta: antHasta },
    total: par(o.total),
    totalPeriodo: par(o.total_periodo),
    sinRegistrar: par(o.sin_registrar),
    primeraVenta: fechaIso(o.primera_venta),
    cuantos: numero(o.cuantos),
    primerosDiez: par(o.primeros_diez),
    mayor: par(o.mayor),
    filas,
    tallas: lista(o.tallas).flatMap((x) => {
      const t = objeto(x);
      const talla = t && texto(t.talla);
      return t && talla ? [{ talla, unidades: numero(t.unidades) }] : [];
    }),
    colores: lista(o.colores).flatMap((x) => {
      const c = objeto(x);
      const codigo = c && texto(c.codigo);
      return c && codigo ? [{ codigo, nombre: texto(c.nombre) ?? codigo, hex: texto(c.hex), unidades: numero(c.unidades) }] : [];
    }),
  };
}

/* ---------- lo que se deriva ---------- */

/** ¿Se puede comparar contra el período anterior? No, si empezó antes de que se vendiera (la primera venta cae dentro de él o no hay ninguna). */
export const sePuedeComparar = (r: Pick<Ranking, "primeraVenta" | "anterior">): boolean => r.primeraVenta !== null && r.primeraVenta <= r.anterior.desde;

/** Cuánto cambió esta fila contra el período anterior, en lo que se está ordenando (prendas o soles). `null` si no hay con qué comparar. */
export function cambioDeFila(f: Pick<FilaRanking, "unidades" | "unidadesAnt" | "vendido" | "vendidoAnt">, orden: OrdenRanking, r: Pick<Ranking, "primeraVenta" | "anterior">): number | null {
  if (!sePuedeComparar(r)) return null;
  return orden === "soles" ? cambio(f.vendido, f.vendidoAnt) : cambio(f.unidades, f.unidadesAnt);
}

/** Qué parte de todo lo vendido en el período (de lo registrado, sin filtros de prenda) es esta fila (0 a 1), en lo que se ordena. `null` sin base. */
export function parteDeFila(f: Pick<FilaRanking, "unidades" | "vendido">, orden: OrdenRanking, r: Pick<Ranking, "totalPeriodo">): number | null {
  const total = orden === "soles" ? r.totalPeriodo.vendido : r.totalPeriodo.unidades;
  const mio = orden === "soles" ? f.vendido : f.unidades;
  return total > 0 ? mio / total : null;
}

/** Para cuántos días alcanza lo que queda, al ritmo del período. `null` si no se vendió nada; 0 si no queda nada. */
export function diasQueAlcanza(f: Pick<FilaRanking, "unidades" | "stock">, diasDelPeriodo: number): number | null {
  if (!(f.unidades > 0) || !(diasDelPeriodo > 0)) return null;
  if (f.stock <= 0) return 0;
  return f.stock / (f.unidades / diasDelPeriodo);
}

/** Cuántos días de lo que queda se consideran «poco»: debajo de eso, la fila lo avisa en ámbar. */
export const DIAS_DE_POCO = 14;

export type SituacionDeStock = { tipo: "sin" | "poco" | "bien"; dias: number | null };
export function situacionDeStock(f: Pick<FilaRanking, "unidades" | "stock">, diasDelPeriodo: number): SituacionDeStock {
  const dias = diasQueAlcanza(f, diasDelPeriodo);
  if (f.stock <= 0) return { tipo: "sin", dias };
  return { tipo: dias !== null && dias < DIAS_DE_POCO ? "poco" : "bien", dias };
}

/** «Para ~7 días». */
export const textoDeDias = (dias: number): string => {
  const n = Math.max(1, Math.round(dias));
  return `Para ~${n} ${n === 1 ? "día" : "días"}`;
};

/** Las tallas en el orden de siempre: XS, S, M, L, XL, XXL…; los números de menor a mayor; «Única» al final y lo demás alfabético. */
const LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
export function ordenarTallas<T extends { talla: string }>(tallas: readonly T[]): T[] {
  const clave = (t: string): [number, number, string] => {
    const u = t.trim().toUpperCase();
    const i = LETRAS.indexOf(u);
    if (i >= 0) return [0, i, u];
    if (/^\d+([.,]\d+)?$/.test(u)) return [1, Number(u.replace(",", ".")), u];
    if (u === "ÚNICA" || u === "UNICA" || u === "U") return [3, 0, u];
    return [2, 0, u];
  };
  return [...tallas].sort((a, b) => {
    const [ga, na, sa] = clave(a.talla);
    const [gb, nb, sb] = clave(b.talla);
    return ga - gb || na - nb || sa.localeCompare(sb, "es");
  });
}

export type CifrasRanking = {
  prendas: number;
  vendido: number;
  /** De todo lo registrado en el período, qué parte es lo filtrado (0 a 1). */
  parteVendida: number | null;
  cuantos: number;
  /** Qué parte de lo registrado en el período suman las 10 primeras filas (0 a 1). */
  partePrimerosDiez: number | null;
};
export function cifrasDeRanking(r: Ranking): CifrasRanking {
  const base = r.totalPeriodo.unidades;
  return {
    prendas: r.total.unidades,
    vendido: r.total.vendido,
    parteVendida: base > 0 ? r.total.unidades / base : null,
    cuantos: r.cuantos,
    partePrimerosDiez: base > 0 ? r.primerosDiez.unidades / base : null,
  };
}

/** Cuántas páginas hay para `cuantos` filas (al menos 1). */
export const totalDePaginas = (cuantos: number, porPagina = POR_PAGINA): number => Math.max(1, Math.ceil(cuantos / porPagina));

/** Qué tan larga es la barra de una fila (0 a 100), contra la que más vendió, en lo que se ordena. */
export function largoDeBarra(f: Pick<FilaRanking, "unidades" | "vendido">, orden: OrdenRanking, r: Pick<Ranking, "mayor">): number {
  const mayor = orden === "soles" ? r.mayor.vendido : r.mayor.unidades;
  const mio = orden === "soles" ? f.vendido : f.unidades;
  return mayor > 0 ? Math.min(100, (mio / mayor) * 100) : 0;
}
