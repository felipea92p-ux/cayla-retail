// Reglas del panel de rentabilidad (ADR-0118). La ÚNICA casa de "qué significan" los números que devuelve
// `fn_rentabilidad`: el SQL suma unidades, venta neta (sin IGV), costo, descuento y stock; acá se decide cuándo un margen
// es confiable, cómo se lee la rotación y qué es "vende mucho pero deja poco". Puro TypeScript, sin base de datos: se
// prueba sin Docker.
//
// TRES COSAS QUE ESTA PANTALLA NO PUEDE HACER MAL, porque las tres producen una ganancia INVENTADA sin ningún error:
//   1. El margen es sobre venta SIN IGV (lo hace el SQL). Con IGV, una blusa de S/118 que costó S/60 "deja S/58" cuando
//      deja S/40: el margen saldría inflado un 18%.
//   2. Un costo en cero no es un costo. Esas líneas ya vienen fuera del margen (`ventaNetaConCosto`); acá se decide qué
//      decir: sin ningún costo cargado NO hay margen ("—", nunca "100%"), y con poco costo cargado el margen es "parcial".
//   3. Una fila con pocas ventas no dice nada: con 3 unidades vendidas un margen puede ser cualquier cosa.
//
// COMPARACIÓN CONTRA LA MEDIANA DE LAS DEMÁS FILAS. "Vende mucho" y "deja poco" son relativos: se miden contra la mediana de
// las filas comparables de esa MISMA tabla (la mediana no se deja arrastrar por un caso extremo, como sí haría el promedio).
// Solo entran a la mediana filas con muestra y costo suficientes; con menos de MIN_FILAS_REFERENCIA no se compara.
//
// SIMPLIFICACIONES DECLARADAS: los umbrales son provisionales (se calibran con Felipe con meses reales); el margen es ANTES
// de devoluciones (la pantalla de Calidad cuenta esa otra mitad); la velocidad se mide sobre TODA la ventana, así que un
// producto recién lanzado parecerá lento; y el stock no se atribuye a un origen.

/** Menos de estas unidades vendidas: un margen no dice nada todavía. */
export const MUESTRA_MINIMA_VENTAS = 10;
/** Debajo de esta fracción de la venta con costo cargado, el margen es "parcial". */
export const COBERTURA_MINIMA = 0.8;
/** Filas comparables mínimas para calcular una mediana con sentido. */
export const MIN_FILAS_REFERENCIA = 5;

export type NivelRentabilidad = "producto" | "categoria" | "temporada" | "origen" | "total";

/** Una fila de `fn_rentabilidad`, ya en camelCase. */
export type FilaRentabilidad = {
  nivel: NivelRentabilidad;
  clave: string;
  etiqueta: string;
  unidades: number;
  /** Venta SIN IGV, todo lo vendido. */
  ventaNeta: number;
  /** Venta SIN IGV, solo de las líneas con costo cargado. */
  ventaNetaConCosto: number;
  /** Costo de las líneas con costo cargado. */
  costo: number;
  unidadesSinCosto: number;
  /** Lo rebajado del precio de lista, CON IGV. */
  descuento: number;
  devueltas: number;
  /** Unidades vendibles hoy; null en el nivel origen (no se atribuye). */
  stock: number | null;
  diasVentana: number;
};

export type Lectura =
  | "inventario_parado"
  | "vende_mucho_deja_poco"
  | "deja_bien_rota_lento"
  | "estrella"
  | "normal"
  | "sin_costo"
  | "costo_parcial"
  | "muestra_chica"
  | "sin_referencia";

