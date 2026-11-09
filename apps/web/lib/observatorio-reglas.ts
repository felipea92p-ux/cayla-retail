// Observatorio, el Inicio de las cuentas Admin (ADR-0322): las cuentas, puras. Sin React ni base: las usan el servidor
// (para la primera pintura), el cliente (al cambiar de periodo, de tienda, al llegar una venta y al «Repetir el día») y las
// pruebas.
//
// PROMETE: de lo que devuelve `fn_observatorio` (por tienda y día, más cada venta de hoy y las del mismo día de la semana
// pasada), las cifras de un foco (toda CAYLA o una tienda) en un periodo (hoy, 7 o 30 días) y «hasta un minuto» (el corte
// de «Repetir el día»): lo vendido, la meta, la comparación con el periodo anterior a la misma altura, las barras por hora o
// por día y la curva del % de la meta acumulado; y, al comparar, la ventaja en soles de una tienda sobre otra.
// ASUME: las tiendas abren de 10:00 a 21:00 para dibujar (una venta antes o después cae en la primera o la última hora).
// Una meta sin configurar (`null`) no se inventa: el % queda en `null` y la pantalla dice «sin meta».

import { siglaSede } from "./inicio-almacen-reglas";
import { esSiglaConMapa, type SiglaConMapa } from "./observatorio-mapa";
import { fraseRepeticion, hrefPerdidas, type Repeticion } from "./perdidas-reglas";
import { avisosDePlanilla, planillaParaElInicio, TEXTO_BANCO, type CuentaPlanilla, type TramoPlanilla } from "./planilla-salidas-reglas";
import { formatoSoles } from "./resumen-formato";

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
  /** Lo vendido acumulado, siempre en soles, en los mismos puntos de `curva`. Su último punto es `total`. */
  acumulado: [number, number][];
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
  let acumulado: [number, number][];
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
    acumulado = Array.from({ length: 12 }, (_, i) => {
      const t = Math.min(ABRE + 60 * i, Math.max(corte, ABRE));
      // El último punto llega hasta el corte: una venta después de las 9 p. m. (Arequipa cierra a las 10) también cuenta,
      // o la curva terminaría por debajo del total que la cabecera ya dice.
      const hasta = i === 11 ? Math.max(t, corte) : t;
      return [(t - ABRE) / (CIERRA - ABRE), suma(vh.filter((v) => v.min <= hasta), (v) => v.s)];
    });
    curva = acumulado.map(([x, v]) => [x, eje(v)]);
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
    acumulado = [[0, 0]];
    fechas.forEach((f, j) => {
      c += del(f).s;
      acumulado.push([(j + (f === d.hoy ? Math.max(0.02, parteDelDia) : 1)) / n, c]);
    });
    curva = acumulado.map(([x, v]) => [x, eje(v)]);
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
    acumulado,
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

/** El punto de una curva más cercano a una x (de 0 a 1): el que está mirando el mouse. */
export function indiceCercano(curva: readonly (readonly [number, number])[], x: number): number {
  let j = 0;
  let mejor = Infinity;
  curva.forEach((p, n) => {
    const d = Math.abs(p[0] - x);
    if (d < mejor) {
      mejor = d;
      j = n;
    }
  });
  return j;
}

/** Qué momento es el punto `j` de una curva: «3:00 p. m.» con «Hoy»; si no, «16 oct» («Inicio» antes del primer día). */
export function momentoDe(c: Pick<Calculo, "periodo" | "dias">, hoy: string, corte: number, j: number): string {
  if (c.periodo === "hoy") return hora12(Math.min(ABRE + 60 * j, Math.max(corte, ABRE)));
  return j === 0 ? "Inicio" : fechaCorta(sumarDias(hoy, j - c.dias));
}

/** El mismo momento, para decirlo en una frase: «el 16 oct», «las 3:00 p. m.», «la 1:00 p. m.». */
export function alMomento(c: Pick<Calculo, "periodo" | "dias">, hoy: string, corte: number, j: number): string {
  const m = momentoDe(c, hoy, corte, j);
  if (c.periodo !== "hoy") return `el ${m}`;
  return m.startsWith("1:") ? `la ${m}` : `las ${m}`;
}

// ── La ventaja: cómo va una tienda contra otra (ADR-0322, act. 2026-11-05) ───────────────────────────────────────────

