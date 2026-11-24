// Análisis v4 (ADR-0357): la pestaña «Qué pedir», sin React. La cuenta para Navidad y su riel, la mariposa «Lo que se vende y lo
// que tienes» por tipo de prenda, la curva de tallas, el ranking de lo que más se vende y «Lo que más rinde» (cuánto se ganó por
// cada S/ 1 de ropa, por tipo). Todo sale de lo que el servidor ya leyó: aquí no nace ninguna regla de negocio, solo cómo se
// cuenta y se dibuja lo de la maqueta aprobada por Felipe (2026-10-06). La lectura de «Lo que más rinde» vive en
// `analisis-rinde.ts` (servidor); la cuenta, aquí, para poder probarla.

import type { PrendaAnalisis } from "./analisis-tipos";
import type { FiltrosAnalisis } from "./analisis-filtros";
import type { ModeloAnalisis } from "./analisis-modelo";
import { DIAS_MINIMOS_RITMO, DIAS_SE_ACABA, esTallaUnica, nuncaSalio, otraSedeQueLaTiene, plural, totalEnTienda } from "./analisis-reglas";
import { textoViene } from "./analisis-acaba";
import { compararTallas, tipoDeTalla, type TipoTalla } from "./tallas";
import { diasEntreFechas, sumarDias } from "./fechas-lima";
import { fechaCorta } from "./motor-demanda-reglas";

/* ───────── Tipo de prenda ───────── */

/** El tipo de una prenda sin categoría: también se cuenta, para que las partes de las tallas sumen las 100. */
export const SIN_CATEGORIA = "Sin categoría";

/** El tipo de prenda con el que se agrupa y se filtra (la categoría del catálogo). */
export const categoriaDe = (p: Pick<PrendaAnalisis, "categoria">): string => p.categoria?.trim() || SIN_CATEGORIA;

/** Desde cuántos puntos de diferencia (de cada 100) un tipo o una talla «pide más» o «sobra» (la maqueta). */
export const DIFERENCIA_QUE_SE_NOTA = 4;

/** «De cada 100», sin decimales; 0 si no hay de dónde sacar la cuenta. */
const de100 = (parte: number, total: number): number => (total > 0 ? Math.round((parte / total) * 100) : 0);

/* ───────── Campaña: cuánto falta para Navidad ───────── */


/** El próximo 25 de diciembre desde `hoy` (YYYY-MM-DD): el de este año, o el del siguiente si ya pasó. El mismo día cuenta como hoy. */
export function proximaNavidad(hoy: string): string {
  const anio = Number(hoy.slice(0, 4));
  return hoy.slice(5, 10) > "12-25" ? `${anio + 1}-12-25` : `${anio}-12-25`;
}

/* ───────── «¿Para cuánto te alcanza?»: por tipo de prenda, contra Navidad (Felipe, 2026-10-07, B2) ───────── */

/** Los días que faltan para la próxima Navidad (el mismo día, 0): la meta contra la que se mide lo que tienes. */
export const diasANavidad = (hoy: string): number => Math.max(0, diasEntreFechas(hoy, proximaNavidad(hoy)));

export type AlcanceTipo = {
  categoria: string;
  prefijo: string | null;
  familia: string | null;
  /** Lo que se vendió del tipo en los días de ventas de la tienda: con su prenda y sin registrar. */
  vendidas: number;
  /** De lo vendido, cuántas se cobraron sin su prenda (anotadas en caja con su tipo): ya están dentro de `vendidas`. */
  sinPrenda: number;
  /** Lo que tienes del tipo hoy (libre, piso + almacén). */
  tiene: number;
  /** De lo que tienes, cuántas unidades nunca salieron al piso; null si la base todavía no lo sabe. */
  nunca: number | null;
  /** Para cuántos días te alcanza al ritmo de los días de ventas (0 = ya no hay); null si no se vendió: no tiene ritmo. */
  dias: number | null;
  /** No llega a Navidad: pídelo. */
  pide: boolean;
};

/**
 * Por tipo de prenda, para cuánto te alcanza lo que tienes al ritmo de lo vendido en los días de ventas de la tienda (hasta 30):
 * lo que tienes entre lo que vendes por día. Pide lo que no llega a Navidad. Del que menos dura al que más; lo que no se vendió, al
 * final (sin ritmo no se sabe para cuánto alcanza). Reemplaza a la mariposa «de cada 100» (Felipe, 2026-10-07: «no sé si es de los
 * últimos 30 días o desde siempre»): habla en semanas y dice de qué días. Con los MODELOS (ADR-0357, decisión 12), «nunca salió»
 * cuenta solo lo del modelo del que nada se colgó: la talla guardada de un modelo colgado ya está presentada.
 */
