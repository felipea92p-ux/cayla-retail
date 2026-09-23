import { RANGOS_SELL_THROUGH_PCT, SELL_THROUGH_CAMBIO_RELEVANTE_PP, TENDENCIA_MIN_UNIDADES, TENDENCIA_UMBRAL_PCT } from "./inventario-reglas";
import { calcularSellThrough, calcularTendencia, calcularVelocidad, listarCategorias, evaluarExactitud, type EstadoCosto, type EstadoExactitud, type Ubicacion, type Velocidad } from "./resumen-reglas";
import type { CamposBusqueda } from "./resumen-busqueda";
import { aplicarAlcance, FILAS_POR_PAGINA, leerFiltros, paginar, type AlcanceResumen } from "./resumen-filtros";
import { formatoRotacion, formatoSellThrough, formatoVariacion, formatoVelocidad, pluralizar } from "./resumen-formato";
import { baseRotacionDeVariante, calcularRotacion, costoEsVerificable, rotacionComparada, variacionRotacionPct, type BaseRotacion, type MotivoSinRotacion, type RotacionComparada } from "./rotacion";
import { diasDelRango, etiquetaRango, resolverComparacion, type ModoComparacion, type PeriodoResuelto, type Rango } from "./resumen-periodo";
import { rangosDelResumen, type ParametrosResumen } from "./resumen-armado";

// Comparación de dos períodos, A contra B (2026-09-19, ADR-0138). Puro y sin servidor: `fn_resumen_comparacion`
// trae NÚMEROS crudos por variante (ventas, importe y costo de lo vendido, entradas, stock al inicio y al cierre,
// días con stock) y acá se decide qué significan. Responde UNA pregunta: «¿qué cambió en el desempeño del
// inventario entre A y B?» — en una sola lectura de arriba abajo (rediseño 2026-09-22):
//   · Cifras y gráficos → cuatro cifras A → B (ventas, rotación, sell-through y capital), cómo evolucionó el ritmo
//     de venta de las variantes, qué productos más rotan y cómo se reparte el sell-through.
//   · Detalle por producto, debajo → «¿qué productos lo explican?» (una fila por variante, con su lectura en
//     `resumen-lectura.ts`). La dona filtra esa tabla; nunca recalcula las cifras.
//
// NO responde «¿qué stock tengo ahora?» ni «¿cuánto me dura?»: eso es de Existencias (la cobertura salió de acá,
// con las señales de riesgo de quiebre y sobrestock). Reutiliza las definiciones canónicas de `resumen-reglas.ts`
// —el ritmo es unidades netas ÷ DÍAS CON STOCK, el sell-through y la tendencia son los de siempre— y los umbrales de
// `inventario-reglas.ts`: esta pantalla no inventa ningún número de corte. El stock aquí es el de CIERRE de cada
// período (una fotografía histórica), nunca el de hoy.

// ---------------------------------------------------------------------------
// Entrada: una fila de `fn_resumen_comparacion` ya mapeada a camelCase.
// ---------------------------------------------------------------------------

export type DatosPeriodo = {
  ventas: number;
  devoluciones: number;
  /** Lo cobrado (precio − descuento), neto de devoluciones. */
  importe: number;
  /** Costo de las unidades vendidas, con el costo que guardó cada venta ESE día (`venta_items.costo_unitario`). */
  costoVentas: number;
  /** Costo de las unidades devueltas y vendibles (el de la línea que se devuelve): reduce el COGS. */
  costoDevoluciones: number;
  /** Unidades vendidas o devueltas a las que ninguna fuente dio costo: si hay alguna, el COGS no es confiable. */
  unidadesSinCosto: number;
  /** Lo que llegó de afuera a la sede en el período (recepción, producción, traslado recibido, carga inicial). */
  entradas: number;
  stockInicio: number;
  stockCierre: number;
  diasConStock: number | null;
};

export type FilaComparacion = CamposBusqueda & {
  varianteId: string;
  productoId: string;
  productoEstado: string;
  categoriaId: string | null;
  colorCodigo: string | null;
  colorHex: string | null;
  /** Costo actual de la variante: valora el stock (el costo de lo vendido va en `costoVentas` y `costoDevoluciones`). */
  costo: number | null;
  estadoCosto: EstadoCosto | null;
  /** false = el ledger no explica el stock de hoy: lo reconstruido es una estimación. */
  ledgerConsistente: boolean;
  a: DatosPeriodo;
  b: DatosPeriodo;
};

type Num = number | string | null | undefined;

export type FilaCrudaComparacion = {
  variante_id: string;
  producto_id: string;
  referencia: string;
  categoria_id?: string | null;
  categoria_nombre?: string | null;
  producto_estado?: string | null;
  producto_codigo?: string | null;
  sku?: string | null;
  codigo?: string | null;
  codigos_barras?: string[] | null;
  talla?: string | null;
  color_codigo?: string | null;
  color_nombre?: string | null;
  color_hex?: string | null;
  costo?: Num;
  estado_costo?: string | null;
  ledger_consistente?: boolean | null;
  a_ventas?: Num;
  a_devoluciones?: Num;
  a_importe?: Num;
  a_costo_ventas?: Num;
  a_costo_devoluciones?: Num;
  a_uds_sin_costo?: Num;
  a_entradas?: Num;
  a_stock_inicio?: Num;
  a_stock_cierre?: Num;
  a_dias_con_stock?: Num;
  b_ventas?: Num;
  b_devoluciones?: Num;
  b_importe?: Num;
  b_costo_ventas?: Num;
  b_costo_devoluciones?: Num;
  b_uds_sin_costo?: Num;
  b_entradas?: Num;
  b_stock_inicio?: Num;
  b_stock_cierre?: Num;
  b_dias_con_stock?: Num;
};

