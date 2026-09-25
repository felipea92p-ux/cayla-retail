import { RANGOS_SELL_THROUGH_PCT, TENDENCIA_MIN_UNIDADES } from "./inventario-reglas";
import { calcularSellThrough, calcularTendencia, evaluarExactitud, listarCategorias, type EstadoExactitud, type Ubicacion, type Velocidad } from "./resumen-reglas";
import { aplicarAlcance, bandaSellThrough, FILAS_POR_PAGINA, leerFiltros, paginar, type AlcanceResumen, type FiltroSellThrough } from "./resumen-filtros";
import { conNullAlFinal, metricasDePeriodo, rangoDeSellThrough, textoRangoSellThrough, variacionPct, type DatosPeriodo, type FilaComparacion, type MetricasPeriodo } from "./resumen-comparacion";
import { costoEsVerificable, rotacionAgregada, type RotacionAgregada } from "./rotacion";
import { diasDelRango, sumarDias, type PeriodoResuelto, type Rango } from "./resumen-periodo";
import { rangosDelResumen, type ParametrosResumen } from "./resumen-armado";

// Desempeño del inventario (2026-09-19, ADR-0138): «¿cómo se comportó mi inventario durante el
// período seleccionado?». Es la pantalla HISTÓRICA: nada de acá mira el stock de hoy (eso es
// Existencias) ni compara dos períodos (eso es Comparar períodos). Por producto y variante:
//
//   vendido       unidades netas del período (ventas − devoluciones)
//   ritmo         unidades por día, sobre los días CON stock (la definición canónica de `calcularVelocidad`)
//   sell-through  % de lo disponible que se vendió: ventas netas ÷ (stock al inicio + entradas)
//   rotación      COGS del período ÷ inventario promedio a costo (`rotacion.ts`, la única definición)
//   tendencia     el ritmo de la 2.ª mitad del período contra el de la 1.ª
//
// NINGUNA fórmula es nueva: se arma con `metricasDePeriodo` (la de Comparar períodos: velocidad,
// rotación), `calcularSellThrough` y `calcularTendencia` (las del Resumen de siempre). Lo único
// nuevo es partir el período en dos mitades para llamar a `fn_resumen_comparacion` con A = 1.ª
// mitad y B = 2.ª: así el mismo origen de datos da el período entero (sumando las dos), el stock
// al inicio (el de A) y al cierre (el de B), y la tendencia (B contra A).

// ---------------------------------------------------------------------------
// Partir el período en dos mitades
// ---------------------------------------------------------------------------

export type Mitades = {
  /** Las dos mitades, contiguas y sin solaparse. Si no se puede partir (1 día), las dos son el período. */
  primera: Rango;
  segunda: Rango;
  /** false = el período es de un solo día: no hay tendencia, y `primera`/`segunda` son el mismo rango. */
  dividido: boolean;
  diasPrimera: number;
  diasSegunda: number;
  dias: number;
};

/**
 * Parte un período en dos mitades: la 1.ª con `⌊N/2⌋` días y la 2.ª con el resto (la más reciente,
 * si N es impar, es un día más larga). Funciona igual con 7, 30, 90 días o uno personalizado; la
 * tendencia compara RITMOS (unidades por día con stock), así que mitades de distinto largo son comparables.
 */
export function dividirPeriodo(periodo: Rango): Mitades {
  const dias = diasDelRango(periodo);
  if (dias < 2) return { primera: periodo, segunda: periodo, dividido: false, diasPrimera: dias, diasSegunda: dias, dias };
  const h = Math.floor(dias / 2);
  return {
    primera: { desde: periodo.desde, hasta: sumarDias(periodo.desde, h - 1) },
    segunda: { desde: sumarDias(periodo.desde, h), hasta: periodo.hasta },
    dividido: true,
    diasPrimera: h,
    diasSegunda: dias - h,
    dias,
  };
}

/** El período entero a partir de sus dos mitades: se suma lo que se acumula (ventas, devoluciones, COGS en
 *  sus componentes, días con stock, entradas) y se toma el stock al inicio de la 1.ª y al cierre de la 2.ª.
 *  El COGS se junta en componentes para restar las devoluciones sobre el TOTAL: una devolución de la 2.ª mitad
 *  de algo vendido en la 1.ª no se pierde. */
