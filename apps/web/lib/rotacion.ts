import type { EstadoCosto } from "./resumen-reglas";

// ROTACIÓN DE INVENTARIO — la definición oficial de Cayla, en UN solo lugar (2026-09-19, ADR-0138).
//
//     rotación = COGS del período ÷ inventario promedio a costo
//
// Numerador y denominador están en la misma unidad (soles a costo) y se calculan sobre EXACTAMENTE el
// mismo universo: si el conjunto es una categoría, un producto o una variante, tanto el COGS como el
// inventario son solo los suyos. Nunca se promedian razones ni se mezclan universos.
//
// De dónde sale cada parte, y por qué NO es otra cosa:
//   · COGS      = costo de las unidades netas vendidas: la suma del `costo_unitario` que cada venta guardó
//                 ESE día (`venta_items`), menos el costo de lo devuelto. No es ingreso ni precio, ni el
//                 costo de hoy.
//   · Inventario = unidades × costo unitario (verificable), al inicio y al cierre del período.
//   · Unidades vendidas ÷ unidades promedio NO es la rotación de inventario de Cayla y no se muestra con
//     ese nombre (si un día hace falta, se llamará `rotacionUnidades`).
//
// UNA VARIANTE ES ESTRICTA: lo que no se puede calcular es N/D — nunca un número inventado. Ventas a las
// que ninguna fuente dio costo, stock sin costo verificable, historial de movimientos que no cuadra con el
// stock de hoy o un inventario promedio de cero. No se estima, no se reemplaza por unidades, no se usa el
// precio. Una prenda sin ventas pero con inventario SÍ rota: 0 veces.
//
// UN AGREGADO (tienda, categoría, búsqueda) SE CALCULA SOBRE EL UNIVERSO CONFIABLE (`rotacionAgregada`):
//
//     Σ COGS de las variantes válidas  ÷  Σ inventario promedio de LAS MISMAS variantes válidas
//
// Es razón de sumas, NO el promedio de las razones de cada variante (una prenda de inventario chico y
// rotación enorme no puede pesar lo mismo que una de inventario grande). Una variante N/D queda fuera de
// las DOS sumas —si entrara solo una, el cociente mezclaría universos— y el agregado dice cuántas quedaron
// fuera y por qué (`UniversoRotacion`). Solo si NINGUNA variante es válida, el agregado es N/D. No hay un
// mínimo de cobertura (p. ej. «al menos 80 %»): se decidirá con datos reales; el universo ya viaja
// completo (`porcentajeVariantesValidas`) para poder exigirlo sin cambiar la forma de nada.
//
// COMPARAR A vs B SE CALCULA SOBRE EL UNIVERSO COMÚN (`rotacionComparada`): las variantes con rotación
// válida en A Y en B. A y B se calculan sobre esas mismas variantes: si A usara unas y B otras, la
// diferencia mediría el cambio de universo y no el del inventario.
//
// LIMITACIONES CONOCIDAS (a propósito, sin parche):
//
//   1. PROMEDIO DE DOS PUNTOS. Cayla no guarda una serie diaria de inventario, así que el inventario
//      promedio es (valor al inicio + valor al cierre) ÷ 2. Una prenda que recibe stock a mitad del período
//      (inicio 0 → cierre 90) queda con un promedio de 45 sin importar el día en que llegó, y su rotación
//      sale más alta de lo que fue.
//
//   2. VALORACIÓN AL COSTO VIGENTE. El COGS conserva el costo HISTÓRICO de cada venta (`venta_items`),
//      pero el inventario del inicio y del cierre se valora con el costo VIGENTE de hoy (`variantes.costo`,
//      la misma regla del «Capital en inventario»): no hay todavía un costo «a la fecha» del stock. Si el
//      costo de una prenda cambió dentro o después del período, numerador y denominador están a precios
//      distintos: un costo que subió infla el inventario y baja la rotación, y uno que bajó hace lo
//      contrario. No se inventa un costo anterior ni se reconstruyen lotes históricos.
//
//   OBJETIVO DEFINITIVO: COGS histórico del período ÷ promedio TEMPORAL del valor histórico del inventario a
//   costo, valorando cada tramo con el costo que regía en ese momento (`costo_historial` lo permite). Hoy es
//   una aproximación consciente y así se dice. Los dos puntos de sustitución son `BaseRotacion.
//   inventarioPromedioTemporal` (el promedio) y `baseRotacionDeVariante` (donde entra el costo): los
//   consumidores solo pasan la base y leen el resultado, y los textos de ayuda que describen el método viven
//   aquí abajo, junto al fallback, para que cambiar el método no obligue a tocar ninguna pantalla.

