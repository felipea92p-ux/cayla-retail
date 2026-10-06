// Análisis v4 (ADR-0357): la pestaña «Qué pedir», sin React. La cuenta para Navidad y su riel, la mariposa «Lo que se vende y lo
// que tienes» por tipo de prenda, la curva de tallas, el ranking de lo que más se vende y «Lo que más rinde» (cuánto se ganó por
// cada S/ 1 de ropa, por tipo). Todo sale de lo que el servidor ya leyó: aquí no nace ninguna regla de negocio, solo cómo se
// cuenta y se dibuja lo de la maqueta aprobada por Felipe (2026-10-06). La lectura de «Lo que más rinde» vive en
// `analisis-rinde.ts` (servidor); la cuenta, aquí, para poder probarla.

import type { PrendaAnalisis } from "./analisis-tipos";
import { esTallaUnica, plural, totalEnTienda } from "./analisis-reglas";
import { compararTallas, tipoDeTalla, type TipoTalla } from "./tallas";
import { diasEntreFechas } from "./fechas-lima";

/* ───────── Tipo de prenda ───────── */

/** El tipo de una prenda sin categoría: también se cuenta, para que «de cada 100» sume las 100. */
export const SIN_CATEGORIA = "Sin categoría";

/** El tipo de prenda con el que se agrupa y se filtra (la categoría del catálogo). */
export const categoriaDe = (p: Pick<PrendaAnalisis, "categoria">): string => p.categoria?.trim() || SIN_CATEGORIA;

/** Desde cuántos puntos de diferencia (de cada 100) un tipo o una talla «pide más» o «sobra» (la maqueta). */
export const DIFERENCIA_QUE_SE_NOTA = 4;

/** «De cada 100», sin decimales; 0 si no hay de dónde sacar la cuenta. */
const de100 = (parte: number, total: number): number => (total > 0 ? Math.round((parte / total) * 100) : 0);

/* ───────── Campaña: cuánto falta para Navidad ───────── */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** El próximo 25 de diciembre desde `hoy` (YYYY-MM-DD): el de este año, o el del siguiente si ya pasó. El mismo día cuenta como hoy. */
export function proximaNavidad(hoy: string): string {
  const anio = Number(hoy.slice(0, 4));
  return hoy.slice(5, 10) > "12-25" ? `${anio + 1}-12-25` : `${anio}-12-25`;
}

/**
 * La cuenta regresiva de la tarjeta: semanas enteras mientras falte una o más («11 semanas para Navidad»), días en la última
 * («3 días para Navidad») y, el mismo día, sin número («Hoy es Navidad»: `valor` null).
 */
export function cuentaNavidad(hoy: string): { valor: number | null; texto: string } {
  const dias = diasEntreFechas(hoy, proximaNavidad(hoy));
  if (dias <= 0) return { valor: null, texto: "es Navidad" };
  if (dias < 7) return { valor: dias, texto: plural(dias, "día para Navidad", "días para Navidad") };
  const semanas = Math.floor(dias / 7);
  return { valor: semanas, texto: plural(semanas, "semana para Navidad", "semanas para Navidad") };
}

export type MarcaRiel = { clave: string; texto: string; pct: number };

/** El riel de la tarjeta: del 1 del mes de hoy al último día de diciembre, con hoy, cada mes del medio y Navidad en % del tramo. */
export type RielNavidad = {
  hoyPct: number;
  navidadPct: number;
  /** Los meses rotulados, cada uno en la mitad de su tramo. Con muchos meses, abreviados y uno sí, uno no (diciembre siempre). */
  meses: MarcaRiel[];
  /** Hoy y Navidad tan juntos que sus rótulos se pisarían: «Hoy» queda solo como punto (la cuenta ya lo dice). */
  juntos: boolean;
  /** Para leerlo sin verlo: «Hoy 6 de octubre, Navidad 25 de diciembre». */
  etiqueta: string;
};

/** Debajo de esta distancia (en % del riel) los rótulos «Hoy» y «Navidad» se tocan. */
const RIEL_JUNTOS = 12;

const ultimoDiaDelMes = (anio: number, mes: number): number => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const iso = (anio: number, mes: number, dia: number): string => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const redondear1 = (x: number): number => Math.round(x * 10) / 10;