/** Lo que faltó es 0 (no hay unidades); PostgREST devuelve numeric como número o texto. */
const n = (v: Num): number => (v === null || v === undefined ? 0 : Number(v));
/** Lo que faltó es «no hay dato»: NO se convierte en 0. */
const nn = (v: Num): number | null => (v === null || v === undefined ? null : Number(v));

const ESTADOS_COSTO: EstadoCosto[] = ["oficial", "declarado", "alterado", "sin_costo"];

export function mapearFilaComparacion(f: FilaCrudaComparacion): FilaComparacion {
  return {
    varianteId: f.variante_id,
    productoId: f.producto_id,
    productoCodigo: f.producto_codigo ?? null,
    productoEstado: f.producto_estado ?? "activo",
    referencia: f.referencia,
    categoriaId: f.categoria_id ?? null,
    categoria: f.categoria_nombre ?? null,
    sku: f.sku ?? "",
    codigo: f.codigo ?? null,
    codigosBarras: f.codigos_barras ?? [],
    talla: f.talla ?? null,
    colorCodigo: f.color_codigo ?? null,
    color: f.color_nombre ?? null,
    colorHex: f.color_hex ?? null,
    costo: nn(f.costo),
    estadoCosto: (ESTADOS_COSTO as string[]).includes(f.estado_costo ?? "") ? (f.estado_costo as EstadoCosto) : null,
    ledgerConsistente: f.ledger_consistente ?? true,
    a: {
      ventas: n(f.a_ventas),
      devoluciones: n(f.a_devoluciones),
      importe: n(f.a_importe),
      costoVentas: n(f.a_costo_ventas),
      costoDevoluciones: n(f.a_costo_devoluciones),
      unidadesSinCosto: n(f.a_uds_sin_costo),
      entradas: n(f.a_entradas),
      stockInicio: n(f.a_stock_inicio),
      stockCierre: n(f.a_stock_cierre),
      diasConStock: nn(f.a_dias_con_stock),
    },
    b: {
      ventas: n(f.b_ventas),
      devoluciones: n(f.b_devoluciones),
      importe: n(f.b_importe),
      costoVentas: n(f.b_costo_ventas),
      costoDevoluciones: n(f.b_costo_devoluciones),
      unidadesSinCosto: n(f.b_uds_sin_costo),
      entradas: n(f.b_entradas),
      stockInicio: n(f.b_stock_inicio),
      stockCierre: n(f.b_stock_cierre),
      diasConStock: nn(f.b_dias_con_stock),
    },
  };
}

// ---------------------------------------------------------------------------
// MÉTRICAS de una variante en UN período
// ---------------------------------------------------------------------------
//
//   ritmo        = unidades netas vendidas ÷ días CON stock del período (`calcularVelocidad`, la canónica: los días
//                  agotado no castigan el ritmo)
//   sell-through = ventas netas ÷ (stock al inicio + entradas) (`calcularSellThrough`)
//   rotación     = COGS del período ÷ inventario promedio a costo — la definición oficial, UNA sola
//                  implementación en `rotacion.ts` (la usan también Desempeño y los KPI de Comparar)
//
// Lo que no se puede calcular (ventas sin costo, stock sin costo verificable, historial que no cuadra, sin base)
// es N/D: nunca un número inventado.

export type MetricasPeriodo = {
  ventasNetas: number;
  importe: number;
  velocidad: Velocidad;
  /** Unidades por día; null si no hay base honesta para calcularla. */
  unidadesDia: number | null;
  stockInicio: number;
  stockCierre: number;
  /** Lo que llegó de afuera en el período: junto con el stock al inicio, la base del sell-through. */
  entradas: number;
  /** % (0–100) de lo disponible que se vendió; null si no hay base o el historial no cuadra. */
  sellThrough: number | null;
  /** Rotación de inventario (COGS ÷ inventario promedio a costo), en veces; null = N/D. */
  rotacion: number | null;
  /** Por qué la rotación es N/D (null si se calculó). */
  motivoSinRotacion: MotivoSinRotacion | null;
  /** Los insumos de esa rotación (COGS e inventario a costo), para sumarlos sobre un mismo universo. */
  baseRotacion: BaseRotacion;
};

/** Lo que de la fila hace falta para valorar a costo y saber si el historial es fiable. */
type ContextoCosto = Pick<FilaComparacion, "ledgerConsistente" | "costo" | "estadoCosto">;