export type EstadoVentaja = "sin-ventas" | "parejas" | "adelante" | "detras";
export type Ventaja = {
  /** Cuántos soles le lleva la tienda al rival en cada punto: [x de 0 a 1, soles]. Negativo: va detrás. */
  serie: [number, number][];
  /** Lo acumulado de cada lado en esos mismos puntos (el rival, en promedio si son varias). */
  propia: number[];
  rival: number[];
  /** La ventaja de ahora: el último punto de `serie`. */
  brecha: number;
  estado: EstadoVentaja;
  /** El último punto en que la tienda que hoy va adelante todavía no se despegaba. `0`: se despegó desde el inicio. */
  quiebre: number;
  /** El último punto, antes del quiebre, en que iba claramente adelante la otra. `null`: nunca. */
  otraIbaAdelante: number | null;
  pctPropia: number | null;
  /** El % de meta del rival; `null` si alguna de las comparadas no tiene meta. */
  pctRival: number | null;
};

/**
 * La ventaja de una tienda sobre otra, o sobre el promedio de varias.
 *
 * PROMETE: va en soles, así que compara también a una tienda sin meta (comparar en % de la meta se quedaba sin línea). Dos
 * tiendas van «parejas» mientras la diferencia no alcanza ni para lo que vende la mayor en un día promedio (con «Hoy», en una
 * hora): menos que eso se da vuelta con una tarde buena y no dice quién va ganando.
 * ASUME: `rivales` no incluye a `foco` (comparar una tienda con un total que la contiene no compara nada) y todos vienen del
 * mismo periodo y corte, así que sus curvas tienen los mismos puntos.
 */
export function calcularVentaja(foco: Calculo, rivales: readonly Calculo[]): Ventaja {
  const propia = foco.acumulado.map((p) => p[1]);
  const rival = propia.map((_, i) => (rivales.length ? suma(rivales, (r) => r.acumulado[i]?.[1] ?? r.total) / rivales.length : 0));
  const serie = foco.acumulado.map(([x], i): [number, number] => [x, propia[i] - rival[i]]);
  const ultimo = serie.length - 1;
  const brecha = serie[ultimo][1];
  const unidades = foco.periodo === "hoy" ? Math.max(1, foco.xAhora * 11) : foco.dias;
  const parejasHasta = Math.max(propia[ultimo], rival[ultimo]) / unidades;

  const lado = brecha >= 0 ? 1 : -1;
  let quiebre = 0;
  serie.forEach(([, s], i) => {
    if (lado * s <= parejasHasta) quiebre = i;
  });
  let otraIbaAdelante: number | null = null;
  for (let i = 0; i <= quiebre; i++) if (lado * serie[i][1] < -parejasHasta) otraIbaAdelante = i;

  const estado: EstadoVentaja =
    propia[ultimo] === 0 && rival[ultimo] === 0 ? "sin-ventas" : Math.abs(brecha) <= parejasHasta ? "parejas" : brecha > 0 ? "adelante" : "detras";
  const todasConMeta = rivales.length > 0 && rivales.every((r) => r.meta);
  return {
    serie,
    propia,
    rival,
    brecha,
    estado,
    quiebre,
    otraIbaAdelante,
    pctPropia: foco.pct,
    pctRival: todasConMeta ? (suma(rivales, (r) => r.total) / suma(rivales, (r) => r.meta ?? 0)) * 100 : null,
  };
}

/** Los nombres de la comparación. `rival: null` = el promedio de las otras tiendas. */
export type NombresVentaja = { propia: string; rival: string | null };