export function alcancePorTipo(
  prendas: readonly Pick<PrendaAnalisis, "categoria" | "categoriaPrefijo" | "categoriaFamilia" | "vendidas30" | "piso" | "almacen" | "salioAlPiso" | "diasDeVentas">[],
  diasDeVentas: number,
  hastaNavidad: number,
  sabePiso: boolean,
  sinPrenda: Readonly<Record<string, number>> = {},
): AlcanceTipo[] {
  // El ritmo del tipo es la suma del de sus prendas, cada una en su ventana (2026-10-14: los días que estuvo colgada, `ventanaDeRitmo`);
  // lo vendido sin registrar no tiene prenda ni ventana propia: va en los días de ventas de la tienda. Sin ventana propia, la de la tienda.
  const ventana = Math.min(30, Math.max(1, Math.round(diasDeVentas)));
  const ventanaDe = (p: { diasDeVentas?: number }) => Math.min(30, Math.max(1, Math.round(p.diasDeVentas ?? ventana)));
  const ritmo = new Map<string, number>();
  const porTipo = new Map<string, AlcanceTipo>();
  const nuevo = (c: string, p: (typeof prendas)[number]): AlcanceTipo =>
    ({ categoria: c, prefijo: p.categoriaPrefijo, familia: p.categoriaFamilia, vendidas: 0, sinPrenda: 0, tiene: 0, nunca: sabePiso ? 0 : null, dias: null, pide: false });
  // Una prenda de cada tipo que la tienda tiene, aunque hoy no tenga ni venta ni stock: el tipo existe para sumarle lo vendido sin registrar.
  const delTipo = new Map<string, (typeof prendas)[number]>();
  for (const p of prendas) {
    const c = categoriaDe(p);
    if (!delTipo.has(c)) delTipo.set(c, p);
    const vend = Math.max(0, p.vendidas30);
    const tiene = Math.max(0, totalEnTienda(p));
    if (vend === 0 && tiene === 0) continue;
    const a = porTipo.get(c) ?? nuevo(c, p);
    a.vendidas += vend;
    ritmo.set(c, (ritmo.get(c) ?? 0) + vend / ventanaDe(p));
    a.tiene += tiene;
    if (a.nunca !== null && nuncaSalio(p)) a.nunca += p.almacen;
    porTipo.set(c, a);
  }
  // Lo vendido sin registrar de cada tipo (ADR-0357, act. 2026-10-14): la venta no dice qué prenda fue, pero sí de qué tipo, así que
  // cuenta en el ritmo del tipo. Sin esto, un tipo que se registra poco (un tercio de sus ventas) parecía durar el triple y «llegaba» a
  // Navidad sin llegar. Solo en los tipos que la tienda tiene: de un tipo sin ninguna prenda registrada no se sabe cuánto hay
  // (`tiposSinRegistrar` los nombra aparte).
  for (const [nombre, n] of Object.entries(sinPrenda)) {
    const c = nombre.trim() || SIN_CATEGORIA;
    const muestra = delTipo.get(c);
    if (!muestra || !(n > 0)) continue;
    const a = porTipo.get(c) ?? nuevo(c, muestra);
    a.vendidas += n;
    a.sinPrenda += n;
    ritmo.set(c, (ritmo.get(c) ?? 0) + n / ventana);
    porTipo.set(c, a);
  }
  return [...porTipo.values()]
    .map((a) => {
      const porDia = ritmo.get(a.categoria) ?? 0;
      const dias = a.vendidas > 0 && porDia > 0 ? a.tiene / porDia : null;
      return { ...a, dias, pide: dias !== null && dias < hastaNavidad };
    })
    .sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity) || b.tiene - a.tiene || a.categoria.localeCompare(b.categoria, "es"));
}

/**
 * Los tipos que se vendieron sin registrar y que la tienda no tiene en Análisis (ninguna prenda suya con stock, ventas o llegadas): no se
 * sabe para cuánto alcanzan, porque el sistema no tiene cuánto hay. Se nombran aparte para que esa venta no desaparezca en silencio. Del
 * que más se vendió al que menos.
 */