export function metricasDePeriodo(d: DatosPeriodo, diasCalendario: number, f: ContextoCosto): MetricasPeriodo {
  // Sin ledger que cuadre no hay base honesta para los días con stock: la velocidad
  // cae a los días del período y queda marcada `estimada` (misma regla del Resumen normal).
  const velocidad = calcularVelocidad({ ventas: d.ventas, devoluciones: d.devoluciones, diasConStock: d.diasConStock, diasObservables: diasCalendario, ledgerConsistente: f.ledgerConsistente });
  const stockInicio = Math.max(d.stockInicio, 0);
  const stockCierre = Math.max(d.stockCierre, 0);
  const baseRotacion = baseRotacionDeVariante({
    costoVentas: d.costoVentas,
    costoDevoluciones: d.costoDevoluciones,
    unidadesSinCosto: d.unidadesSinCosto,
    stockInicio,
    stockCierre,
    costo: f.costo,
    estadoCosto: f.estadoCosto,
    ledgerConsistente: f.ledgerConsistente,
  });
  const rotacion = calcularRotacion(baseRotacion);
  return {
    ventasNetas: velocidad.ventasNetas,
    importe: d.importe,
    velocidad,
    unidadesDia: velocidad.unidadesDia,
    stockInicio,
    stockCierre,
    entradas: d.entradas,
    sellThrough: calcularSellThrough({ ventasNetas: velocidad.ventasNetas, stockInicial: stockInicio, entradas: d.entradas, ledgerConsistente: f.ledgerConsistente }),
    rotacion: rotacion.veces,
    motivoSinRotacion: rotacion.motivo,
    baseRotacion,
  };
}

/** Variación porcentual; null si falta uno de los dos o si no hay base (antes ≤ 0). */
export function variacionPct(antes: number | null, despues: number | null): number | null {
  if (antes === null || despues === null || antes <= 0) return null;
  return ((despues - antes) / antes) * 100;
}

// ---------------------------------------------------------------------------
// EVOLUCIÓN DEL RITMO de venta (Aceleró · Estable · Desaceleró)
// ---------------------------------------------------------------------------

export type DireccionRitmo = "acelero" | "estable" | "desacelero";

export type EvolucionRitmo = {
  direccion: DireccionRitmo;
  /** (B − A) ÷ A en %. */
  variacionPct: number;
};

/**
 * Cómo cambió el ritmo de venta de una variante de A a B: la MISMA cuenta que la tendencia de Desempeño
 * (`calcularTendencia`, sobre unidades/día con stock, umbral `TENDENCIA_UMBRAL_PCT`) — es la tendencia de
 * B contra A, no una fórmula nueva — con la misma exigencia de evidencia (`TENDENCIA_MIN_UNIDADES` en
 * total): con muy pocas ventas no se afirma nada. Las tres categorías son mutuamente excluyentes; null =
 * no se puede afirmar (sin base honesta en A, poco vendido en total) y esa variante no entra al gráfico.
 */
export function evolucionDelRitmo(a: MetricasPeriodo, b: MetricasPeriodo): EvolucionRitmo | null {
  if (a.ventasNetas + b.ventasNetas < TENDENCIA_MIN_UNIDADES) return null;
  const t = calcularTendencia(b.velocidad, a.velocidad);
  if (!t || t.direccion === "sin_dato" || t.variacionPct === null) return null;
  const direccion: DireccionRitmo = t.direccion === "alza" ? "acelero" : t.direccion === "baja" ? "desacelero" : "estable";
  return { direccion, variacionPct: t.variacionPct };
}

/** Rotó más: subió al menos `TENDENCIA_UMBRAL_PCT` (o pasó de no rotar a rotar). */
export function mejoroRotacion(a: MetricasPeriodo, b: MetricasPeriodo): boolean {
  if (b.rotacion === null || b.rotacion <= 0) return false;
  if (a.rotacion === null) return false; // sin base en A no hay «mejora» que afirmar
  if (a.rotacion <= 0) return true;
  return ((b.rotacion - a.rotacion) / a.rotacion) * 100 >= TENDENCIA_UMBRAL_PCT;
}

// ---------------------------------------------------------------------------
// CAMBIO RELEVANTE: UNA conclusión por variante
// ---------------------------------------------------------------------------

export type CambioRelevante = "acelero" | "desacelero" | "mejoro_rotacion" | "sell_through_sube" | "sell_through_baja";

/**
 * De más a menos importante. Una variante puede cumplir varios (aceleró Y mejoró su rotación); la tabla muestra el
 * primero, no una fila de chips: el ritmo es la mirada principal (es la de la dona), después la rotación y por
 * último el sell-through. Acelerar y desacelerar (y subir y bajar el sell-through) se excluyen entre sí.
 */
export const PRIORIDAD_CAMBIO: readonly CambioRelevante[] = ["acelero", "desacelero", "mejoro_rotacion", "sell_through_sube", "sell_through_baja"];

export const ETIQUETA_CAMBIO: Record<CambioRelevante, string> = {
  acelero: "Aceleró",
  desacelero: "Desaceleró",
  mejoro_rotacion: "Mejoró rotación",
  sell_through_sube: "Sell-through",
  sell_through_baja: "Sell-through",
};