/** Soles con su signo, para el final de la línea: «+S/ 3,250», «−S/ 1,200», «S/ 0». */
export function solesConSigno(v: number): string {
  const r = Math.round(v);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${formatoSoles(Math.abs(r))}`;
}

/** Lo que dice la ventaja en palabras: quién va adelante, por cuánto y desde cuándo. `al` nombra un punto: «el 16 oct». */
export function fraseVentaja(v: Ventaja, n: NombresVentaja, al: (j: number) => string): { titular: string; detalle: string | null; metas: string | null } {
  const { propia, rival } = n;
  const elRival = rival ?? "el promedio de las otras";
  const aRival = rival ? `a ${rival}` : "al promedio de las otras";
  const deRival = rival ? `de ${rival}` : "del promedio de las otras";
  const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  // «las 3:00 p. m.» ya termina en punto.
  const conPunto = (t: string) => (t.endsWith(".") ? t : `${t}.`);
  const soles = formatoSoles(Math.abs(v.brecha));

  let titular: string;
  let detalle: string | null = null;
  if (v.estado === "sin-ventas") {
    titular = "Todavía no hay ventas para comparar.";
  } else if (v.estado === "parejas") {
    titular = Math.round(Math.abs(v.brecha)) >= 1 ? `${propia} y ${elRival} van parejas: ${soles} de diferencia.` : `${propia} y ${elRival} van parejas.`;
  } else {
    const adelante = v.estado === "adelante";
    titular = adelante ? `${propia} le saca ${soles} ${aRival}.` : `${propia} va ${soles} detrás ${deRival}.`;
    if (v.quiebre === 0) detalle = adelante ? "Va adelante desde el inicio." : "Va detrás desde el inicio.";
    else if (v.otraIbaAdelante !== null) detalle = conPunto(`${conMayuscula(adelante ? elRival : propia)} iba adelante hasta ${al(v.otraIbaAdelante)}`);
    else detalle = conPunto(`Iban parejas hasta ${al(v.quiebre)}`);
  }
  const metas =
    v.pctPropia !== null && v.pctRival !== null
      ? `${propia} va en ${Math.round(v.pctPropia)}% de su meta · ${rival ?? "las otras"} en ${Math.round(v.pctRival)}%`
      : null;
  return { titular, detalle, metas };
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

/** Las horas que dibuja la grilla de horas pico cuando todavía no hay ventas que la ensanchen (10:00 a 20:59). */
export const PICO_DESDE = 10;
export const PICO_HASTA = 20;

/**
 * El rango de horas (inclusive) que dibuja la grilla de horas pico: de 10 a 20 como mínimo, y se ensancha a la hora más
 * temprana y a la más tardía en que de verdad hubo ventas. Antes la grilla era fija de 10 a 20 y lo vendido a las 9 o a
 * las 10 de la noche se amontonaba, en silencio, en la columna de las 8 pm (Arequipa cierra más tarde que las otras sedes).
 */
export function rangoPico(pico: readonly { d: number; h: number; s: number }[]): { desde: number; hasta: number } {
  let desde = PICO_DESDE;
  let hasta = PICO_HASTA;
  for (const x of pico) {
    if (x.d < 1 || x.d > 7 || x.s === 0 || !Number.isFinite(x.s) || x.h < 0 || x.h > 23) continue;
    desde = Math.min(desde, x.h);
    hasta = Math.max(hasta, x.h);
  }
  return { desde, hasta };
}

/** Las horas pico en una grilla de 7 filas (lunes a domingo) por una columna por hora, de `desde` a `hasta` (inclusive). */
export function grillaPico(pico: readonly { d: number; h: number; s: number }[], desde: number = PICO_DESDE, hasta: number = PICO_HASTA): number[][] {
  const n = hasta - desde + 1;
  const g = Array.from({ length: 7 }, () => Array<number>(n).fill(0));
  for (const x of pico) {
    if (x.d < 1 || x.d > 7) continue;
    g[x.d - 1][recortar(x.h - desde, 0, n - 1)] += x.s;
  }
  return g;
}

/**
 * El color de una celda de la grilla: `t` es qué tan cerca está de la hora más fuerte (0 a 1). Va de dorado a rojo y, en
 * lo más fuerte, a rojo profundo; `h1` y `h2` son los porcentajes de mezcla y `p` la opacidad (lo flojo se ve tenue).
 */
export function tonoPico(v: number, mx: number): { t: number; h1: number; h2: number; p: number } {
  const t = mx > 0 ? recortar(v / mx, 0, 1) : 0;
  return { t, h1: Math.round(recortar(t / 0.5, 0, 1) * 100), h2: Math.round(recortar((t - 0.5) / 0.5, 0, 1) * 100), p: Math.round(32 + t * 68) };
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
  icono: "dolar" | "etiqueta" | "flecha" | "marca" | "doc" | "camara" | "sunat" | "cambio" | "alerta";
  titulo: string;
  corto: string;
  /** Cuántos tiene cada tienda (por id); `null` si el aviso es de toda la empresa. */
  porTienda: Record<string, number> | null;
  /** Días que lleva esperando el más antiguo (el aro se llena a los 7). */
  edad: number | null;
  /** A dónde lleva «Ver»; `null` si el aviso no tiene pantalla propia (el vigía de la base, ADR-0632): el detalle es la lista. */
  href: string | null;
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

const ORDEN_REPETICION: Record<Repeticion["tipo"], number> = { resta_grande: 0, prenda: 1, zona: 2 };

/** «Pérdidas que se repiten» en el Observatorio (ADR-0328 act. 14; Felipe, 2026-10-04: «avisa cuando se repite»). Es la
 *  MISMA regla del Inicio del líder (`perdidasQueSeRepiten`, últimos 30 días), leída tienda por tienda: el Admin entra aquí
 *  y no al Inicio, y sin esto el aviso no le llegaba a quien lo pidió.
 *
 *  PROMETE: el aviso al día si ninguna tienda repite; si no, «esta semana» (revisar, no urgente: no es plata que no cuadra),
 *  su reparto por tienda, el detalle (hasta 6: primero las restas grandes sin nota, después lo que más perdió) con la sigla de
 *  la tienda, y el enlace a la pestaña «Pérdidas» (de la sede elegida arriba, como todo aviso de aquí: la sede la decide solo
 *  el selector de la cabecera). ASUME: `lecturas` null = alguna tienda no se pudo leer, y entonces el aviso entero dice «no se
 *  pudo leer»: una cuenta parcial diría «al día» de una tienda que nadie miró. */
/** «Planilla pagada sin su salida del banco» en el Observatorio (ADR-0567): el Admin que paga la planilla en Dynamic entra aquí y no al
 *  Inicio del líder. La MISMA regla del Inicio (`planillaParaElInicio`). `undefined` = no hay nada que registrar (el aviso no se dibuja);
 *  `null` = no se pudo leer. El aro mide los días desde que Dynamic pagó lo más viejo que falta. */
export function avisoPlanillaObs(planilla: { tramos: readonly TramoPlanilla[]; cuentas: readonly CuentaPlanilla[] } | null, ahora: Date): AvisoObs | undefined {
  const resumen = planilla === null ? null : planillaParaElInicio(planilla.tramos);
  if (planilla !== null && resumen === null) return undefined;
  const n = resumen === null ? null : resumen.salidas + resumen.cambios;
  const lineas = planilla === null ? [] : avisosDePlanilla(planilla.tramos, planilla.cuentas).flatMap((a) => a.tramos.filter((t) => t.estado !== "registrado"));
  return {
    clave: "planilla",
    nivel: nivelPorCuenta(n, "hoy"),
    n,
    icono: "dolar",
    titulo: resumen && resumen.salidas === 0 ? "Dynamic cambió una planilla ya registrada" : "Planilla pagada sin su salida del banco",
    corto: "salidas de la planilla",
    porTienda: null,
    edad: lineas.length ? Math.max(...lineas.map((t) => diasDesde(`${t.pagadoEl}T12:00:00-05:00`, ahora))) : null,
    href: "/finanzas/dinero?sede=empresa",
    detalle: lineas.length
      ? {
          tipo: "lista",
          filas: lineas.slice(0, 6).map((t) => ({
            titulo: `${TEXTO_BANCO[t.banco]} · ${t.personas === 1 ? "1 persona" : `${t.personas} personas`}`,
            detalle: t.texto.slice(t.texto.indexOf("— ") + 2),
            chip: t.estado === "por_registrar" ? "Falta" : "Cambió",
          })),
        }
      : null,
  };
}

export function avisoPerdidasObs(
  lecturas: readonly { tienda: Pick<TiendaObs, "id" | "sigla">; repeticiones: readonly Repeticion[] }[] | null,
  hoy: string
): AvisoObs {
  const filas = (lecturas ?? [])
    .flatMap((l) => l.repeticiones.map((r) => ({ r, sigla: l.tienda.sigla })))
    .sort((x, y) => ORDEN_REPETICION[x.r.tipo] - ORDEN_REPETICION[y.r.tipo] || y.r.unidades - x.r.unidades);
  const n = lecturas === null ? null : filas.length;
  const diaDe = (r: Repeticion) => (r.tipo === "resta_grande" ? r.dia : r.ultimoDia);
  const diasHasta = (dia: string) => Math.max(0, Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86400000));
  return {
    clave: "perdidas",
    nivel: nivelPorCuenta(n, "semana"),
    n,
    icono: "alerta",
    titulo: n === 1 ? "Pérdida que se repite" : "Pérdidas que se repiten",
    corto: n === 1 ? "pérdida" : "pérdidas",
    porTienda: lecturas === null ? null : Object.fromEntries(lecturas.map((l) => [l.tienda.id, l.repeticiones.length])),
    edad: filas.length ? Math.max(...filas.map(({ r }) => diasHasta(diaDe(r)))) : null,
    href: hrefPerdidas({ periodo: "30" }),
    detalle: filas.length
      ? {
          tipo: "lista",
          filas: filas.slice(0, 6).map(({ r, sigla }) => ({
            titulo: fraseRepeticion(r),
            detalle: `${sigla} · ${fechaCorta(diaDe(r))}`,
            chip: r.tipo === "resta_grande" ? "Sin nota" : `${r.veces} días`,
          })),
        }
      : null,
  };
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