export function periodoCompleto(f: FilaComparacion, dividido: boolean): DatosPeriodo {
  if (!dividido) return f.b; // las dos mitades son el mismo rango: contar las dos duplicaría todo
  return {
    ventas: f.a.ventas + f.b.ventas,
    devoluciones: f.a.devoluciones + f.b.devoluciones,
    importe: f.a.importe + f.b.importe,
    costoVentas: f.a.costoVentas + f.b.costoVentas,
    costoDevoluciones: f.a.costoDevoluciones + f.b.costoDevoluciones,
    unidadesSinCosto: f.a.unidadesSinCosto + f.b.unidadesSinCosto,
    entradas: f.a.entradas + f.b.entradas,
    stockInicio: f.a.stockInicio,
    stockCierre: f.b.stockCierre,
    diasConStock: f.a.diasConStock !== null && f.b.diasConStock !== null ? f.a.diasConStock + f.b.diasConStock : null,
  };
}

// ---------------------------------------------------------------------------
// Análisis de una variante
// ---------------------------------------------------------------------------

export type DireccionTendencia = "alza" | "estable" | "baja";
export const ETIQUETA_TENDENCIA: Record<DireccionTendencia, string> = { alza: "Aceleró", estable: "Estable", baja: "Desaceleró" };

export type AnalisisDesempeno = {
  fila: FilaComparacion;
  /** El período entero: vendido, velocidad, rotación. */
  periodo: MetricasPeriodo;
  /** Unidades por día: 0 si hay evidencia de que no se vendió, null si no hay base honesta. */
  ritmo: number | null;
  /** % (0–100); null si no hay base (nada disponible al inicio ni entradas) o el historial no cuadra. */
  sellThrough: number | null;
  /** 2.ª mitad contra 1.ª; null (= N/D) si el período no se puede partir, vendió muy poco o no hay ritmo medible. */
  tendencia: { direccion: DireccionTendencia; variacionPct: number } | null;
};

/** Unidades por día para mostrar: «no se vendió» con evidencia es 0, no «sin dato». */
export function ritmoDe(v: Velocidad): number | null {
  if (v.estado === "ok") return v.unidadesDia;
  if (v.estado === "sin_ventas") return 0;
  return null;
}

function tendenciaDe(f: FilaComparacion, m: Mitades, ventasNetasPeriodo: number): AnalisisDesempeno["tendencia"] {
  if (!m.dividido || ventasNetasPeriodo < TENDENCIA_MIN_UNIDADES) return null;
  const primera = metricasDePeriodo(f.a, m.diasPrimera, f).velocidad;
  const segunda = metricasDePeriodo(f.b, m.diasSegunda, f).velocidad;
  const t = calcularTendencia(segunda, primera);
  if (!t || t.direccion === "sin_dato" || t.variacionPct === null) return null;
  return { direccion: t.direccion, variacionPct: t.variacionPct };
}

export function analizarDesempeno(f: FilaComparacion, m: Mitades): AnalisisDesempeno {
  const completo = periodoCompleto(f, m.dividido);
  const periodo = metricasDePeriodo(completo, m.dias, f);
  return {
    fila: f,
    periodo,
    ritmo: ritmoDe(periodo.velocidad),
    sellThrough: calcularSellThrough({ ventasNetas: periodo.ventasNetas, stockInicial: completo.stockInicio, entradas: completo.entradas, ledgerConsistente: f.ledgerConsistente }),
    tendencia: tendenciaDe(f, m, periodo.ventasNetas),
  };
}

// ---------------------------------------------------------------------------
// Las cifras y los gráficos del período (rediseño 2026-09-22, opción A de Felipe)
// ---------------------------------------------------------------------------
//
// Desempeño tiene la MISMA anatomía que Comparar períodos: cuatro cifras, tres gráficos y la tabla. Las
// cifras usan las mismas reglas que las de Comparar sobre UN período —ventas netas, rotación del conjunto
// (`rotacionAgregada`), sell-through del conjunto (la fórmula de cada variante sobre las sumas) y capital al
// costo con la regla `costoEsVerificable`—; ninguna es nueva. Salen de todo el ALCANCE (categoría y
// búsqueda): la banda de sell-through solo recorta la tabla, como el filtro de cambio en Comparar, así que
// elegir «Alto» no mueve ninguna cifra de arriba.