/** Los insumos de una rotación. `null` = no se pudo obtener con fiabilidad (la rotación queda N/D). */
export type BaseRotacion = {
  /** Costo de lo vendido, neto de devoluciones (a costo histórico: el de cada venta). */
  cogs: number | null;
  /** Valor del inventario a costo al inicio y al cierre del período (hoy, valorado al costo VIGENTE). */
  inventarioInicio: number | null;
  inventarioCierre: number | null;
  /** Reservado: promedio TEMPORAL (diario) del valor del inventario a costo. Si viene, reemplaza al de dos puntos. */
  inventarioPromedioTemporal?: number | null;
};

export type MotivoSinRotacion = "ventas_sin_costo" | "inventario_sin_valor" | "sin_inventario";

export const TEXTO_MOTIVO_ROTACION: Record<MotivoSinRotacion, string> = {
  ventas_sin_costo: "Hay ventas sin costo registrado",
  inventario_sin_valor: "Hay stock sin costo verificable o sin historial fiable",
  sin_inventario: "No hubo inventario promedio en el período",
};

/** El orden en que se listan los motivos: primero lo que el equipo puede corregir cargando un costo. */
export const MOTIVOS_SIN_ROTACION: readonly MotivoSinRotacion[] = ["ventas_sin_costo", "inventario_sin_valor", "sin_inventario"];

export type MetodoPromedio = "temporal" | "extremos";

/**
 * La rotación de UNA variante (o de un conjunto ya sumado). `calculable` distingue los dos estados sin
 * dejar combinaciones imposibles: con `calculable` hay `veces`, COGS e inventario y no hay motivo; sin él,
 * `veces` es null (N/D) y `motivo` dice por qué.
 */
export type Rotacion =
  | {
      calculable: true;
      /** Veces que rotó el inventario. */
      veces: number;
      motivo: null;
      cogs: number;
      inventarioPromedio: number;
      /** Cómo se promedió el inventario: `temporal` (serie diaria) o `extremos` ((inicio + cierre) ÷ 2). */
      metodo: MetodoPromedio;
    }
  | {
      calculable: false;
      veces: null;
      motivo: MotivoSinRotacion;
      cogs: number | null;
      inventarioPromedio: number | null;
      metodo: MetodoPromedio | null;
    };

/**
 * Con qué universo se calculó un agregado. `variantesValidas` son las que entran a la razón; el resto
 * (`variantesExcluidas`) quedó fuera de numerador y denominador, cada una con UN motivo. Es lo que una
 * pantalla necesita para decir «97 de 100 variantes con datos válidos» sin recontar nada.
 */
export type UniversoRotacion = {
  totalVariantes: number;
  variantesValidas: number;
  variantesExcluidas: number;
  /** 0–100; null si no había ninguna variante. */
  porcentajeVariantesValidas: number | null;
  excluidasPorMotivo: Record<MotivoSinRotacion, number>;
};

/** Rotación de un conjunto de variantes de UN período: Σ COGS ÷ Σ inventario promedio de las válidas. */
export type RotacionAgregada = UniversoRotacion & {
  /** null = N/D: ninguna variante del conjunto tiene datos válidos. */
  veces: number | null;
  /** Numerador y denominador de `veces`, sumados sobre las MISMAS variantes válidas. */
  cogs: number;
  inventarioPromedio: number;
};

/**
 * Rotación A → B de un conjunto de variantes. `variantesValidas` es aquí el universo COMÚN: las calculables
 * en A y en B a la vez; `a` y `b` se calculan sobre esas mismas y `deltaPct` es la variación entre ellas.
 */
export type RotacionComparada = UniversoRotacion & {
  a: number | null;
  b: number | null;
  /** (B − A) ÷ A; null si A o B es N/D o si A es 0 (no hay base para un porcentaje). */
  deltaPct: number | null;
  cogsA: number;
  inventarioPromedioA: number;
  cogsB: number;
  inventarioPromedioB: number;
  /** Cuántas variantes tenían rotación válida solo en A y solo en B (antes de cruzarlas). */
  validasEnA: number;
  validasEnB: number;
};

/**
 * Un costo unitario sirve para valorar inventario si es positivo y verificable: `oficial` (promedio
 * ponderado de compras/producción) o `declarado` (el del alta). Es la MISMA regla que ya usa el «Capital en
 * inventario» del Resumen: `alterado` y `sin_costo` no se toman por buenos.
 */