/** Hacia dónde apunta el cambio: la flecha y el tono de la fila salen de acá. */
export const SENTIDO_CAMBIO: Record<CambioRelevante, "sube" | "baja"> = {
  acelero: "sube",
  desacelero: "baja",
  mejoro_rotacion: "sube",
  sell_through_sube: "sube",
  sell_through_baja: "baja",
};

/** Lo que se muestra en la celda: un cambio, «sin cambio relevante» (hay datos y nada se movió) o nada (no se pudo medir). */
export type CambioMostrado = CambioRelevante | "sin_cambio" | null;

export type AnalisisComparacion = {
  fila: FilaComparacion;
  a: MetricasPeriodo;
  b: MetricasPeriodo;
  /** Cómo evolucionó el ritmo de venta de A a B; null = no se puede afirmar. */
  ritmo: EvolucionRitmo | null;
  mejoroRotacion: boolean;
  /** Rotación de B menos la de A (veces). */
  deltaRotacion: number | null;
  deltaRotacionPct: number | null;
  /** Sell-through de B menos el de A, en puntos porcentuales. */
  deltaSellThroughPp: number | null;
  /** Todos los cambios relevantes que aplican, del más al menos importante (`PRIORIDAD_CAMBIO`). */
  cambios: CambioRelevante[];
  /** Hay al menos una métrica comparable: si no, la celda de cambio es «—» y no «sin cambio relevante». */
  medible: boolean;
};

export function analizarVarianteComparacion(f: FilaComparacion, diasA: number, diasB: number): AnalisisComparacion {
  const a = metricasDePeriodo(f.a, diasA, f);
  const b = metricasDePeriodo(f.b, diasB, f);
  const ritmo = evolucionDelRitmo(a, b);
  const mejoro = mejoroRotacion(a, b);
  const deltaSellThroughPp = a.sellThrough !== null && b.sellThrough !== null ? b.sellThrough - a.sellThrough : null;
  const aplica: Record<CambioRelevante, boolean> = {
    acelero: ritmo?.direccion === "acelero",
    desacelero: ritmo?.direccion === "desacelero",
    mejoro_rotacion: mejoro,
    sell_through_sube: deltaSellThroughPp !== null && deltaSellThroughPp >= SELL_THROUGH_CAMBIO_RELEVANTE_PP,
    sell_through_baja: deltaSellThroughPp !== null && deltaSellThroughPp <= -SELL_THROUGH_CAMBIO_RELEVANTE_PP,
  };
  return {
    fila: f,
    a,
    b,
    ritmo,
    mejoroRotacion: mejoro,
    deltaRotacion: a.rotacion !== null && b.rotacion !== null ? b.rotacion - a.rotacion : null,
    deltaRotacionPct: variacionRotacionPct(a.rotacion, b.rotacion),
    deltaSellThroughPp,
    cambios: PRIORIDAD_CAMBIO.filter((c) => aplica[c]),
    medible: ritmo !== null || (a.rotacion !== null && b.rotacion !== null) || deltaSellThroughPp !== null,
  };
}

/**
 * El cambio que muestra la fila. Con un filtro de cambio activo, el de ese filtro (si aplica): filtrar por «Mejoró
 * rotación» y ver «Aceleró» en cada fila contradice al filtro. Si no, el más importante; y sin ninguno, «sin cambio
 * relevante» (hay datos) o nada (no se pudo medir).
 */
export function cambioMostrado(x: AnalisisComparacion, preferido: FiltroCambio = "todos"): CambioMostrado {
  if (preferido !== "todos" && preferido !== "estable" && x.cambios.includes(preferido)) return preferido;
  const [principal] = x.cambios;
  if (principal) return principal;
  return x.medible ? "sin_cambio" : null;
}

/** Lo que dice la celda de cambio: «Aceleró», «Mejoró rotación», «Sell-through +19 pp»… */
export function textoCambio(x: AnalisisComparacion, cambio: CambioRelevante): string {
  if (cambio === "sell_through_sube" || cambio === "sell_through_baja") return `${ETIQUETA_CAMBIO[cambio]} ${formatoPuntos(x.deltaSellThroughPp ?? 0)}`;
  return ETIQUETA_CAMBIO[cambio];
}

/** El porqué de un cambio, con los números, para el tooltip de la celda. */
export function detalleCambio(x: AnalisisComparacion, cambio: CambioRelevante): string {
  const uds = (v: number | null) => (v === null ? "—" : formatoVelocidad(v));
  if (cambio === "acelero" || cambio === "desacelero") {
    const pct = x.ritmo?.variacionPct;
    return `Su ritmo pasó de ${uds(x.a.unidadesDia === null && x.a.velocidad.estado === "sin_ventas" ? 0 : x.a.unidadesDia)} a ${uds(x.b.unidadesDia)} uds/día${pct == null ? "" : ` (${formatoVariacion(pct)})`}`;
  }
  if (cambio === "mejoro_rotacion") return `Su rotación pasó de ${x.a.rotacion === null ? "—" : formatoRotacion(x.a.rotacion)} a ${x.b.rotacion === null ? "—" : formatoRotacion(x.b.rotacion)}`;
  return `Su sell-through pasó de ${x.a.sellThrough === null ? "—" : formatoSellThrough(x.a.sellThrough)} a ${x.b.sellThrough === null ? "—" : formatoSellThrough(x.b.sellThrough)}`;
}