export function rielNavidad(hoy: string): RielNavidad {
  const navidad = proximaNavidad(hoy);
  const anioHoy = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const anioNavidad = Number(navidad.slice(0, 4));
  const inicio = iso(anioHoy, mesHoy, 1);
  const fin = iso(anioNavidad, 12, 31);
  const total = Math.max(1, diasEntreFechas(inicio, fin));
  const pct = (fecha: string) => redondear1((diasEntreFechas(inicio, fecha) / total) * 100);

  const tramos: { anio: number; mes: number; centro: number }[] = [];
  let anio = anioHoy;
  let mes = mesHoy;
  while (anio < anioNavidad || (anio === anioNavidad && mes <= 12)) {
    const desde = diasEntreFechas(inicio, iso(anio, mes, 1));
    const hasta = diasEntreFechas(inicio, iso(anio, mes, ultimoDiaDelMes(anio, mes)));
    tramos.push({ anio, mes, centro: redondear1(((desde + hasta) / 2 / total) * 100) });
    if (mes === 12) {
      mes = 1;
      anio++;
    } else mes++;
  }
  // Hasta 4 meses caben con su nombre; hasta 7, abreviados; más (después de Navidad, todo el año), uno sí y uno no.
  const cortos = tramos.length > 4;
  const salteados = tramos.length > 7;
  const meses = tramos
    .filter((_, k) => !salteados || (tramos.length - 1 - k) % 2 === 0)
    .map((t) => ({ clave: `${t.anio}-${t.mes}`, texto: (cortos ? MESES_CORTOS : MESES)[t.mes - 1]!, pct: t.centro }));

  const hoyPct = pct(hoy);
  const navidadPct = pct(navidad);
  const fechaLarga = (f: string) => `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;
  return {
    hoyPct,
    navidadPct,
    meses,
    juntos: navidadPct - hoyPct < RIEL_JUNTOS,
    etiqueta: `Hoy ${fechaLarga(hoy)}, Navidad ${fechaLarga(navidad)}`,
  };
}

/* ───────── «Lo que se vende y lo que tienes»: la mariposa por tipo de prenda ───────── */

/** Cuántos tipos muestra la mariposa (la maqueta tiene 9); el resto, en «Otros tipos» (si sobra uno solo, se muestra él). */
export const TIPOS_EN_MARIPOSA = 10;

export type FilaMariposa = {
  categoria: string;
  /** De cada 100 unidades vendidas en 30 días en mi tienda, cuántas son de este tipo. */
  v: number;
  /** De cada 100 unidades que tengo (piso + almacén), cuántas son de este tipo. */
  t: number;
  /** «▲ pide más» (se vende más de lo que se tiene) o «sobra» (al revés); null si van parejos. */
  marca: "corto" | "sobra" | null;
};

export type Mariposa = {
  filas: FilaMariposa[];
  /** Los tipos que no entraron, sumados (sin marca ni filtro); null si entraron todos. */
  otros: { tipos: string[]; v: number; t: number } | null;
  /** El valor de la barra más larga (de las dos alas): todas se miden contra él. */
  max: number;
};

const marcaDe = (v: number, t: number): FilaMariposa["marca"] =>
  v - t >= DIFERENCIA_QUE_SE_NOTA ? "corto" : t - v >= DIFERENCIA_QUE_SE_NOTA ? "sobra" : null;

/**
 * La mariposa de MI tienda: por tipo de prenda, qué parte de lo vendido en 30 días y qué parte de lo que tengo. Entran los
 * tipos que más pesan en cualquiera de las dos alas (así un tipo que sobra no se esconde por vender poco) y se ordenan por lo
 * que se vende.
 */
export function mariposa(prendas: readonly Pick<PrendaAnalisis, "categoria" | "vendidas30" | "piso" | "almacen">[]): Mariposa {
  const porTipo = new Map<string, { vend: number; tiene: number }>();
  for (const p of prendas) {
    const vend = Math.max(0, p.vendidas30);
    const tiene = Math.max(0, totalEnTienda(p));
    if (vend === 0 && tiene === 0) continue;
    const c = categoriaDe(p);
    const a = porTipo.get(c) ?? { vend: 0, tiene: 0 };
    a.vend += vend;
    a.tiene += tiene;
    porTipo.set(c, a);
  }
  const totalV = [...porTipo.values()].reduce((s, a) => s + a.vend, 0);
  const totalT = [...porTipo.values()].reduce((s, a) => s + a.tiene, 0);
  const peso = (a: { vend: number; tiene: number }) => Math.max(totalV > 0 ? a.vend / totalV : 0, totalT > 0 ? a.tiene / totalT : 0);

  const porPeso = [...porTipo.entries()].sort(([na, a], [nb, b]) => peso(b) - peso(a) || b.vend - a.vend || na.localeCompare(nb, "es"));
  // «Otros tipos» junta dos o más: si quedara uno solo, ocupa la misma fila con su nombre (y se puede tocar).
  const tope = porPeso.length > TIPOS_EN_MARIPOSA + 1 ? TIPOS_EN_MARIPOSA : porPeso.length;
  const entran = porPeso.slice(0, tope);
  const quedan = porPeso.slice(tope);

  const filas = entran
    .map(([categoria, a]) => {
      const v = de100(a.vend, totalV);
      const t = de100(a.tiene, totalT);
      return { categoria, v, t, marca: marcaDe(v, t) };
    })
    .sort((a, b) => b.v - a.v || b.t - a.t || a.categoria.localeCompare(b.categoria, "es"));

  const otros =
    quedan.length === 0
      ? null
      : {
          tipos: quedan.map(([c]) => c),
          v: de100(
            quedan.reduce((s, [, a]) => s + a.vend, 0),
            totalV,
          ),
          t: de100(
            quedan.reduce((s, [, a]) => s + a.tiene, 0),
            totalT,
          ),
        };
  const max = Math.max(1, ...filas.flatMap((f) => [f.v, f.t]), otros?.v ?? 0, otros?.t ?? 0);
  return { filas, otros, max };
}

/* ───────── «Las tallas que se llevan» ───────── */

export type ColumnaTalla = {
  talla: string;
  /** De cada 100 vendidas (del tipo elegido, o de todo) en 30 días, cuántas de esta talla. */
  v: number;
  /** De cada 100 que tengo, cuántas de esta talla. */
  t: number;
  pideMas: boolean;
};

export type CurvaTallas =
  /** Todo lo de ese tipo se vende en talla única o estándar: no hay tallas que comparar. */
  | { tipo: "unica" }
  /** Hay tallas, pero ni ventas ni prendas que comparar (o no hay nada). */
  | { tipo: "vacia" }
  | {
      tipo: "tallas";
      columnas: ColumnaTalla[];
      /** La columna más alta: las demás se miden contra ella. */
      max: number;
      /** La talla que más se vende por encima de lo que se tiene, si se nota («Falta M»); null = parejo. */
      falta: string | null;
      /** Sin tipo elegido: qué tallas se compararon («Modelos con talla S, M y L»). */
      nota: string | null;
    };

/** «S, M y L». */
function enLista(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

const conTalla = (talla: string): boolean => !esTallaUnica(talla) && tipoDeTalla(talla) !== "unica";

/**
 * La curva de tallas: por talla, qué parte de lo vendido en 30 días y qué parte de lo que tengo. Con un tipo elegido, todas
 * sus tallas; sin tipo, solo las del sistema que más pesa en la tienda (letras S·M·L o números 26·28…: mezclarlos no se lee) y
 * una nota que lo dice. La talla única y la estándar no se comparan.
 */
export function curvaDeTallas(
  prendas: readonly Pick<PrendaAnalisis, "categoria" | "talla" | "vendidas30" | "piso" | "almacen">[],
  categoria: string | null,
): CurvaTallas {
  const delTipo = categoria === null ? prendas : prendas.filter((p) => categoriaDe(p) === categoria);
  const conMovimiento = delTipo.filter((p) => p.vendidas30 > 0 || totalEnTienda(p) > 0);
  if (conMovimiento.length === 0) return { tipo: "vacia" };
  let consideradas = conMovimiento.filter((p) => conTalla(p.talla));
  if (consideradas.length === 0) return { tipo: "unica" };

  if (categoria === null) {
    const peso = new Map<TipoTalla, number>();
    for (const p of consideradas) peso.set(tipoDeTalla(p.talla), (peso.get(tipoDeTalla(p.talla)) ?? 0) + p.vendidas30 + totalEnTienda(p));
    const orden: TipoTalla[] = ["letras", "numeracion", "otras"];
    const sistema = orden.reduce((mejor, x) => ((peso.get(x) ?? 0) > (peso.get(mejor) ?? 0) ? x : mejor), orden[0]!);
    consideradas = consideradas.filter((p) => tipoDeTalla(p.talla) === sistema);
  }

  const porTalla = new Map<string, { vend: number; tiene: number }>();
  for (const p of consideradas) {
    const k = p.talla.trim();
    const a = porTalla.get(k) ?? { vend: 0, tiene: 0 };
    a.vend += Math.max(0, p.vendidas30);
    a.tiene += Math.max(0, totalEnTienda(p));
    porTalla.set(k, a);
  }
  const totalV = [...porTalla.values()].reduce((s, a) => s + a.vend, 0);
  const totalT = [...porTalla.values()].reduce((s, a) => s + a.tiene, 0);
  const columnas = [...porTalla.entries()]
    .sort(([a], [b]) => compararTallas(a, b))
    .map(([talla, a]) => {
      const v = de100(a.vend, totalV);
      const t = de100(a.tiene, totalT);
      return { talla, v, t, pideMas: v - t >= DIFERENCIA_QUE_SE_NOTA };
    });

  // La que más se vende por encima de lo que hay; a igual diferencia, la primera en el orden de la tienda.
  const peor = columnas.reduce((a, c) => (c.v - c.t > a.v - a.t ? c : a), columnas[0]!);
  return {
    tipo: "tallas",
    columnas,
    max: Math.max(1, ...columnas.flatMap((c) => [c.v, c.t])),
    falta: peor.v - peor.t >= DIFERENCIA_QUE_SE_NOTA ? peor.talla : null,
    nota: categoria === null ? `Modelos con talla ${enLista(columnas.map((c) => c.talla))}` : null,
  };
}

/* ───────── «Lo que más se vende» ───────── */

/** Cuántas prendas muestra el ranking. */
export const PRENDAS_EN_RANKING = 8;
/** Lo que ocupa la barra más larga del ranking (deja lugar a su cifra). */
export const LARGO_RANKING = 0.82;

/** Las que más se venden en mis 30 días (del tipo elegido, si hay), de la que más a la que menos. */
export function masVendidas<T extends Pick<PrendaAnalisis, "categoria" | "vendidas30" | "nombre" | "color" | "talla">>(
  prendas: readonly T[],
  categoria: string | null,
): T[] {
  return prendas
    .filter((p) => p.vendidas30 > 0 && (categoria === null || categoriaDe(p) === categoria))
    .sort(
      (a, b) =>
        b.vendidas30 - a.vendidas30 ||
        a.nombre.localeCompare(b.nombre, "es") ||
        a.color.localeCompare(b.color, "es") ||
        compararTallas(a.talla, b.talla),
    )
    .slice(0, PRENDAS_EN_RANKING);
}

/** La venta más alta de la tienda: el ranking se mide contra ella, aunque haya un filtro (así un tipo no parece vender más). */
export const ventaMaxima = (prendas: readonly Pick<PrendaAnalisis, "vendidas30">[]): number => Math.max(1, ...prendas.map((p) => p.vendidas30));

/** Lo que queda de una prenda del ranking: agotada (rojo), 1 o 2 (ámbar) o más (verde). */
export function estadoQuedan(p: Pick<PrendaAnalisis, "piso" | "almacen">): { est: "urg" | "ate" | "bien"; texto: string } {
  const n = totalEnTienda(p);
  if (n <= 0) return { est: "urg", texto: "Agotada" };
  return { est: n <= 2 ? "ate" : "bien", texto: plural(n, "Queda 1", `Quedan ${n}`) };
}

/* ───────── «Lo que más rinde»: cuánto se ganó por cada S/ 1 de ropa, por tipo ───────── */

/** La ventana de «Lo que más rinde». */
export const DIAS_RINDE = 90;
/** Debajo de esto, «Rinde poco: compra menos» (la maqueta). */
export const RINDE_POCO = 0.5;
/** La escala mínima del gráfico (la maqueta: de S/ 0 a S/ 1.40). */
const ESCALA_RINDE_MIN = 1.4;

/** La frase de `fallas` cuando no se pudo leer (la nota de la tarjeta la reconoce). */
export const FALLA_RINDE = "No se pudo leer lo que más rinde";

/** Una fila de `fn_resumen_comparacion` (período A = los últimos 90 días), con lo que «Lo que más rinde» usa. */
export type FilaRinde = {
  categoria: string | null;
  /** Costo de cada una hoy (sin IGV); null o 0 = no se sabe. */
  costo: number | null;
  /** Venta neta del período (precio con IGV − descuento, menos devoluciones). */
  importe: number;
  /** Costo de lo vendido y de lo devuelto, con el costo de cada venta. */
  costoVentas: number;
  costoDevoluciones: number;
  /** Unidades movidas sin costo guardado en su venta. */
  udsSinCosto: number;
  /** Unidades que hubo en la tienda, en promedio, a lo largo del período. */
  totalPromedio: number;
  /** Unidades que había el primer día del período. */
  stockInicio: number;
};

const numero = (x: unknown): number => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Una fila cruda de `fn_resumen_comparacion_json` → lo que usa «Lo que más rinde». Lo que falta o no es número cuenta 0. */
export function filaRindeDe(cruda: unknown): FilaRinde {
  const r = (cruda && typeof cruda === "object" ? cruda : {}) as Record<string, unknown>;
  const costo = numero(r.costo);
  return {
    categoria: typeof r.categoria_nombre === "string" ? r.categoria_nombre : null,
    costo: costo > 0 ? costo : null,
    importe: numero(r.a_importe),
    costoVentas: numero(r.a_costo_ventas),
    costoDevoluciones: numero(r.a_costo_devoluciones),
    udsSinCosto: numero(r.a_uds_sin_costo),
    totalPromedio: numero(r.a_total_promedio),
    stockInicio: numero(r.a_stock_inicio),
  };
}

/**
 * Por tipo de prenda: lo que se ganó en el período (venta neta sin IGV − costo de lo vendido) por cada S/ 1 que hubo en ropa
 * de ese tipo, en promedio, al costo. Solo cuentan las prendas con costo (sin él no se sabe cuánto hay ni cuánto se ganó); a lo
 * vendido sin costo guardado se le pone el costo de hoy. Un tipo entra solo si ya tenía ropa el primer día del período: con
 * menos de 90 días la cuenta saldría inflada («Todavía no hay 90 días»). De la que más rinde a la que menos. La tasa del IGV
 * (0.18) la pasa quien llama: el precio de venta la incluye y el costo no.
 */
export function rindePorCategoria(filas: readonly FilaRinde[], tasaIgv: number): { categoria: string; porSol: number }[] {
  const porTipo = new Map<string, { ganancia: number; valor: number; inicio: number }>();
  for (const f of filas) {
    if (f.costo === null) continue;
    const c = f.categoria?.trim() || SIN_CATEGORIA;
    const a = porTipo.get(c) ?? { ganancia: 0, valor: 0, inicio: 0 };
    const costoVendido = f.costoVentas - f.costoDevoluciones + f.udsSinCosto * f.costo;
    a.ganancia += f.importe / (1 + tasaIgv) - costoVendido;
    a.valor += f.costo * Math.max(0, f.totalPromedio);
    a.inicio += Math.max(0, f.stockInicio);
    porTipo.set(c, a);
  }
  return [...porTipo.entries()]
    .filter(([, a]) => a.inicio > 0 && a.valor > 0)
    .map(([categoria, a]) => ({ categoria, porSol: Math.round((a.ganancia / a.valor) * 100) / 100 }))
    .sort((a, b) => b.porSol - a.porSol || a.categoria.localeCompare(b.categoria, "es"));
}

/** Hasta dónde llega el gráfico: S/ 1.40 como la maqueta, o una décima más que el que más rinde. */
export function escalaRinde(rinde: readonly { porSol: number }[]): number {
  const mayor = Math.max(0, ...rinde.map((r) => r.porSol));
  return Math.max(ESCALA_RINDE_MIN, (Math.ceil(mayor * 10 - 1e-9) + 1) / 10);
}

/** «S/ 1.30» (con signo menos si se perdió). */
export const solesRinde = (n: number): string => `S/ ${n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;

/** El tooltip de cada fila: «Por cada S/ 1 que tienes en Polos, ganaste S/ 1.10 en 90 días». */
export function tipRinde(r: { categoria: string; porSol: number }): string {
  return r.porSol < 0
    ? `Por cada S/ 1 que tienes en ${r.categoria}, perdiste ${solesRinde(-r.porSol)} en ${DIAS_RINDE} días`
    : `Por cada S/ 1 que tienes en ${r.categoria}, ganaste ${solesRinde(r.porSol)} en ${DIAS_RINDE} días`;
}

/** Qué dice la tarjeta cuando no hay nada que mostrar: si no se pudo leer, eso; si no, que todavía no alcanza. */
export function notaRindeVacio(fallas: readonly string[]): string {
  return fallas.includes(FALLA_RINDE) ? "No se pudo leer ahora." : `Todavía no hay ${DIAS_RINDE} días de ventas con su costo para medirlo.`;
}