export function costoEsVerificable(costo: number | null, estado: EstadoCosto | null): costo is number {
  return costo !== null && costo > 0 && (estado === "oficial" || estado === "declarado");
}

/**
 * COGS neto del período a partir de sus componentes: costo de lo vendido menos costo de lo devuelto, sin
 * bajar de cero. Si alguna unidad vendida o devuelta no tiene costo (`unidadesSinCosto > 0`) no hay COGS
 * confiable: null.
 */
export function cogsNeto(e: { costoVentas: number; costoDevoluciones: number; unidadesSinCosto: number }): number | null {
  if (e.unidadesSinCosto > 0) return null;
  return Math.max(e.costoVentas - e.costoDevoluciones, 0);
}

/** Valor a costo de `unidades`; sin unidades no hace falta costo (vale 0), con unidades y sin costo verificable, null. */
export function valorInventario(unidades: number, costo: number | null, estado: EstadoCosto | null): number | null {
  const u = Math.max(unidades, 0);
  if (u === 0) return 0;
  return costoEsVerificable(costo, estado) ? u * costo : null;
}

/**
 * Los insumos de UNA variante en UN período.
 *
 * `costo` es el costo VIGENTE de la variante: con él se valoran el stock del inicio y el del cierre (limitación 2
 * del encabezado). El COGS, en cambio, ya llega a costo histórico dentro de `costoVentas`/`costoDevoluciones`.
 * El día que exista el costo a la fecha, entra aquí y solo aquí.
 */
export function baseRotacionDeVariante(e: {
  costoVentas: number;
  costoDevoluciones: number;
  unidadesSinCosto: number;
  stockInicio: number;
  stockCierre: number;
  costo: number | null;
  estadoCosto: EstadoCosto | null;
  /** false = el historial de movimientos no explica el stock de hoy: el stock al inicio no es fiable. */
  ledgerConsistente: boolean;
}): BaseRotacion {
  const cogs = cogsNeto(e);
  if (!e.ledgerConsistente) return { cogs, inventarioInicio: null, inventarioCierre: null };
  return {
    cogs,
    inventarioInicio: valorInventario(e.stockInicio, e.costo, e.estadoCosto),
    inventarioCierre: valorInventario(e.stockCierre, e.costo, e.estadoCosto),
  };
}

/** Inventario promedio a costo: el temporal si existe; si no, el de dos puntos; si tampoco se puede, null. */
export function inventarioPromedioACosto(b: BaseRotacion): { valor: number; metodo: MetodoPromedio } | { valor: null; metodo: null } {
  if (b.inventarioPromedioTemporal !== undefined && b.inventarioPromedioTemporal !== null) return { valor: b.inventarioPromedioTemporal, metodo: "temporal" };
  if (b.inventarioInicio === null || b.inventarioCierre === null) return { valor: null, metodo: null };
  return { valor: (b.inventarioInicio + b.inventarioCierre) / 2, metodo: "extremos" };
}

/** LA rotación: COGS ÷ inventario promedio a costo. La única fórmula; todo lo que diga «Rotación» sale de acá. */
export function calcularRotacion(b: BaseRotacion): Rotacion {
  const promedio = inventarioPromedioACosto(b);
  const no = (motivo: MotivoSinRotacion): Rotacion => ({ calculable: false, veces: null, motivo, cogs: b.cogs, inventarioPromedio: promedio.valor, metodo: promedio.metodo });
  if (b.cogs === null) return no("ventas_sin_costo");
  if (promedio.valor === null) return no("inventario_sin_valor");
  if (promedio.valor <= 0) return no("sin_inventario");
  return { calculable: true, veces: b.cogs / promedio.valor, motivo: null, cogs: b.cogs, inventarioPromedio: promedio.valor, metodo: promedio.metodo };
}

/** Variación porcentual de la rotación de B contra la de A; null si falta una o si A es 0 (no hay base). */
export function variacionRotacionPct(a: number | null, b: number | null): number | null {
  if (a === null || b === null || a <= 0) return null;
  return ((b - a) / a) * 100;
}

// ---------------------------------------------------------------------------
// Agregados: universo confiable (un período) y universo común (A contra B)
// ---------------------------------------------------------------------------

const motivosEnCero = (): Record<MotivoSinRotacion, number> => ({ ventas_sin_costo: 0, inventario_sin_valor: 0, sin_inventario: 0 });