/** «+19 pp», «−4 pp», «0 pp»: puntos porcentuales con signo. */
function formatoPuntos(pp: number): string {
  const n = Math.round(pp);
  return n === 0 ? "0 pp" : `${n > 0 ? "+" : "−"}${Math.abs(n)} pp`;
}

// ---------------------------------------------------------------------------
// FILTROS por cambio
// ---------------------------------------------------------------------------

/** Los filtros del detalle. Los tres primeros son las categorías de la dona (mutuamente excluyentes); «Mejoró
 *  rotación» es transversal: una variante puede mejorarla y, además, haber acelerado. */
export type FiltroCambio = "todos" | "acelero" | "estable" | "desacelero" | "mejoro_rotacion";

export const FILTROS_CAMBIO: readonly { valor: FiltroCambio; texto: string }[] = [
  { valor: "todos", texto: "Todos" },
  { valor: "acelero", texto: "Aceleraron" },
  { valor: "estable", texto: "Estables" },
  { valor: "desacelero", texto: "Desaceleraron" },
  { valor: "mejoro_rotacion", texto: "Mejoró rotación" },
];

export function coincideConCambio(x: AnalisisComparacion, filtro: FiltroCambio): boolean {
  if (filtro === "todos") return true;
  if (filtro === "mejoro_rotacion") return x.mejoroRotacion;
  return x.ritmo?.direccion === filtro;
}

export function filtrarPorCambio(analisis: AnalisisComparacion[], filtro: FiltroCambio): AnalisisComparacion[] {
  return filtro === "todos" ? analisis : analisis.filter((x) => coincideConCambio(x, filtro));
}

/** Cuántas variantes hay en cada filtro (el número de cada botón). */
export function contarCambios(analisis: AnalisisComparacion[]): Record<Exclude<FiltroCambio, "todos">, number> {
  return {
    acelero: analisis.filter((x) => coincideConCambio(x, "acelero")).length,
    estable: analisis.filter((x) => coincideConCambio(x, "estable")).length,
    desacelero: analisis.filter((x) => coincideConCambio(x, "desacelero")).length,
    mejoro_rotacion: analisis.filter((x) => x.mejoroRotacion).length,
  };
}

// ---------------------------------------------------------------------------
// KPI de la vista general
// ---------------------------------------------------------------------------

export type KpiSellThrough = {
  a: number | null;
  b: number | null;
  /** B − A en puntos porcentuales. */
  deltaPp: number | null;
  totalVariantes: number;
  /** Variantes con sell-through calculable en A Y en B: el universo común de la cifra. */
  variantesComparables: number;
  variantesExcluidas: number;
};

export type KpisComparacion = {
  ventas: { a: number; b: number; deltaPct: number | null; unidadesA: number; unidadesB: number };
  /** Rotación del conjunto sobre el universo COMÚN (`rotacionComparada`, en `rotacion.ts`): Σ COGS ÷ Σ inventario
   *  promedio de las variantes con rotación válida en A y en B, las mismas en los dos períodos. Trae también
   *  cuántas variantes quedaron fuera y por qué. */
  rotacion: RotacionComparada;
  sellThrough: KpiSellThrough;
  /** `verificado = false`: hay stock sin costo confiable; la tarjeta muestra unidades. */
  capital: { verificado: boolean; a: number; b: number; delta: number; unidadesA: number; unidadesB: number; sinCosto: number; alterado: number };
};

const tieneStock = (x: AnalisisComparacion) => x.a.stockInicio + x.a.stockCierre + x.b.stockInicio + x.b.stockCierre > 0;
const costoDe = (x: AnalisisComparacion) => x.fila.costo ?? 0;

/**
 * Sell-through del conjunto: LA MISMA fórmula que la de cada variante (`calcularSellThrough`) sobre la suma de
 * ventas, stock al inicio y entradas de las variantes con sell-through calculable en A Y en B — no un promedio de
 * porcentajes, y las mismas variantes en los dos períodos (si A usara unas y B otras, la diferencia mediría el
 * cambio de surtido y no el de la venta).
 */
export function sellThroughComparado(analisis: AnalisisComparacion[]): KpiSellThrough {
  const comunes = analisis.filter((x) => x.a.sellThrough !== null && x.b.sellThrough !== null);
  const total = (p: "a" | "b"): number | null => {
    let ventasNetas = 0;
    let stockInicial = 0;
    let entradas = 0;
    for (const x of comunes) {
      ventasNetas += x[p].ventasNetas;
      stockInicial += x[p].stockInicio;
      entradas += x[p].entradas;
    }
    return calcularSellThrough({ ventasNetas, stockInicial, entradas, ledgerConsistente: true });
  };
  const a = total("a");
  const b = total("b");
  return { a, b, deltaPp: a !== null && b !== null ? b - a : null, totalVariantes: analisis.length, variantesComparables: comunes.length, variantesExcluidas: analisis.length - comunes.length };
}