export type KpisDesempeno = {
  /** Lo cobrado neto del período y el de cada mitad; `cambioMitadPct` compara lo cobrado POR DÍA de la 2.ª contra la 1.ª. */
  ventas: { importe: number; unidades: number; primeraMitad: number; segundaMitad: number; cambioMitadPct: number | null };
  rotacion: RotacionAgregada;
  /** Sell-through del conjunto: Σ ventas netas ÷ Σ (stock al inicio + entradas) de las variantes calculables. */
  sellThrough: { pct: number | null; vendidas: number; disponibles: number; variantes: number; excluidas: number };
  /** `verificado = false`: hay stock sin costo confiable; la tarjeta muestra unidades. */
  capital: { verificado: boolean; inicio: number; cierre: number; unidadesInicio: number; unidadesCierre: number; sinCosto: number; alterado: number };
};

export type TendenciasDesempeno = { total: number; alza: number; estable: number; baja: number; sinDato: number };

export type DistribucionDesempeno = { rangos: { clave: string; texto: string; n: number }[]; sinDato: number };

const TOP_ROTACION = 5;

export function calcularKpisDesempeno(analisis: AnalisisDesempeno[], mitades: Mitades): KpisDesempeno {
  const suma = (f: (x: AnalisisDesempeno) => number) => analisis.reduce((t, x) => t + f(x), 0);
  const importe = suma((x) => x.periodo.importe);
  // Con un período de un día no hay dos mitades: las dos son el período entero y no se afirma un cambio. El
  // cambio se mide por DÍA (con 7 días, la 2.ª mitad tiene 4 y la 1.ª 3: comparar totales la favorecería).
  const primeraMitad = mitades.dividido ? suma((x) => x.fila.a.importe) : importe;
  const segundaMitad = mitades.dividido ? suma((x) => x.fila.b.importe) : importe;

  const calculables = analisis.filter((x) => x.sellThrough !== null);
  const vendidas = calculables.reduce((t, x) => t + x.periodo.ventasNetas, 0);
  const stockInicial = calculables.reduce((t, x) => t + x.periodo.stockInicio, 0);
  const entradas = calculables.reduce((t, x) => t + x.periodo.entradas, 0);

  const conStock = analisis.filter((x) => x.periodo.stockInicio + x.periodo.stockCierre > 0);
  const problemas = conStock.filter((x) => !costoEsVerificable(x.fila.costo, x.fila.estadoCosto));
  const alterado = problemas.filter((x) => x.fila.estadoCosto === "alterado").length;
  const costo = (x: AnalisisDesempeno) => x.fila.costo ?? 0;

  return {
    ventas: { importe, unidades: suma((x) => x.periodo.ventasNetas), primeraMitad, segundaMitad, cambioMitadPct: mitades.dividido ? variacionPct(primeraMitad / mitades.diasPrimera, segundaMitad / mitades.diasSegunda) : null },
    rotacion: rotacionAgregada(analisis.map((x) => x.periodo.baseRotacion)),
    sellThrough: {
      pct: calculables.length > 0 ? calcularSellThrough({ ventasNetas: vendidas, stockInicial, entradas, ledgerConsistente: true }) : null,
      vendidas,
      disponibles: stockInicial + entradas,
      variantes: calculables.length,
      excluidas: analisis.length - calculables.length,
    },
    capital: {
      verificado: problemas.length === 0,
      inicio: suma((x) => x.periodo.stockInicio * costo(x)),
      cierre: suma((x) => x.periodo.stockCierre * costo(x)),
      unidadesInicio: suma((x) => x.periodo.stockInicio),
      unidadesCierre: suma((x) => x.periodo.stockCierre),
      sinCosto: problemas.length - alterado,
      alterado,
    },
  };
}

/** La dona: cuántas variantes aceleraron, siguieron estables o desaceleraron dentro del período. */
export function contarTendencias(analisis: AnalisisDesempeno[]): TendenciasDesempeno {
  const cuenta = (d: DireccionTendencia) => analisis.filter((x) => x.tendencia?.direccion === d).length;
  const alza = cuenta("alza");
  const estable = cuenta("estable");
  const baja = cuenta("baja");
  const total = alza + estable + baja;
  return { total, alza, estable, baja, sinDato: analisis.length - total };
}