export function tiposSinRegistrar(
  prendas: readonly Pick<PrendaAnalisis, "categoria">[],
  sinPrenda: Readonly<Record<string, number>>,
): { categoria: string; vendidas: number }[] {
  const tiene = new Set(prendas.map(categoriaDe));
  return Object.entries(sinPrenda)
    .map(([c, n]) => ({ categoria: c.trim() || SIN_CATEGORIA, vendidas: n }))
    .filter((t) => t.vendidas > 0 && !tiene.has(t.categoria))
    .sort((a, b) => b.vendidas - a.vendidas || a.categoria.localeCompare(b.categoria, "es"));
}

/** «También vendiste 11 Pulseras y 10 Relojes sin registrar: no están en el sistema, así que no se sabe para cuánto te alcanzan.» */
export function notaTiposSinRegistrar(tipos: readonly { categoria: string; vendidas: number }[]): string {
  const nombres = tipos.slice(0, 3).map((t) => `${t.vendidas} ${t.categoria}`);
  const resto = tipos.length - nombres.length;
  const lista = resto > 0 ? `${nombres.join(", ")} y ${resto} ${plural(resto, "tipo más", "tipos más")}` : nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : (nombres[0] ?? "");
  return `También vendiste ${lista} sin registrar: no están en el sistema, así que no se sabe para cuánto te alcanzan.`;
}


/**
 * De qué días habla el ritmo de todo Análisis: desde que cada prenda se colgó, nunca menos de una semana y hasta los días de ventas de la
 * tienda (2026-10-14, `ventanaDeRitmo`). Con una semana o menos de ventas, es lo mismo que «los últimos N días» y se dice así.
 */
export const textoRitmo = (diasDeVentas: number): string =>
  diasDeVentas <= DIAS_MINIMOS_RITMO
    ? `Al ritmo de los últimos ${diasDeVentas} ${plural(diasDeVentas, "día", "días")}`
    : `Al ritmo desde que se colgó · hasta ${diasDeVentas} días`;

/* ───────── «Las tallas que se llevan» ───────── */

export type ColumnaTalla = {
  talla: string;
  /** La parte de lo vendido (del tipo elegido, o de todo) que es de esta talla, de 0 a 100: el alto de su barra (no se muestra). */
  v: number;
  /** La parte de lo que tengo que es de esta talla, de 0 a 100: el alto de su barra (no se muestra). */
  t: number;
  /** Las unidades: vendidas en los días de ventas de la tienda y las que tengo hoy. Es lo que se lee sobre cada barra. */
  vend: number;
  tiene: number;
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
 * una nota que lo dice. La talla estándar (o única) es una columna más, la primera (Felipe 2026-10-12: en Polos de TRU era 84 de
 * 86 vendidas y no se veía); si un tipo SOLO tiene talla estándar, no hay nada que comparar y se dice así. Sin el aviso «Falta M»
 * (Felipe 2026-10-12): cada barra ya dice si «pide más».
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
  // La estándar (o única) va en UNA columna, con el nombre que más usa la tienda («Estándar»).
  const unicas = conMovimiento.filter((p) => !conTalla(p.talla));
  const usos = new Map<string, number>();
  for (const p of unicas) usos.set(p.talla.trim(), (usos.get(p.talla.trim()) ?? 0) + 1);
  const nombreUnica = [...usos.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, "es"))[0]?.[0] ?? null;

  if (categoria === null) {
    const peso = new Map<TipoTalla, number>();
    for (const p of consideradas) peso.set(tipoDeTalla(p.talla), (peso.get(tipoDeTalla(p.talla)) ?? 0) + p.vendidas30 + totalEnTienda(p));
    const orden: TipoTalla[] = ["letras", "numeracion", "otras"];
    const sistema = orden.reduce((mejor, x) => ((peso.get(x) ?? 0) > (peso.get(mejor) ?? 0) ? x : mejor), orden[0]!);
    consideradas = consideradas.filter((p) => tipoDeTalla(p.talla) === sistema);
  }

  const porTalla = new Map<string, { vend: number; tiene: number }>();
  if (nombreUnica !== null) porTalla.set(nombreUnica, { vend: 0, tiene: 0 });
  for (const p of unicas) {
    const a = porTalla.get(nombreUnica!)!;
    a.vend += Math.max(0, p.vendidas30);
    a.tiene += Math.max(0, totalEnTienda(p));
  }
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
    .sort(([a], [b]) => (a === nombreUnica ? -1 : b === nombreUnica ? 1 : compararTallas(a, b)))
    .map(([talla, a]) => {
      const v = de100(a.vend, totalV);
      const t = de100(a.tiene, totalT);
      return { talla, v, t, vend: a.vend, tiene: a.tiene, pideMas: v - t >= DIFERENCIA_QUE_SE_NOTA };
    });

  return {
    tipo: "tallas",
    columnas,
    max: Math.max(1, ...columnas.flatMap((c) => [c.v, c.t])),
    nota: categoria === null ? `Modelos con talla ${enLista(columnas.map((c) => c.talla))}` : null,
  };
}