export function calcularKpis(analisis: AnalisisComparacion[]): KpisComparacion {
  const suma = (f: (x: AnalisisComparacion) => number) => analisis.reduce((t, x) => t + f(x), 0);

  // Costo verificable: la misma regla del «Capital en inventario» del Resumen normal (`costoEsVerificable`).
  const problemas = analisis.filter(tieneStock).filter((x) => !costoEsVerificable(x.fila.costo, x.fila.estadoCosto));
  const verificado = problemas.length === 0;
  const alterado = problemas.filter((x) => x.fila.estadoCosto === "alterado").length;

  const capitalA = suma((x) => x.a.stockCierre * costoDe(x));
  const capitalB = suma((x) => x.b.stockCierre * costoDe(x));
  const unidadesA = suma((x) => x.a.stockCierre);
  const unidadesB = suma((x) => x.b.stockCierre);

  // Rotación del conjunto: la MISMA fórmula que la de cada fila, sobre la suma de COGS y de inventario a costo
  // de las variantes que quedaron tras los filtros Y tienen datos válidos en los dos períodos — no un promedio
  // de razones, y nunca COGS de un universo con inventario de otro. Una variante sin dato no anula el total:
  // queda fuera de las dos sumas y `rotacion` dice cuántas y por qué.
  const rotacion = rotacionComparada(analisis.map((x) => ({ a: x.a.baseRotacion, b: x.b.baseRotacion })));

  const ventasA = suma((x) => x.a.importe);
  const ventasB = suma((x) => x.b.importe);
  return {
    ventas: { a: ventasA, b: ventasB, deltaPct: variacionPct(ventasA, ventasB), unidadesA: suma((x) => x.a.ventasNetas), unidadesB: suma((x) => x.b.ventasNetas) },
    rotacion,
    sellThrough: sellThroughComparado(analisis),
    capital: { verificado, a: capitalA, b: capitalB, delta: capitalB - capitalA, unidadesA, unidadesB, sinCosto: problemas.length - alterado, alterado },
  };
}

// ---------------------------------------------------------------------------
// Evolución del ritmo (la dona) y distribución de sell-through
// ---------------------------------------------------------------------------

export type EvolucionRitmoTotal = {
  /** Variantes con un ritmo comparable de A a B: el número del centro de la dona. */
  total: number;
  acelero: number;
  estable: number;
  desacelero: number;
  /** Variantes a las que no se les puede afirmar (sin ventas, pocos días en venta…): no entran a la dona. */
  sinDato: number;
};

export function evolucionRitmoTotal(analisis: AnalisisComparacion[]): EvolucionRitmoTotal {
  const cuenta = (d: DireccionRitmo) => analisis.filter((x) => x.ritmo?.direccion === d).length;
  const acelero = cuenta("acelero");
  const estable = cuenta("estable");
  const desacelero = cuenta("desacelero");
  const total = acelero + estable + desacelero;
  return { total, acelero, estable, desacelero, sinDato: analisis.length - total };
}

/** En qué rango (índice de `RANGOS_SELL_THROUGH_PCT`) cae un sell-through de 0–100: el porcentaje se redondea al
 *  entero antes de asignarlo, así 25.4 % es «0–25» y 25.5 % es «26–50». */
export function rangoDeSellThrough(pct: number): number {
  const entero = Math.round(pct);
  const i = RANGOS_SELL_THROUGH_PCT.findIndex((tope) => entero <= tope);
  return i === -1 ? RANGOS_SELL_THROUGH_PCT.length - 1 : i;
}

/** «0–25%», «26–50%», «51–75%», «76–100%». */
export function textoRangoSellThrough(i: number): string {
  const desde = i === 0 ? 0 : RANGOS_SELL_THROUGH_PCT[i - 1]! + 1;
  return `${desde}–${RANGOS_SELL_THROUGH_PCT[i]}%`;
}

export type DistribucionSellThrough = {
  rangos: { clave: string; texto: string; a: number; b: number }[];
  /** Variantes sin sell-through calculable en el período (sin stock al inicio ni entradas, o historial que no cuadra). */
  sinDato: { a: number; b: number };
};

/** Cuenta las variantes por rango de sell-through en cada período; cada período con SUS variantes calculables. */
export function distribucionSellThrough(analisis: AnalisisComparacion[]): DistribucionSellThrough {
  const rangos = RANGOS_SELL_THROUGH_PCT.map((_, i) => ({ clave: `r${i}`, texto: textoRangoSellThrough(i), a: 0, b: 0 }));
  const sinDato = { a: 0, b: 0 };
  for (const x of analisis) {
    for (const p of ["a", "b"] as const) {
      const st = x[p].sellThrough;
      if (st === null) sinDato[p] += 1;
      else rangos[rangoDeSellThrough(st)]![p] += 1;
    }
  }
  return { rangos, sinDato };
}

// ---------------------------------------------------------------------------
// Ranking de rotación
// ---------------------------------------------------------------------------

const TOP_ROTACION = 5;

/**
 * Las variantes que más rotaron en B (rotación > 0), de mayor a menor. Solo entran las que tienen rotación
 * CALCULABLE en B: una variante N/D no «rotó cero», no se pudo medir, y no ocupa un lugar (ni se rellena el
 * ranking con ellas). Es un ranking del período B: no exige dato en A (en el gráfico, la barra de A de una
 * variante sin rotación calculable en A simplemente no se dibuja).
 */