export type FilaEvaluada = FilaRentabilidad & {
  /** Venta con costo − costo. Null si no hay costo cargado (no se inventa). */
  margen: number | null;
  /** Margen ÷ venta con costo. Null si no hay costo cargado. */
  margenPct: number | null;
  /** Fracción de la venta que tiene costo cargado (0 a 1). Null si no hubo venta. */
  cobertura: number | null;
  /** Unidades vendidas por día en la ventana. */
  velocidad: number;
  /** stock ÷ velocidad. Null si no hay stock que medir o no se vendió nada. */
  diasInventario: number | null;
  /** vendidas ÷ (vendidas + stock). Null si no hay dato. */
  sellThrough: number | null;
  lectura: Lectura;
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export function margen(f: Pick<FilaRentabilidad, "ventaNetaConCosto" | "costo">): number | null {
  return f.ventaNetaConCosto > 0 ? redondear2(f.ventaNetaConCosto - f.costo) : null;
}

export function margenPct(f: Pick<FilaRentabilidad, "ventaNetaConCosto" | "costo">): number | null {
  const m = margen(f);
  return m === null ? null : m / f.ventaNetaConCosto;
}

export function cobertura(f: Pick<FilaRentabilidad, "ventaNeta" | "ventaNetaConCosto">): number | null {
  return f.ventaNeta > 0 ? f.ventaNetaConCosto / f.ventaNeta : null;
}

/** Cuánto se rebajó, como fracción del precio de lista (ambos CON IGV). `igv` es la tasa, p. ej. 0,18. */
export function descuentoSobreLista(f: Pick<FilaRentabilidad, "ventaNeta" | "descuento">, igv: number): number | null {
  const pagado = f.ventaNeta * (1 + igv);
  const lista = pagado + f.descuento;
  return lista > 0 ? f.descuento / lista : null;
}

export function velocidadDiaria(unidades: number, diasVentana: number): number {
  return diasVentana > 0 ? unidades / diasVentana : 0;
}

export function diasDeInventario(stock: number | null, velocidad: number): number | null {
  if (stock === null || stock <= 0 || velocidad <= 0) return null;
  return stock / velocidad;
}

export function sellThrough(unidades: number, stock: number | null): number | null {
  if (stock === null) return null;
  const total = unidades + stock;
  return total > 0 ? unidades / total : null;
}

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/** ¿Esta fila sirve para comparar? Con muestra y costo suficientes. */
function esComparable(f: FilaRentabilidad): boolean {
  const c = cobertura(f);
  return f.unidades >= MUESTRA_MINIMA_VENTAS && c !== null && c >= COBERTURA_MINIMA && margenPct(f) !== null;
}

function evaluarUna(f: FilaRentabilidad, ref: Referencia | null): FilaEvaluada {
  const velocidad = velocidadDiaria(f.unidades, f.diasVentana);
  const base = {
    ...f,
    margen: margen(f),
    margenPct: margenPct(f),
    cobertura: cobertura(f),
    velocidad,
    diasInventario: diasDeInventario(f.stock, velocidad),
    sellThrough: sellThrough(f.unidades, f.stock),
  };

  let lectura: Lectura;
  const c = base.cobertura;
  if (f.unidades === 0 && (f.stock ?? 0) > 0) {
    lectura = "inventario_parado";
  } else if (f.ventaNeta > 0 && (c === null || c === 0)) {
    lectura = "sin_costo";
  } else if (f.unidades < MUESTRA_MINIMA_VENTAS) {
    lectura = "muestra_chica";
  } else if (c !== null && c < COBERTURA_MINIMA) {
    lectura = "costo_parcial";
  } else if (ref === null || base.margenPct === null) {
    lectura = "sin_referencia";
  } else {
    const altoVolumen = f.unidades >= ref.unidades;
    const altoMargen = base.margenPct >= ref.margenPct;
    const lento = base.sellThrough !== null && ref.sellThrough !== null && base.sellThrough < ref.sellThrough;
    if (altoVolumen && !altoMargen) lectura = "vende_mucho_deja_poco";
    else if (altoMargen && lento) lectura = "deja_bien_rota_lento";
    else if (altoVolumen && altoMargen) lectura = "estrella";
    else lectura = "normal";
  }
  return { ...base, lectura };
}

type Referencia = { unidades: number; margenPct: number; sellThrough: number | null };

/** La mediana de las filas comparables de una tabla. Null si hay muy pocas para comparar. */
export function referenciaDe(filas: readonly FilaRentabilidad[]): Referencia | null {
  const comparables = filas.filter(esComparable);
  if (comparables.length < MIN_FILAS_REFERENCIA) return null;
  const st = comparables.map((f) => sellThrough(f.unidades, f.stock)).filter((x): x is number => x !== null);
  return {
    unidades: mediana(comparables.map((f) => f.unidades)) ?? 0,
    margenPct: mediana(comparables.map((f) => margenPct(f) ?? 0)) ?? 0,
    sellThrough: st.length >= MIN_FILAS_REFERENCIA ? mediana(st) : null,
  };
}

const ORDEN_LECTURA: Record<Lectura, number> = {
  inventario_parado: 0,
  vende_mucho_deja_poco: 1,
  deja_bien_rota_lento: 2,
  estrella: 3,
  normal: 4,
  costo_parcial: 5,
  sin_costo: 6,
  muestra_chica: 7,
  sin_referencia: 8,
};

/**
 * Excepciones primero: inventario parado, lo que vende mucho y deja poco, lo que deja bien y rota lento; después lo sano
 * (por margen en soles, de más a menos); al final lo que no se puede juzgar (costo parcial, sin costo, muestra chica).
 */
export function ordenarPorLectura(filas: readonly FilaEvaluada[]): FilaEvaluada[] {
  return [...filas].sort((a, b) => {
    const porLectura = ORDEN_LECTURA[a.lectura] - ORDEN_LECTURA[b.lectura];
    if (porLectura !== 0) return porLectura;
    if (a.lectura === "inventario_parado") return (b.stock ?? 0) - (a.stock ?? 0) || a.etiqueta.localeCompare(b.etiqueta, "es");
    if (a.lectura === "vende_mucho_deja_poco") return b.unidades - a.unidades || a.etiqueta.localeCompare(b.etiqueta, "es");
    return (b.margen ?? -Infinity) - (a.margen ?? -Infinity) || b.unidades - a.unidades || a.etiqueta.localeCompare(b.etiqueta, "es");
  });
}

export type RentabilidadAgrupada = {
  total: FilaEvaluada;
  producto: FilaEvaluada[];
  categoria: FilaEvaluada[];
  temporada: FilaEvaluada[];
  origen: FilaEvaluada[];
};

const FILA_VACIA: FilaRentabilidad = {
  nivel: "total", clave: "", etiqueta: "Total", unidades: 0, ventaNeta: 0, ventaNetaConCosto: 0, costo: 0,
  unidadesSinCosto: 0, descuento: 0, devueltas: 0, stock: 0, diasVentana: 0,
};

/** Separa por vista, evalúa cada fila contra la mediana de su propia tabla y ordena. */
export function agrupar(filas: readonly FilaRentabilidad[]): RentabilidadAgrupada {
  const de = (nivel: NivelRentabilidad) => {
    const delNivel = filas.filter((f) => f.nivel === nivel);
    const ref = referenciaDe(delNivel);
    return ordenarPorLectura(delNivel.map((f) => evaluarUna(f, ref)));
  };
  return {
    total: evaluarUna(filas.find((f) => f.nivel === "total") ?? FILA_VACIA, null),
    producto: de("producto"),
    categoria: de("categoria"),
    temporada: de("temporada"),
    origen: de("origen"),
  };
}

/** Texto corto y honesto para cada lectura. Va SIEMPRE con texto: nunca solo un color. */
export function textoLectura(l: Lectura): string {
  switch (l) {
    case "inventario_parado":
      return "Inventario parado: hay stock y no se vendió nada";
    case "vende_mucho_deja_poco":
      return "Vende mucho y deja poco margen";
    case "deja_bien_rota_lento":
      return "Deja buen margen pero rota lento";
    case "estrella":
      return "Vende bien y deja bien";
    case "normal":
      return "Dentro de lo normal";
    case "costo_parcial":
      return "Margen parcial: falta el costo de parte de lo vendido";
    case "sin_costo":
      return "Sin costo cargado: no se puede calcular el margen";
    case "muestra_chica":
      return `Muestra chica (menos de ${MUESTRA_MINIMA_VENTAS} unidades)`;
    case "sin_referencia":
      return "Pocas filas para comparar";
  }
}

/** ¿Esta lectura pide que alguien mire la fila? (para el rojo y para las listas de arriba) */
export function pideAtencion(l: Lectura): boolean {
  return l === "inventario_parado" || l === "vende_mucho_deja_poco" || l === "deja_bien_rota_lento";
}