/* ───────── «Lo que más se vende» ───────── */

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
export const solesRinde = (n: number): string => `S/\u00a0${n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;

/** El tooltip de cada fila: «Por cada S/ 1 que tienes en Polos, ganaste S/ 1.10 en 90 días». */
export function tipRinde(r: { categoria: string; porSol: number }): string {
  return r.porSol < 0
    ? `Por cada S/\u00a01 que tienes en ${r.categoria}, perdiste ${solesRinde(-r.porSol)} en ${DIAS_RINDE} días`
    : `Por cada S/\u00a01 que tienes en ${r.categoria}, ganaste ${solesRinde(r.porSol)} en ${DIAS_RINDE} días`;
}

/** Qué dice la tarjeta cuando no hay nada que mostrar: si no se pudo leer, eso; si no, que todavía no alcanza. */
export function notaRindeVacio(fallas: readonly string[]): string {
  return fallas.includes(FALLA_RINDE) ? "No se pudo leer ahora." : `Todavía no hay ${DIAS_RINDE} días de ventas con su costo para medirlo.`;
}

/* ───────── Cara B (act. 2026-11-21): «Qué pedir» con los filtros de la barra ───────── */

/**
 * Para cuánto alcanza cada tipo, con lo que dejan ver los filtros. Con talla o color puestos se cuenta talla por talla (las filas de la
 * base), solo las de esa talla o ese color: «¿te alcanza la M hasta Navidad?». Lo vendido sin registrar es del tipo entero, no de una
 * talla ni de un grupo de modelos: solo se suma cuando el único filtro puesto es el tipo (o ninguno); si no, sumaría ventas de lo que no
 * se está mirando.
 */
export function alcanceConFiltros(
  modelos: readonly PrendaAnalisis[],
  tallas: readonly PrendaAnalisis[],
  f: Pick<FiltrosAnalisis, "q" | "talla" | "color" | "precio" | "origen" | "quieta">,
  diasDeVentas: number,
  hastaNavidad: number,
  sabePiso: boolean,
  sinPrenda: Readonly<Record<string, number>>,
): AlcanceTipo[] {
  return alcancePorTipo(baseConFiltros(modelos, tallas, f), diasDeVentas, hastaNavidad, sabePiso, soloTipo(f) ? sinPrenda : {});
}

/** Lo que se cuenta: los modelos, o sus tallas de la talla y el color puestos. */
export function baseConFiltros(
  modelos: readonly PrendaAnalisis[],
  tallas: readonly PrendaAnalisis[],
  f: Pick<FiltrosAnalisis, "talla" | "color">,
): PrendaAnalisis[] {
  if (f.talla.length === 0 && f.color.length === 0) return [...modelos];
  const ids = new Set(modelos.map((m) => m.productoId));
  return tallas.filter((v) => ids.has(v.productoId) && (f.talla.length === 0 || f.talla.includes(v.talla)) && (f.color.length === 0 || f.color.includes(v.color)));
}

const soloTipo = (f: Pick<FiltrosAnalisis, "q" | "talla" | "color" | "precio" | "origen" | "quieta">): boolean =>
  !f.q.trim() && f.talla.length === 0 && f.color.length === 0 && f.precio.length === 0 && f.origen.length === 0 && f.quieta.length === 0;

/**
 * La respuesta: «5 tipos · para la campaña: no te alcanzan hasta Navidad, en 34 días» (con 1, en singular). Empieza por la campaña para
 * que no se lea como «Se acaba», que es la compra de ahora (prueba ciega de /formidable, 2026-11-21).
 */
export const fraseAlcance = (n: number, hastaNavidad: number): string =>
  `para la campaña: ${n === 1 ? "no te alcanza" : "no te alcanzan"} hasta Navidad, en ${hastaNavidad} ${plural(hastaNavidad, "día", "días")}`;



// ───────── Por modelo (Felipe 2026-11-21: «las tarjetas deberían ser por modelo y no por tipo; para eso existe el filtro de tipo») ─────────

/** Para cuántos días le alcanza a un modelo lo que tiene: lo vendido y lo que hay en las tallas que se miran, y cuánto vende por día. */
export type AlcanceModelo<T> = { modelo: T; vendidas: number; tiene: number; porDia: number; dias: number | null };

/** Las tallas y colores del modelo que se miran: los de los filtros de talla y color, o todos. */
const tallasQueSeMiran = (m: ModeloAnalisis, f: Pick<FiltrosAnalisis, "talla" | "color">): PrendaAnalisis[] =>
  (m.variantes.length > 0 ? m.variantes : [m]).filter(
    (v) => (f.talla.length === 0 || f.talla.includes(v.talla)) && (f.color.length === 0 || f.color.includes(v.color)),
  );

/**
 * La misma cuenta que `alcancePorTipo`, en las tallas de UN modelo: lo que tiene entre lo que vende por día, cada talla en su ventana
 * de ritmo (los días que estuvo colgada, con el techo de la tienda). Con talla o color en los filtros, solo esas tallas: «¿le alcanza la
 * M de este modelo?». `dias` es null si no se vendió (sin ritmo no se sabe). Lo vendido sin registrar no tiene modelo y no entra aquí:
 * cuenta en su tipo (el bloque del tipo cuando se filtra uno solo).
 */
export function alcanceDelModelo<T extends ModeloAnalisis>(m: T, f: Pick<FiltrosAnalisis, "talla" | "color">, diasDeVentas: number): AlcanceModelo<T> {
  const tienda = Math.min(30, Math.max(1, Math.round(diasDeVentas)));
  let vendidas = 0;
  let tiene = 0;
  let porDia = 0;
  for (const v of tallasQueSeMiran(m, f)) {
    const vend = Math.max(0, v.vendidas30);
    vendidas += vend;
    tiene += Math.max(0, totalEnTienda(v));
    porDia += vend / Math.min(30, Math.max(1, Math.round(v.diasDeVentas ?? tienda)));
  }
  return { modelo: m, vendidas, tiene, porDia, dias: vendidas > 0 && porDia > 0 ? tiene / porDia : null };
}

/**
 * Los modelos que se acaban antes de Navidad (la parte de abajo de «Qué pedir»): los que se venden, TODAVÍA TIENEN algo aquí y no les
 * alcanza hasta ese día. Lo que ya no tiene nada va arriba, en «Ya se agotaron» (`modelosAgotados`). El orden: lo que más se vende (de
 * siempre), lo que más se vende y quedan pocos (primero lo que se acaba en 2 semanas o menos, `DIAS_SE_ACABA`, de lo más vendido a lo
 * menos; después el resto igual; Felipe 2026-11-24), lo que se acaba antes o por nombre; a igual cosa, lo que se acaba antes y el nombre.
 */
export function modelosQueNoLlegan<T extends ModeloAnalisis>(
  modelos: readonly T[],
  f: Pick<FiltrosAnalisis, "talla" | "color">,
  diasDeVentas: number,
  hastaNavidad: number,
  orden: string,
): AlcanceModelo<T>[] {
  const piden = modelos.map((m) => alcanceDelModelo(m, f, diasDeVentas)).filter((a) => a.tiene > 0 && a.dias !== null && a.dias < hastaNavidad);
  const porNombre = (a: AlcanceModelo<T>, b: AlcanceModelo<T>) => a.modelo.nombre.localeCompare(b.modelo.nombre, "es");
  const antes = (a: AlcanceModelo<T>, b: AlcanceModelo<T>) => (a.dias ?? Infinity) - (b.dias ?? Infinity);
  if (orden === "nombre") return piden.sort((a, b) => porNombre(a, b) || antes(a, b));
  if (orden === "acaba") return piden.sort((a, b) => antes(a, b) || b.vendidas - a.vendidas || porNombre(a, b));
  if (orden === "pocos") {
    const quedanPocos = (a: AlcanceModelo<T>) => ((a.dias ?? Infinity) <= DIAS_SE_ACABA ? 0 : 1);
    return piden.sort((a, b) => quedanPocos(a) - quedanPocos(b) || b.vendidas - a.vendidas || antes(a, b) || porNombre(a, b));
  }
  return piden.sort((a, b) => b.vendidas - a.vendidas || antes(a, b) || porNombre(a, b));
}

/** Los días que alcanza, enteros, para la tarjeta: lo que se acaba en menos de un día dice 1; «Ya no hay» es solo el 0. null sin ritmo. */
export const diasEnteros = (dias: number | null): number | null => (dias === null ? null : dias <= 0 ? 0 : Math.max(1, Math.round(dias)));

/* ───────── «Ya se agotaron» (Felipe 2026-11-24) ─────────
 * EL PROBLEMA. Sin stock no hay ventas, y sin ventas en 30 días no hay ritmo: un modelo que se vendió entero y rápido (lo que se trajo
 * en poca cantidad para probar, o lo que mejor salió) se iba de «Qué pedir» al mes de agotarse, justo por haberse agotado. En TRU, el
 * 24 de noviembre, 31 modelos agotados que se vendían no salían (la Camisa M/corta con Amarre: 12 en 7 días, agotada el 23 de octubre),
 * y los 49 que sí salían decían solo «Ya no hay».
 * LA REGLA. Arriba de «Qué pedir», los modelos sin nada aquí (en las tallas que se miran) que se vendieron en las 8 semanas que la base
 * entrega (`semanas`), con cuándo se agotó y cuántas se vendieron en cuántos días: lo que dice si la prueba funcionó. */

/** Las semanas que mira «Ya se agotaron»: las 8 de `semanas`. */
export const SEMANAS_AGOTADOS = 8;

/** Un modelo agotado: cuántas vendió en las 8 semanas, el día de su última venta (cuándo se agotó) y en cuántos días se vendieron. */
export type AgotadoModelo<T> = { modelo: T; vendidas: number; agoto: string | null; dias: number | null };

/** La fecha más temprana o la más tardía de las que se saben (aaaa-mm-dd se compara como texto); null si ninguna. */
function fechaExtrema(fechas: readonly (string | null | undefined)[], cual: "primera" | "ultima"): string | null {
  const sabidas = fechas.filter((x): x is string => typeof x === "string" && x !== "");
  if (sabidas.length === 0) return null;
  return sabidas.reduce((a, b) => ((cual === "primera" ? b < a : b > a) ? b : a));
}

/**
 * El modelo, si se agotó aquí: nada en las tallas que se miran y alguna venta en las 8 semanas; null si tiene algo o no se vendió.
 * `dias`: desde que salió al piso (o llegó, si nunca se colgó), sin ir más atrás de las 8 semanas, hasta su última venta; null si la
 * base no dice la última venta o las fechas no cuadran (la tarjeta dice entonces «en 8 semanas», que también es cierto).
 */
export function agotadoDelModelo<T extends ModeloAnalisis>(m: T, f: Pick<FiltrosAnalisis, "talla" | "color">, hoy: string): AgotadoModelo<T> | null {
  const tallas = tallasQueSeMiran(m, f);
  if (tallas.length === 0 || tallas.some((v) => totalEnTienda(v) > 0)) return null;
  const vendidas = tallas.reduce((s, v) => s + v.semanas.reduce((t, n) => t + Math.max(0, n), 0), 0);
  if (vendidas <= 0) return null;
  const agoto = fechaExtrema(tallas.map((v) => v.ultimaVenta), "ultima");
  const inicio = sumarDias(hoy, -(SEMANAS_AGOTADOS * 7 - 1));
  const salio = fechaExtrema(tallas.map((v) => v.salioAlPiso ?? v.llego), "primera");
  const desde = salio !== null && salio > inicio ? salio : inicio;
  const dias = agoto !== null && agoto >= desde ? diasEntreFechas(desde, agoto) + 1 : null;
  return { modelo: m, vendidas, agoto, dias };
}

/**
 * «Ya se agotaron», ordenados con la misma píldora que el resto de «Qué pedir»: lo que más se vendió (a igual venta, lo agotado más
 * reciente; también con «quedan pocos»: de un agotado no queda nada), lo que lleva más tiempo agotado o por nombre.
 */
export function modelosAgotados<T extends ModeloAnalisis>(modelos: readonly T[], f: Pick<FiltrosAnalisis, "talla" | "color">, hoy: string, orden: string): AgotadoModelo<T>[] {
  const agotados = modelos.map((m) => agotadoDelModelo(m, f, hoy)).filter((a): a is AgotadoModelo<T> => a !== null);
  const porNombre = (a: AgotadoModelo<T>, b: AgotadoModelo<T>) => a.modelo.nombre.localeCompare(b.modelo.nombre, "es");
  const reciente = (a: AgotadoModelo<T>, b: AgotadoModelo<T>) => (b.agoto ?? "").localeCompare(a.agoto ?? "");
  if (orden === "nombre") return agotados.sort((a, b) => porNombre(a, b) || b.vendidas - a.vendidas);
  if (orden === "acaba") return agotados.sort((a, b) => -reciente(a, b) || b.vendidas - a.vendidas || porNombre(a, b));
  return agotados.sort((a, b) => b.vendidas - a.vendidas || reciente(a, b) || porNombre(a, b));
}

/**
 * Qué parte va arriba en «Qué pedir»: con «Lo que más se vende y quedan pocos», «Se acaban antes de Navidad»; con cualquier otro orden,
 * «Ya se agotaron» (Felipe 2026-11-24: cada orden responde su pregunta primero).
 */
export const parteDeArriba = (orden: string): "agotados" | "seAcaban" => (orden === "pocos" ? "seAcaban" : "agotados");

/** Las primeras de una parte según «Mostrar» (`MOSTRAR_PEDIR`): «10», «20», «50» o «todas» (o algo que no es un número: todas). */
export function primerasQuePedir<T>(lista: readonly T[], mostrar: string): T[] {
  const n = Number(mostrar);
  return Number.isInteger(n) && n > 0 ? lista.slice(0, n) : [...lista];
}

/** Las dos partes de «Qué pedir» y los modelos de las dos juntos, para contarlos (la pestaña y su tarjeta en «Hoy»). */
export function queHayQuePedir<T extends ModeloAnalisis>(
  modelos: readonly T[],
  f: Pick<FiltrosAnalisis, "talla" | "color">,
  diasDeVentas: number,
  hoy: string,
  orden: string,
): { agotados: AgotadoModelo<T>[]; seAcaban: AlcanceModelo<T>[]; todos: T[] } {
  const agotados = modelosAgotados(modelos, f, hoy, orden);
  const seAcaban = modelosQueNoLlegan(modelos, f, diasDeVentas, diasANavidad(hoy), orden);
  return { agotados, seAcaban, todos: [...agotados.map((a) => a.modelo), ...seAcaban.map((a) => a.modelo)] };
}

/* ───────── Lo que dice cada tarjeta de «Qué pedir» (Felipe 2026-11-24: sin días, sin «Faltan», sin botones) ───────── */

/** El día en que se acaba al ritmo de hoy: «7 dic.» (hoy más los días que alcanza, enteros). */
export const fechaEnQueSeAcaba = (hoy: string, dias: number): string => fechaCorta(sumarDias(hoy, Math.max(1, Math.round(dias))));

/** «Vendes 39 por semana»: el mismo ritmo con el que se cuentan los días (cada talla en su ventana), por 7. */
export function textoVendesPorSemana(porDia: number): string {
  const n = Math.round(porDia * 7);
  return n >= 1 ? `Vendes ${n} por semana` : "Vendes menos de 1 por semana";
}

/** «Vendiste 12» y «en 7 días» (o «en 8 semanas» si no se sabe en cuántos días): dos líneas bajo «Se agotó el…». */
export function textoVendiste(a: Pick<AgotadoModelo<unknown>, "vendidas" | "dias">): [string, string] {
  return [`Vendiste ${a.vendidas}`, a.dias !== null ? `en ${a.dias} ${plural(a.dias, "día", "días")}` : `en ${SEMANAS_AGOTADOS} semanas`];
}

/**
 * El pie de la tarjeta, una línea o nada: lo que viene en camino («Llegan 12 el 6 dic.»), y si nada viene, otra tienda que tiene el
 * modelo («Lima tiene 17»: todas sus tallas y colores; cuáles, en la ficha).
 */
export function pieDePedir(m: ModeloAnalisis, hoy: string, ciudadDe: (sedeId: string) => string | undefined): string | null {
  const viene = textoViene(m, hoy);
  if (viene) return viene;
  const otra = otraSedeQueLaTiene(m.otras);
  const ciudad = otra ? ciudadDe(otra.sedeId) : undefined;
  return otra && ciudad ? `${ciudad} tiene ${otra.stock}` : null;
}
