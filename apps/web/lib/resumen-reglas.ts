import { MIN_DIAS_CON_STOCK_AFIRMAR, MIN_DIAS_CON_STOCK_VELOCIDAD, UMBRAL_COBERTURA_CRITICA_DIAS, UMBRAL_COBERTURA_RIESGO_DIAS, UMBRAL_COBERTURA_SALUDABLE_DIAS } from "./inventario-reglas";

// Velocidad y cobertura de cada variante (ADR-0101; rehechas en ADR-0121). Puras,
// sin servidor: la RPC `fn_resumen_variantes` trae NÚMEROS crudos por variante y
// sede, y acá se decide qué significan. Los umbrales salen de `inventario-reglas.ts`.
// Nacieron para el Resumen de Inventario (el Análisis de antes de la v4); hoy las
// usan Existencias, Producción y el Observatorio. El sell-through, las curvas rotas,
// la reserva y el motor de reposición del Resumen se borraron con él (2026-10-06):
// ninguna pantalla los usaba.

// ---------------------------------------------------------------------------
// Entrada: una fila de `fn_resumen_variantes` ya mapeada a camelCase.
// ---------------------------------------------------------------------------

export type TipoUbicacion = "tienda" | "almacen" | "taller";

export type UbicacionRed = {
  ubicacionId: string;
  nombre: string;
  tipo: TipoUbicacion;
  separaPisoAlmacen: boolean;
  disponible: number;
  /** Piso + almacén (o todo lo no dañado donde no hay esa separación). */
  utilizable: number;
  piso: number;
  /** Lo que un traslado puede sacar: el almacén en una tienda, todo en el Taller. */
  almacen: number;
  diasObservables: number | null;
  diasConStock: number | null;
  ledgerConsistente: boolean;
  ventasVentana: number;
  devolucionesVentana: number;
  enCamino: number;
};

/** Qué tan verificado está el costo de una variante (`fn_resumen_variantes`). */
export type EstadoCosto = "oficial" | "declarado" | "alterado" | "sin_costo";

export type OrigenAbastecimiento = "compra" | "produccion" | "ambos";

export type FilaResumen = {
  varianteId: string;
  productoId: string;
  productoCodigo: string | null;
  /** 'activo' o cualquier otro (descontinuado…): un producto que no está activo no se repone. */
  productoEstado: string;
  referencia: string;
  categoriaId: string | null;
  categoria: string | null;
  sku: string;
  codigo: string | null;
  codigosBarras: string[];
  talla: string | null;
  colorCodigo: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  precio: number | null;
  /** Solo viaja a líderes. */
  costo: number | null;
  estadoCosto: EstadoCosto | null;
  stockMinimo: number | null;
  separaPisoAlmacen: boolean;
  piso: number;
  almacen: number;
  /** Stock sin sububicación en una tienda que separa piso/almacén (reingreso de
   *  una anulación): está en la tienda, pero ni en piso ni en almacén. */
  sinUbicar: number;
  cuarentena: number;
  /** Todo lo que no es cuarentena. */
  disponible: number;
  /** Lo que se puede usar en la sede: piso + almacén (o `disponible` donde no hay esa separación). */
  utilizable: number;
  primerIngreso: string | null;
  diasObservables: number | null;
  /** Días (con decimales) que la variante estuvo EN VENTA dentro del período. */
  diasConStock: number | null;
  /** false = el ledger no explica el stock de hoy: `diasConStock` no es fiable. */
  ledgerConsistente: boolean;
  stockInicial: number;
  ventas: number;
  devoluciones: number;
  ultimaVenta: string | null;
  entradas: number;
  mermas: number;
  trasladosSalida: number;
  ventasCmp: number;
  devolucionesCmp: number;
  diasConStockCmp: number | null;
  enCamino: number;
  enCaminoATiempo: number;
  enCaminoAtrasado: boolean;
  proximaLlegada: string | null;
  proximoTrasladoId: string | null;
  origenAbastecimiento: OrigenAbastecimiento | null;
  enRed: UbicacionRed[];
};

/** Piso + almacén donde la tienda los separa; todo lo no dañado donde no. */
export function calcularUtilizable(separaPisoAlmacen: boolean, piso: number, almacen: number, disponible: number): number {
  return separaPisoAlmacen ? piso + almacen : disponible;
}

// ---------------------------------------------------------------------------
// VELOCIDAD — «¿cuántas unidades de esta variante se venden por día?»
// ---------------------------------------------------------------------------
//
// Definición canónica (una sola: la usan Existencias, Producción y el Observatorio):
//
//     velocidad = unidades netas vendidas ÷ días EN VENTA del período
//
//  · Netas = ventas − devoluciones (y cambios, que ya vienen dentro de ambos
//    lados: la prenda que se llevó suma como venta y la que volvió resta).
//    Nunca negativas. Las ventas anuladas no llegan nunca a este número: la RPC
//    las descarta por el estado real de la venta.
//  · Días en venta = los días (con decimales) en que había stock en el piso
//    (fn_resumen_variantes.dias_con_stock). Una prenda que vendió 10 unidades
//    en los 5 días que tuvo stock y luego estuvo 25 días agotada vende 2/día, no
//    0.33: no se la castiga por los días en que NO pudo venderse.
//  · Si el ledger no explica el stock de hoy (`ledgerConsistente = false`), el
//    denominador cae a los días desde que la prenda llegó a la sede (ADR-0101) y
//    la velocidad se marca `estimada`.
//  · Con menos de 3 días en venta no se calcula nada («poco historial»), y no se
//    afirma «sin ventas» con menos de 14: cinco días sin venta es una racha.