/** Las que más rotaron en el período (solo rotación calculable y mayor que cero: un N/D no «rotó cero»). */
export function rankingRotacionDesempeno(analisis: AnalisisDesempeno[], max = TOP_ROTACION): AnalisisDesempeno[] {
  return analisis
    .filter((x) => x.periodo.rotacion !== null && x.periodo.rotacion > 0)
    .sort((x, y) => y.periodo.rotacion! - x.periodo.rotacion! || y.periodo.ventasNetas - x.periodo.ventasNetas)
    .slice(0, max);
}

/** Variantes por rango de sell-through (los mismos rangos que Comparar: `RANGOS_SELL_THROUGH_PCT`). */
export function distribucionDesempeno(analisis: AnalisisDesempeno[]): DistribucionDesempeno {
  const rangos = RANGOS_SELL_THROUGH_PCT.map((_, i) => ({ clave: `r${i}`, texto: textoRangoSellThrough(i), n: 0 }));
  let sinDato = 0;
  for (const x of analisis) {
    if (x.sellThrough === null) sinDato += 1;
    else rangos[rangoDeSellThrough(x.sellThrough)]!.n += 1;
  }
  return { rangos, sinDato };
}

// ---------------------------------------------------------------------------
// Orden, filtros y la URL
// ---------------------------------------------------------------------------

export type OrdenDesempeno = "vendidos" | "ritmo" | "sell_through" | "rotacion_mayor" | "rotacion_menor" | "aceleracion" | "desaceleracion";

export const ORDEN_INICIAL_DESEMPENO: OrdenDesempeno = "vendidos";

export const OPCIONES_ORDEN_DESEMPENO: readonly { valor: OrdenDesempeno; texto: string }[] = [
  { valor: "vendidos", texto: "Más vendidos" },
  { valor: "ritmo", texto: "Mayor ritmo de venta" },
  { valor: "sell_through", texto: "Mayor sell-through" },
  { valor: "rotacion_mayor", texto: "Mayor rotación" },
  { valor: "rotacion_menor", texto: "Menor rotación" },
  { valor: "aceleracion", texto: "Mayor aceleración" },
  { valor: "desaceleracion", texto: "Mayor desaceleración" },
];

/** Lo que no se puede medir (N/D) va siempre al final, en cualquier sentido del orden. */
export function ordenarDesempeno(analisis: AnalisisDesempeno[], orden: OrdenDesempeno): AnalisisDesempeno[] {
  const porVendidos = conNullAlFinal<AnalisisDesempeno>((x) => x.periodo.ventasNetas, -1);
  const criterio: Record<OrdenDesempeno, (x: AnalisisDesempeno, y: AnalisisDesempeno) => number> = {
    vendidos: porVendidos,
    ritmo: (x, y) => conNullAlFinal<AnalisisDesempeno>((z) => z.ritmo, -1)(x, y) || porVendidos(x, y),
    sell_through: (x, y) => conNullAlFinal<AnalisisDesempeno>((z) => z.sellThrough, -1)(x, y) || porVendidos(x, y),
    rotacion_mayor: (x, y) => conNullAlFinal<AnalisisDesempeno>((z) => z.periodo.rotacion, -1)(x, y) || porVendidos(x, y),
    rotacion_menor: (x, y) => conNullAlFinal<AnalisisDesempeno>((z) => z.periodo.rotacion, 1)(x, y) || porVendidos(x, y),
    aceleracion: (x, y) => conNullAlFinal<AnalisisDesempeno>((z) => z.tendencia?.variacionPct ?? null, -1)(x, y) || porVendidos(x, y),
    desaceleracion: (x, y) => conNullAlFinal<AnalisisDesempeno>((z) => z.tendencia?.variacionPct ?? null, 1)(x, y) || porVendidos(x, y),
  };
  return [...analisis].sort(criterio[orden]);
}

export function filtrarPorSellThrough(analisis: AnalisisDesempeno[], banda: FiltroSellThrough): AnalisisDesempeno[] {
  return banda === "todos" ? analisis : analisis.filter((x) => bandaSellThrough(x.sellThrough) === banda);
}