function describirUniverso(total: number, validas: number, excluidasPorMotivo: Record<MotivoSinRotacion, number>): UniversoRotacion {
  return {
    totalVariantes: total,
    variantesValidas: validas,
    variantesExcluidas: total - validas,
    porcentajeVariantesValidas: total > 0 ? (validas / total) * 100 : null,
    excluidasPorMotivo,
  };
}

/**
 * Rotación de un conjunto de variantes sobre su universo confiable: Σ COGS ÷ Σ inventario promedio de las
 * que se pueden calcular. Cada variante aporta su propio promedio (temporal si lo tiene, si no el de dos
 * puntos): el agregado no sabe qué método se usó y no lo duplica.
 */
export function rotacionAgregada(bases: readonly BaseRotacion[]): RotacionAgregada {
  const excluidasPorMotivo = motivosEnCero();
  let cogs = 0;
  let inventarioPromedio = 0;
  let validas = 0;
  for (const base of bases) {
    const r = calcularRotacion(base);
    if (!r.calculable) {
      excluidasPorMotivo[r.motivo] += 1;
      continue;
    }
    cogs += r.cogs;
    inventarioPromedio += r.inventarioPromedio;
    validas += 1;
  }
  // Toda variante válida tiene promedio > 0, así que con al menos una el denominador es positivo.
  const veces = validas > 0 ? cogs / inventarioPromedio : null;
  return { veces, cogs, inventarioPromedio, ...describirUniverso(bases.length, validas, excluidasPorMotivo) };
}

/**
 * Rotación de A contra B sobre el universo COMÚN: solo las variantes calculables en los dos períodos, las
 * mismas en A y en B. Cada excluida cuenta una vez, con el motivo de A si A falló y si no el de B.
 */
export function rotacionComparada(pares: readonly { a: BaseRotacion; b: BaseRotacion }[]): RotacionComparada {
  const excluidasPorMotivo = motivosEnCero();
  const comunes: { a: BaseRotacion; b: BaseRotacion }[] = [];
  let validasEnA = 0;
  let validasEnB = 0;
  for (const par of pares) {
    const ra = calcularRotacion(par.a);
    const rb = calcularRotacion(par.b);
    if (ra.calculable) validasEnA += 1;
    if (rb.calculable) validasEnB += 1;
    const falla = !ra.calculable ? ra.motivo : !rb.calculable ? rb.motivo : null;
    if (falla === null) comunes.push(par);
    else excluidasPorMotivo[falla] += 1;
  }
  const a = rotacionAgregada(comunes.map((p) => p.a));
  const b = rotacionAgregada(comunes.map((p) => p.b));
  return {
    a: a.veces,
    b: b.veces,
    deltaPct: variacionRotacionPct(a.veces, b.veces),
    cogsA: a.cogs,
    inventarioPromedioA: a.inventarioPromedio,
    cogsB: b.cogs,
    inventarioPromedioB: b.inventarioPromedio,
    validasEnA,
    validasEnB,
    ...describirUniverso(pares.length, comunes.length, excluidasPorMotivo),
  };
}

// ---------------------------------------------------------------------------
// Textos de ayuda del método (junto al fallback: si el método cambia, cambian aquí y en ningún otro lado)
// ---------------------------------------------------------------------------

/** La fórmula en una línea (sin punto final: sirve de pie de tarjeta). */
export const TEXTO_FORMULA_ROTACION = "COGS del período ÷ inventario promedio a costo";

/** Cómo se estima HOY el inventario promedio (el fallback de dos puntos). */
export const TEXTO_PROMEDIO_ROTACION = "El inventario promedio se estima con los valores de inicio y cierre del período";

/** El tooltip de la columna y de la tarjeta: la fórmula y cómo se estima su promedio. */
export const AYUDA_ROTACION = `${TEXTO_FORMULA_ROTACION}. ${TEXTO_PROMEDIO_ROTACION}.`;

/** Para el panel de ayuda (hay espacio): de dónde sale cada costo HOY (limitación 2), dicho sin más. */
export const TEXTO_VALORACION_ROTACION = "El COGS usa el costo que guardó cada venta ese día y el inventario se valora al costo actual de cada prenda.";

/** Para el panel de ayuda: dónde falla la aproximación de dos puntos (limitación 1). */
export const TEXTO_LIMITACION_PROMEDIO = "Si una prenda recibe stock a mitad del período, ese promedio no sabe cuándo llegó y su rotación puede salir sobrestimada.";