export function rankingRotacion(analisis: AnalisisComparacion[], max = TOP_ROTACION): AnalisisComparacion[] {
  return analisis
    .filter((x) => x.b.rotacion !== null && x.b.rotacion > 0)
    .sort((x, y) => y.b.rotacion! - x.b.rotacion! || (y.b.unidadesDia ?? 0) - (x.b.unidadesDia ?? 0))
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Detalle: orden y de la URL a la vista
// ---------------------------------------------------------------------------

export type OrdenComparacion = "vendidos_b" | "crecimiento_ventas" | "rotacion_b" | "mejora_rotacion" | "sell_through_b" | "mejora_sell_through" | "desaceleracion";

export const OPCIONES_ORDEN_COMPARACION: readonly { valor: OrdenComparacion; texto: string }[] = [
  { valor: "vendidos_b", texto: "Más vendidos en B" },
  { valor: "crecimiento_ventas", texto: "Mayor crecimiento de ventas" },
  { valor: "rotacion_b", texto: "Mayor rotación en B" },
  { valor: "mejora_rotacion", texto: "Mayor mejora de rotación" },
  { valor: "sell_through_b", texto: "Mayor sell-through en B" },
  { valor: "mejora_sell_through", texto: "Mayor mejora de sell-through" },
  { valor: "desaceleracion", texto: "Mayor desaceleración" },
];

/** Los dos modos del Análisis de inventario: Desempeño (el período) o Comparar períodos (A contra B). Comparar
 *  ya no se parte en «Vista general / Detalle por producto» (rediseño 2026-09-22): es una sola lectura, cifras →
 *  gráficos → tabla, y un `?vista=detalle` de un enlace viejo simplemente se ignora. */
export type ModoResumen = "desempeno" | "comparar";

/** Comparador que deja lo que no se puede medir (null) siempre al final; lo comparten Desempeño y Comparar. */
export const conNullAlFinal = <T>(f: (x: T) => number | null, sentido: 1 | -1) => (x: T, y: T) => {
  const p = f(x);
  const q = f(y);
  if (p === null && q === null) return 0;
  if (p === null) return 1;
  if (q === null) return -1;
  if (p === q) return 0;
  return (p < q ? -1 : 1) * sentido;
};

/** «Crecimiento de ventas» = cambio del ritmo (unidades por día con stock: comparable aunque A y B duren distinto). */
const crecimientoDelRitmo = (x: AnalisisComparacion): number | null => x.ritmo?.variacionPct ?? null;

export function ordenarComparacion(analisis: AnalisisComparacion[], orden: OrdenComparacion): AnalisisComparacion[] {
  const porVendidos = conNullAlFinal<AnalisisComparacion>((x) => x.b.ventasNetas, -1);
  const por = (f: (x: AnalisisComparacion) => number | null, sentido: 1 | -1) => (x: AnalisisComparacion, y: AnalisisComparacion) => conNullAlFinal<AnalisisComparacion>(f, sentido)(x, y) || porVendidos(x, y);
  const criterio: Record<OrdenComparacion, (x: AnalisisComparacion, y: AnalisisComparacion) => number> = {
    vendidos_b: porVendidos,
    crecimiento_ventas: por(crecimientoDelRitmo, -1),
    rotacion_b: por((z) => z.b.rotacion, -1),
    mejora_rotacion: por((z) => z.deltaRotacion, -1),
    sell_through_b: por((z) => z.b.sellThrough, -1),
    mejora_sell_through: por((z) => z.deltaSellThroughPp, -1),
    desaceleracion: por((z) => z.ritmo?.variacionPct ?? null, 1), // la caída más grande (el % más negativo) primero
  };
  return [...analisis].sort(criterio[orden]);
}

type ParamsCrudos = Record<string, string | string[] | undefined>;
const primero = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** ¿La URL pide la comparación de dos períodos? (`?modo=comparar`). */
export function pideComparacion(params: ParamsCrudos): boolean {
  return primero(params.modo) === "comparar";
}

export function leerVistaComparacion(p: ParamsCrudos): { alcance: AlcanceResumen; cambio: FiltroCambio; orden: OrdenComparacion; pagina: number } {
  const { alcance, pagina } = leerFiltros(p);
  const cambioUrl = primero(p.cambio);
  const orden = primero(p.orden);
  return {
    alcance,
    cambio: FILTROS_CAMBIO.find((f) => f.valor === cambioUrl)?.valor ?? "todos",
    orden: OPCIONES_ORDEN_COMPARACION.find((o) => o.valor === orden)?.valor ?? "vendidos_b",
    pagina,
  };
}

// ---------------------------------------------------------------------------
// Armado de la pantalla
// ---------------------------------------------------------------------------

export type PeriodoComparado = { rango: Rango; dias: number; etiqueta: string };

/** Todo lo que viaja al componente cliente: agregados y UNA página de filas. */
export type ComparacionParaPantalla = {
  ubicacion: Ubicacion;
  /** A = el período de referencia (contra el que se compara); B = el período analizado. */
  periodoA: PeriodoComparado & { modo: ModoComparacion };
  /** Lo que resolvió la URL para B, más su etiqueta de fechas («20 ago – 19 sep»). */
  periodoB: PeriodoResuelto & { etiquetaCorta: string };
  ahoraIso: string;
  alcance: AlcanceResumen;
  cambio: FiltroCambio;
  orden: OrdenComparacion;
  kpis: KpisComparacion;
  evolucion: EvolucionRitmoTotal;
  ranking: AnalisisComparacion[];
  distribucion: DistribucionSellThrough;
  /** Cuántas variantes hay en cada filtro del detalle (dentro del alcance de categoría y búsqueda). */
  conteoCambios: Record<Exclude<FiltroCambio, "todos">, number>;
  categorias: { id: string; nombre: string; variantes: number }[];
  tabla: { filas: AnalisisComparacion[]; pagina: number; paginas: number; total: number; totalAlcance: number; totalSede: number };
  exactitud: EstadoExactitud;
  /** Cosas que la persona debe saber antes de creer una cifra (períodos de distinta duración, superpuestos…). */
  avisos: string[];
  /** Variantes cuyo historial de movimientos no cuadra con el stock de hoy (cifras estimadas). */
  estimadas: number;
};

/** Qué fechas hay que pedirle a la RPC: A es «comparar con» y B el período analizado. */
export function rangosDeLaComparacion(params: ParametrosResumen, ahora: Date): { rangoA: Rango; modoA: ModoComparacion; periodoB: PeriodoResuelto } {
  const { periodo, modo, comparacion } = rangosDelResumen(params, ahora);
  if (comparacion) return { rangoA: comparacion, modoA: modo, periodoB: periodo };
  // «Sin comparación» no tiene sentido aquí: A es obligatorio y se cae en «período anterior».
  return { rangoA: resolverComparacion(periodo, "anterior")!, modoA: "anterior", periodoB: periodo };
}

export function avisosDeComparacion(a: Rango, b: Rango): string[] {
  const avisos: string[] = [];
  const diasA = diasDelRango(a);
  const diasB = diasDelRango(b);
  if (diasA !== diasB) {
    avisos.push(`Los períodos duran distinto (A: ${pluralizar(diasA, "día", "días")}, B: ${pluralizar(diasB, "día", "días")}): las ventas y la rotación se comparan tal cual; el ritmo (unidades por día) sí es comparable.`);
  }
  if (a.desde <= b.hasta && b.desde <= a.hasta) {
    avisos.push("Los períodos se superponen: parte de las ventas cuenta en los dos.");
  }
  return avisos;
}

export function armarComparacion(e: {
  filas: FilaComparacion[];
  ubicacion: Ubicacion;
  params: ParametrosResumen;
  ahora: Date;
  conteos: { exactitud: { porcentaje: number; lineas: number; conteos: number } | null; ultimoCerradoEn: string | null };
}): ComparacionParaPantalla {
  const { rangoA, modoA, periodoB } = rangosDeLaComparacion(e.params, e.ahora);
  const { alcance, cambio, orden, pagina } = leerVistaComparacion(e.params);
  const rangoB: Rango = { desde: periodoB.desde, hasta: periodoB.hasta };
  const diasA = diasDelRango(rangoA);
  // Si los dos períodos no caen en el mismo año se dice el año en ambos: «21 jul – 19 ago»
  // contra «20 ago – 19 sep» de otro año se leería como dos períodos del mismo año.
  const conAnio = rangoA.desde.slice(0, 4) !== rangoB.desde.slice(0, 4) || rangoA.hasta.slice(0, 4) !== rangoB.hasta.slice(0, 4);

  const todas = e.filas.map((f) => analizarVarianteComparacion(f, diasA, periodoB.dias));
  const enAlcance = aplicarAlcance(todas, alcance);
  const enVista = ordenarComparacion(filtrarPorCambio(enAlcance, cambio), orden);
  const p = paginar(enVista, pagina, FILAS_POR_PAGINA);

  return {
    ubicacion: e.ubicacion,
    periodoA: { rango: rangoA, dias: diasA, etiqueta: etiquetaRango(rangoA, conAnio), modo: modoA },
    periodoB: { ...periodoB, etiquetaCorta: etiquetaRango(rangoB, conAnio) },
    ahoraIso: e.ahora.toISOString(),
    alcance,
    cambio,
    orden,
    // Los agregados salen de TODO el alcance (categoría y búsqueda): el filtro de cambio solo recorta la tabla,
    // así tocar «Aceleraron» en la dona no mueve ninguna cifra.
    kpis: calcularKpis(enAlcance),
    evolucion: evolucionRitmoTotal(enAlcance),
    ranking: rankingRotacion(enAlcance),
    distribucion: distribucionSellThrough(enAlcance),
    conteoCambios: contarCambios(enAlcance),
    categorias: listarCategorias(todas),
    tabla: { filas: p.items, pagina: p.pagina, paginas: p.paginas, total: p.total, totalAlcance: enAlcance.length, totalSede: todas.length },
    exactitud: evaluarExactitud(e.conteos, e.ahora),
    avisos: avisosDeComparacion(rangoA, rangoB),
    estimadas: enAlcance.filter((x) => !x.fila.ledgerConsistente).length,
  };
}