type ParamsCrudos = Record<string, string | string[] | undefined>;
const primero = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** De la URL a la vista: categoría y búsqueda (alcance), sell-through, orden y página. Lo que no se
 *  reconoce —un `orden=prioridad` de un enlace viejo, por ejemplo— cae en los valores iniciales. */
export function leerVistaDesempeno(p: ParamsCrudos): { alcance: AlcanceResumen; sellThrough: FiltroSellThrough; orden: OrdenDesempeno; pagina: number } {
  const { alcance, vista, pagina } = leerFiltros(p);
  const orden = primero(p.orden);
  return {
    alcance,
    sellThrough: vista.sellThrough,
    orden: OPCIONES_ORDEN_DESEMPENO.find((o) => o.valor === orden)?.valor ?? ORDEN_INICIAL_DESEMPENO,
    pagina,
  };
}

// ---------------------------------------------------------------------------
// Armado de la pantalla
// ---------------------------------------------------------------------------

/** Todo lo que viaja al componente cliente: una página de filas y lo justo para dibujarla. */
export type DesempenoParaPantalla = {
  ubicacion: Ubicacion;
  periodo: PeriodoResuelto;
  /** false = período de un solo día: la columna Tendencia sale «N/D» y se explica. */
  tendenciaDisponible: boolean;
  ahoraIso: string;
  alcance: AlcanceResumen;
  sellThrough: FiltroSellThrough;
  orden: OrdenDesempeno;
  /** Todas las categorías de la sede (no las del alcance) para el selector. */
  categorias: { id: string; nombre: string; variantes: number }[];
  /** Las cifras y los gráficos: de todo el alcance (categoría y búsqueda), nunca del filtro de sell-through. */
  kpis: KpisDesempeno;
  tendencias: TendenciasDesempeno;
  ranking: AnalisisDesempeno[];
  distribucion: DistribucionDesempeno;
  tabla: { filas: AnalisisDesempeno[]; pagina: number; paginas: number; total: number; totalAlcance: number; totalSede: number };
  exactitud: EstadoExactitud;
  /** Variantes cuyo historial no cuadra con el stock de hoy (cifras estimadas). */
  estimadas: number;
};

/** Qué dos rangos hay que pedirle a `fn_resumen_comparacion` para el período de la URL. */
export function mitadesDelDesempeno(params: ParametrosResumen, ahora: Date): { periodo: PeriodoResuelto; mitades: Mitades } {
  const { periodo } = rangosDelResumen(params, ahora);
  return { periodo, mitades: dividirPeriodo({ desde: periodo.desde, hasta: periodo.hasta }) };
}

export function armarDesempeno(e: {
  filas: FilaComparacion[];
  ubicacion: Ubicacion;
  params: ParametrosResumen;
  ahora: Date;
  conteos: { exactitud: { porcentaje: number; lineas: number; conteos: number } | null; ultimoCerradoEn: string | null };
}): DesempenoParaPantalla {
  const { periodo, mitades } = mitadesDelDesempeno(e.params, e.ahora);
  const { alcance, sellThrough, orden, pagina } = leerVistaDesempeno(e.params);

  const todas = e.filas.map((f) => analizarDesempeno(f, mitades));
  const enAlcance = aplicarAlcance(todas, alcance);
  const enVista = ordenarDesempeno(filtrarPorSellThrough(enAlcance, sellThrough), orden);
  const p = paginar(enVista, pagina, FILAS_POR_PAGINA);

  return {
    ubicacion: e.ubicacion,
    periodo,
    tendenciaDisponible: mitades.dividido,
    ahoraIso: e.ahora.toISOString(),
    alcance,
    sellThrough,
    orden,
    categorias: listarCategorias(todas),
    kpis: calcularKpisDesempeno(enAlcance, mitades),
    tendencias: contarTendencias(enAlcance),
    ranking: rankingRotacionDesempeno(enAlcance),
    distribucion: distribucionDesempeno(enAlcance),
    tabla: { filas: p.items, pagina: p.pagina, paginas: p.paginas, total: p.total, totalAlcance: enAlcance.length, totalSede: todas.length },
    exactitud: evaluarExactitud(e.conteos, e.ahora),
    estimadas: enAlcance.filter((x) => !x.fila.ledgerConsistente).length,
  };
}