export type EstadoVelocidad = "ok" | "sin_ventas" | "poco_historial" | "sin_historial";

export type Velocidad = {
  estado: EstadoVelocidad;
  /** Unidades por día; null cuando no hay base honesta para calcularla. */
  unidadesDia: number | null;
  /** El denominador usado (días). */
  diasBase: number | null;
  metodo: "dias_con_stock" | "ventana_observable" | null;
  ventasNetas: number;
  /** true = denominador aproximado porque el ledger no cuadra. */
  estimada: boolean;
};

export type EntradaVelocidad = {
  ventas: number;
  devoluciones: number;
  diasConStock: number | null;
  diasObservables: number | null;
  ledgerConsistente: boolean;
};

export function ventasNetasDe(ventas: number, devoluciones: number): number {
  return Math.max(ventas - devoluciones, 0);
}

export function calcularVelocidad(e: EntradaVelocidad): Velocidad {
  const ventasNetas = ventasNetasDe(e.ventas, e.devoluciones);
  const usaLedger = e.ledgerConsistente && e.diasConStock !== null;
  const base = usaLedger ? e.diasConStock : e.diasObservables;
  const metodo = base === null ? null : usaLedger ? "dias_con_stock" : "ventana_observable";
  const estimada = metodo === "ventana_observable";

  if (base === null || base <= 0) {
    return { estado: ventasNetas > 0 ? "poco_historial" : "sin_historial", unidadesDia: null, diasBase: base, metodo, ventasNetas, estimada };
  }
  if (base < MIN_DIAS_CON_STOCK_VELOCIDAD) {
    return { estado: "poco_historial", unidadesDia: null, diasBase: base, metodo, ventasNetas, estimada };
  }
  if (ventasNetas > 0) {
    return { estado: "ok", unidadesDia: ventasNetas / base, diasBase: base, metodo, ventasNetas, estimada };
  }
  // Cero ventas: solo se afirma «no se vende» con evidencia suficiente.
  return {
    estado: base >= MIN_DIAS_CON_STOCK_AFIRMAR ? "sin_ventas" : "poco_historial",
    unidadesDia: null,
    diasBase: base,
    metodo,
    ventasNetas,
    estimada,
  };
}

// ---------------------------------------------------------------------------
// COBERTURA — «al ritmo reciente, ¿cuántos días dura lo que tengo hoy?»
// ---------------------------------------------------------------------------
//
//     cobertura = stock UTILIZABLE actual de la sede ÷ velocidad
//
// Utilizable = piso + almacén (sin cuarentena, sin «sin ubicar», sin la variante
// centinela, sin variantes inactivas). El tránsito NO es stock. El stock es
// siempre el de HOY.

export type Cobertura = {
  tipo: "agotado" | "medida" | "sin_ventas" | "sin_historial";
  /** Días; null salvo en «medida» (en «agotado» es 0). */
  dias: number | null;
};

export function calcularCobertura(utilizable: number, v: Velocidad): Cobertura {
  if (utilizable <= 0) return { tipo: "agotado", dias: 0 };
  if (v.estado === "ok" && v.unidadesDia) return { tipo: "medida", dias: utilizable / v.unidadesDia };
  if (v.estado === "sin_ventas") return { tipo: "sin_ventas", dias: null };
  return { tipo: "sin_historial", dias: null };
}

export type BandaCobertura = "agotado" | "critica" | "atencion" | "saludable" | "alta" | "sin_historial";

export const ETIQUETA_BANDA: Record<BandaCobertura, string> = {
  agotado: "Agotado",
  critica: `≤ ${UMBRAL_COBERTURA_CRITICA_DIAS} días`,
  atencion: `${UMBRAL_COBERTURA_CRITICA_DIAS + 1} – ${UMBRAL_COBERTURA_RIESGO_DIAS} días`,
  saludable: `${UMBRAL_COBERTURA_RIESGO_DIAS + 1} – ${UMBRAL_COBERTURA_SALUDABLE_DIAS} días`,
  alta: `${UMBRAL_COBERTURA_SALUDABLE_DIAS}+ días`,
  sin_historial: "Sin historial",
};

export function bandaDeCobertura(c: Cobertura): BandaCobertura {
  switch (c.tipo) {
    case "agotado":
      return "agotado";
    case "sin_ventas":
      return "alta";
    case "sin_historial":
      return "sin_historial";
    case "medida": {
      const d = c.dias ?? 0;
      if (d <= UMBRAL_COBERTURA_CRITICA_DIAS) return "critica";
      if (d <= UMBRAL_COBERTURA_RIESGO_DIAS) return "atencion";
      if (d <= UMBRAL_COBERTURA_SALUDABLE_DIAS) return "saludable";
      return "alta";
    }
  }
}

// ---------------------------------------------------------------------------
// La velocidad de una fila de `fn_resumen_variantes`
// ---------------------------------------------------------------------------

export function velocidadDeFila(f: FilaResumen): Velocidad {
  return calcularVelocidad({ ventas: f.ventas, devoluciones: f.devoluciones, diasConStock: f.diasConStock, diasObservables: f.diasObservables, ledgerConsistente: f.ledgerConsistente });
}
