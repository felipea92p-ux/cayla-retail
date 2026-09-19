import {
  ALTA_DEMANDA_MIN_UDS_DIA,
  ALTA_DEMANDA_PERCENTIL,
  DIAS_CONTEO_VIGENTE,
  DIAS_COBERTURA_MINIMA_ORIGEN,
  DIAS_OBJETIVO_COBERTURA,
  DIAS_OBJETIVO_PISO,
  DIAS_PISO_ALERTA,
  DIAS_RESERVA_SEGURIDAD,
  EXACTITUD_ACEPTABLE_PCT,
  MIN_DIAS_CON_STOCK_AFIRMAR,
  MIN_DIAS_CON_STOCK_VELOCIDAD,
  MIN_UNIDADES_SOBRESTOCK,
  SELL_THROUGH_BAJO_PCT,
  TENDENCIA_UMBRAL_PCT,
  UMBRAL_COBERTURA_ALTA_DIAS,
  UMBRAL_COBERTURA_CRITICA_DIAS,
  UMBRAL_COBERTURA_RIESGO_DIAS,
  UMBRAL_COBERTURA_SALUDABLE_DIAS,
  UMBRAL_REPOSICION_PISO,
  UMBRAL_STOCK_BAJO_ALMACEN,
} from "./inventario-reglas";
import { detectarHuecosCurva } from "./curva-variantes";
import { compararTallas } from "./tallas";
import { formatoCoberturaConUnidad, formatoVelocidad, nombreCorto, pluralizar } from "./resumen-formato";

// Reglas del Resumen de Inventario (ADR-0101; rehechas en ADR-0113). Puras, sin
// servidor: la RPC `fn_resumen_variantes` trae NÚMEROS crudos por variante y
// sede, y acá se decide qué significan. Es el único lugar donde viven la
// velocidad, la cobertura, el sell-through, las curvas rotas, la reserva y el
// motor de reposición — y todos los umbrales salen de `inventario-reglas.ts`.
//
// La unidad de comunicación de la pantalla es
//     HECHO → VELOCIDAD → RIESGO → OPORTUNIDAD → ACCIÓN
// y cada tipo de este archivo es uno de esos eslabones.

// ---------------------------------------------------------------------------
// Entrada: una fila de `fn_resumen_variantes` ya mapeada a camelCase.
// ---------------------------------------------------------------------------

export type TipoUbicacion = "tienda" | "almacen" | "taller";
export type Ubicacion = { id: string; nombre: string; tipo: TipoUbicacion };

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
// Definición canónica (una sola, la usan la tabla, los gráficos y el motor):
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
// centinela, sin variantes inactivas). El tránsito NO es stock: solo entra a la
// cobertura PROYECTADA del motor de reposición. El stock es siempre el de HOY,
// aunque el período elegido sea de agosto.

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

/** Del más urgente al más holgado — el orden del gráfico de cobertura. */
export const BANDAS_COBERTURA: readonly BandaCobertura[] = ["agotado", "critica", "atencion", "saludable", "alta", "sin_historial"];

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
// SELL-THROUGH — «¿qué proporción de lo disponible se logró vender?»
// ---------------------------------------------------------------------------
//
//     sell-through = ventas netas ÷ (stock utilizable al INICIO del período + lo
//                    que llegó de afuera durante el período)
//
// La definición clásica (unidades vendidas sobre unidades disponibles para
// vender). Se arma con el stock de inicio reconstruido del ledger, no con el de
// hoy, así que un período de agosto mide agosto. Lo que salió por otra vía
// (traslado, merma) queda dentro de «disponible» y por eso baja el número: no se
// vendió. Sin ledger consistente o sin base, no hay número.

export function calcularSellThrough(e: { ventasNetas: number; stockInicial: number; entradas: number; ledgerConsistente: boolean }): number | null {
  if (!e.ledgerConsistente) return null;
  const base = e.stockInicial + e.entradas;
  if (base <= 0) return null;
  return Math.round(Math.min(e.ventasNetas / base, 1) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// TENDENCIA — la velocidad de este período contra la del de comparación.
// ---------------------------------------------------------------------------

export type Tendencia = {
  direccion: "alza" | "baja" | "estable" | "sin_dato";
  variacionPct: number | null;
  unidadesDiaPrevia: number | null;
  ventasNetasPrevias: number;
};

export function calcularTendencia(actual: Velocidad, previa: Velocidad | null): Tendencia | null {
  if (previa === null) return null;
  const base = { unidadesDiaPrevia: previa.unidadesDia, ventasNetasPrevias: previa.ventasNetas };
  const a = actual.estado === "ok" ? actual.unidadesDia! : actual.estado === "sin_ventas" ? 0 : null;
  const p = previa.estado === "ok" ? previa.unidadesDia! : null;
  if (a === null || p === null || p <= 0) return { ...base, direccion: "sin_dato", variacionPct: null };
  const variacionPct = ((a - p) / p) * 100;
  const direccion = variacionPct >= TENDENCIA_UMBRAL_PCT ? "alza" : variacionPct <= -TENDENCIA_UMBRAL_PCT ? "baja" : "estable";
  return { ...base, direccion, variacionPct };
}

// ---------------------------------------------------------------------------
// RESERVA DE SEGURIDAD — una capa sutil, no una tarjeta.
// ---------------------------------------------------------------------------
//
// Lo que se vende mientras llega un traslado: DIAS_RESERVA_SEGURIDAD de venta,
// al menos 1 unidad. Se DERIVA de la velocidad de cada variante; no se configura.
// No es `productos.stock_minimo` (Catálogo: por producto y red, avisa cuándo
// pedir al proveedor) ni los umbrales de piso/almacén de Existencias (política
// fija por tienda) — son tres cosas distintas y por eso no comparten nombre.
// Influye en: el stock objetivo, la marca «bajo reserva» y cuánto puede ceder una
// sede.

export function reservaDeSeguridad(v: Velocidad): number | null {
  if (v.estado !== "ok" || !v.unidadesDia) return null;
  return Math.max(1, Math.ceil(v.unidadesDia * DIAS_RESERVA_SEGURIDAD));
}

// ---------------------------------------------------------------------------
// CURVAS ROTAS — para moda, una talla que falta vuelve invendible al resto.
// ---------------------------------------------------------------------------
//
// La curva de un producto+color en esta sede son las tallas con variante dada de
// alta que alguna vez pasaron por ella (la RPC no trae las que jamás la pisaron):
// una talla que el producto nunca tuvo no es un faltante. Una talla FALTA cuando
// no queda stock utilizable y además:
//  · hueco — hay stock en una talla menor y en una mayor (S 8 · M 0 · L 7), o
//  · demanda — se vendió en el período y todavía queda otra talla con stock:
//    también las puntas, si es una talla que la clienta pide.
// Un producto que no está activo no tiene curva que completar.

export type CurvaTalla = { varianteId: string; talla: string; utilizable: number; ventasNetas: number };

export type CurvaRota = {
  clave: string;
  productoId: string;
  referencia: string;
  colorCodigo: string | null;
  color: string | null;
  colorHex: string | null;
  categoria: string | null;
  /** Todas las tallas de la curva, en orden canónico. */
  tallas: CurvaTalla[];
  faltantes: { varianteId: string; talla: string; motivo: "hueco" | "demanda" }[];
};

export type CurvaDeVariante = { curva: CurvaRota; motivo: "hueco" | "demanda" };

function claveCurva(f: FilaResumen): string {
  return `${f.productoId}::${f.colorCodigo ?? ""}`;
}

export function detectarCurvasRotas(filas: FilaResumen[], ventasNetasPorVariante: Map<string, number>): CurvaRota[] {
  const grupos = new Map<string, FilaResumen[]>();
  for (const f of filas) {
    if (f.talla === null || f.productoEstado !== "activo") continue;
    const clave = claveCurva(f);
    (grupos.get(clave) ?? grupos.set(clave, []).get(clave)!).push(f);
  }

  const curvas: CurvaRota[] = [];
  for (const [clave, miembros] of grupos) {
    const ordenados = [...miembros].sort((a, b) => compararTallas(a.talla!, b.talla!));
    const tallas: CurvaTalla[] = ordenados.map((f) => ({
      varianteId: f.varianteId,
      talla: f.talla!,
      utilizable: f.utilizable,
      ventasNetas: ventasNetasPorVariante.get(f.varianteId) ?? 0,
    }));

    const huecos = new Set(detectarHuecosCurva(tallas.map((t) => ({ varianteId: t.varianteId, talla: t.talla, stock: t.utilizable }))).map((h) => h.tallaFaltante));
    const hayStock = tallas.some((t) => t.utilizable > 0);
    const faltantes: CurvaRota["faltantes"] = [];
    for (const t of tallas) {
      if (t.utilizable > 0) continue;
      if (huecos.has(t.talla)) faltantes.push({ varianteId: t.varianteId, talla: t.talla, motivo: "hueco" });
      else if (t.ventasNetas > 0 && hayStock) faltantes.push({ varianteId: t.varianteId, talla: t.talla, motivo: "demanda" });
    }
    if (faltantes.length === 0) continue;

    const primera = ordenados[0];
    curvas.push({ clave, productoId: primera.productoId, referencia: primera.referencia, colorCodigo: primera.colorCodigo, color: primera.color, colorHex: primera.colorHex, categoria: primera.categoria, tallas, faltantes });
  }
  return curvas;
}

// ---------------------------------------------------------------------------
// ORIGEN — cuánto puede ceder otra sede sin crearse su propio problema.
// ---------------------------------------------------------------------------
//
//  · El Taller (y un almacén central) no vende a clientas: cede todo lo que tiene.
//  · Una tienda cede solo desde su ALMACÉN (un traslado nunca vacía el piso: el
//    formulario de traslados topa en el almacén) y conserva:
//      - el umbral de reserva de Existencias (si no, quedaría en «Stock bajo»
//        y su propio Resumen le pediría la prenda de vuelta), y
//      - DIAS_COBERTURA_MINIMA_ORIGEN días de SU propia venta (su punto de
//        reposición más su reserva de seguridad).
//    Cede el MENOR de las dos holguras.
//  · Una tienda sin historial suficiente no se toca: no sabemos qué necesita.
//  · Lo que ya viajó hacia esa tienda no se cuenta como suyo (conservador) y lo
//    que ella ya despachó ya no está en su stock (sale al enviarlo).

export type Cedible = { unidades: number; conserva: number; motivo: string };

export function cedibleDe(o: UbicacionRed): Cedible {
  if (o.tipo !== "tienda") {
    return { unidades: Math.max(o.disponible, 0), conserva: 0, motivo: `${nombreCorto(o.nombre)} no vende a clientas` };
  }
  const v = calcularVelocidad({
    ventas: o.ventasVentana,
    devoluciones: o.devolucionesVentana,
    diasConStock: o.diasConStock,
    diasObservables: o.diasObservables,
    ledgerConsistente: o.ledgerConsistente,
  });
  if (v.estado !== "ok" && v.estado !== "sin_ventas") {
    return { unidades: 0, conserva: o.utilizable, motivo: `${nombreCorto(o.nombre)} sin historial suficiente para saber qué necesita` };
  }
  const porUmbralAlmacen = o.separaPisoAlmacen ? Math.max(o.almacen - (UMBRAL_STOCK_BAJO_ALMACEN + 1), 0) : Math.max(o.disponible, 0);
  const conservaPorVenta = v.estado === "ok" ? Math.ceil(v.unidadesDia! * DIAS_COBERTURA_MINIMA_ORIGEN) : 0;
  const porCobertura = Math.max(o.utilizable - conservaPorVenta, 0);
  const unidades = Math.min(porUmbralAlmacen, porCobertura);
  const conserva = o.utilizable - unidades;
  const detalle =
    v.estado === "ok"
      ? `vende ${formatoVelocidad(v.unidadesDia!)}/día y conserva ${conserva} (≈ ${formatoCoberturaConUnidad(conserva / v.unidadesDia!)})`
      : `no vendió esta prenda en ${Math.round(v.diasBase ?? 0)} días y conserva ${conserva}`;
  return { unidades, conserva, motivo: `${nombreCorto(o.nombre)} ${detalle}` };
}

// ---------------------------------------------------------------------------
// MOTOR DE REPOSICIÓN — determinista y explicable, en este orden:
//   1. Almacén de la misma tienda  → «Bajar X al piso»
//   2. Mercadería ya en camino     → «Esperar llegada»
//   3. Otras sedes (tiendas)       → «Trasladar X desde …»
//   4. Taller                      → «Pedir X al Taller»
//   5. Nadie puede dar             → «Revisar compra / producción»
//   6. Sobrestock                  → no se repone (mantener / revisar liquidación)
//
// Cantidad (nunca «si tiene menos de N, llevar hasta N»):
//     objetivo = ceil(velocidad × DIAS_OBJETIVO_COBERTURA) + reserva
//     faltante = objetivo − (stock utilizable + lo que llega a tiempo)
// Si el historial no alcanza para estimar la velocidad, NO se finge una
// cantidad: el paso es «Revisar reposición» y dice por qué.
// ---------------------------------------------------------------------------

export type TipoPaso =
  | "bajar_al_piso"
  | "esperar_llegada"
  | "trasladar"
  | "pedir_al_taller"
  | "revisar_abastecimiento"
  | "revisar_reposicion"
  | "ubicar_stock"
  | "revisar_liquidacion";

export type PasoPlan = {
  tipo: TipoPaso;
  cantidad: number | null;
  texto: string;
  motivo: string;
  /** true = una persona tiene que hacer algo (el resto es esperar o mirar). */
  accionable: boolean;
  origen?: { id: string; nombre: string; tipo: TipoUbicacion; disponible: number; cedible: number; conserva: number };
  trasladoId?: string | null;
  diasLlegada?: number | null;
};

export type Urgencia = "alta" | "media" | "baja" | "ninguna";

export type PlanReposicion = {
  pasos: PasoPlan[];
  /** El primer paso que pide una acción (o, si solo hay que esperar, ese). */
  principal: PasoPlan | null;
  urgencia: Urgencia;
  reserva: number | null;
  objetivo: number | null;
  /** Lo que falta sobre lo que hay y lo que llega a tiempo; null si no se puede estimar. */
  faltante: number | null;
  /** Por qué CAYLA dice lo que dice, en frases cortas para el detalle. */
  explicacion: string[];
};

export type ContextoPlan = {
  f: FilaResumen;
  velocidad: Velocidad;
  cobertura: Cobertura;
  destino: Ubicacion;
  ahora: Date;
  motivo: "demanda" | "curva";
};

/** Cuántas sedes de origen entran en un mismo plan: más que eso deja de ser una recomendación. */
const MAX_ORIGENES = 2;

const MS_DIA = 86_400_000;

function diasHasta(iso: string | null, ahora: Date): number | null {
  return iso ? (new Date(iso).getTime() - ahora.getTime()) / MS_DIA : null;
}

export function textoLlegada(dias: number | null): string {
  if (dias === null) return "";
  if (dias <= 0.5) return " hoy";
  if (dias <= 1.5) return " mañana";
  return ` en ${Math.round(dias)} días`;
}

function planVacio(explicacion: string[] = []): PlanReposicion {
  return { pasos: [], principal: null, urgencia: "ninguna", reserva: null, objetivo: null, faltante: null, explicacion };
}

export function planDeReposicion(c: ContextoPlan): PlanReposicion {
  const { f, velocidad: v, cobertura, destino, ahora, motivo } = c;
  const explicacion: string[] = [];

  // El Taller (o un almacén) no vende a clientas: su stock es para distribuir.
  if (destino.tipo !== "tienda") return planVacio(f.utilizable > 0 ? [`${nombreCorto(destino.nombre)} no vende a clientas: su stock está para distribuir`] : []);

  const pasos: PasoPlan[] = [];
  const demanda = v.estado === "ok" ? v.unidadesDia! : null;
  const reserva = reservaDeSeguridad(v);
  const agotadaConDemanda = f.utilizable <= 0 && v.ventasNetas > 0;
  const criticaOAgotada = agotadaConDemanda || (cobertura.tipo === "medida" && (cobertura.dias ?? Infinity) <= UMBRAL_COBERTURA_CRITICA_DIAS);
  const bajoPuntoDeReposicion = cobertura.tipo === "medida" && (cobertura.dias ?? Infinity) <= UMBRAL_COBERTURA_RIESGO_DIAS;
  const descontinuada = f.productoEstado !== "activo";

  // 0. Unidades que están en la tienda pero sin ubicar (reingreso de una
  //    anulación): no son vendibles ni utilizables hasta que alguien las ubique.
  if (f.separaPisoAlmacen && f.sinUbicar > 0 && f.piso + f.almacen === 0) {
    pasos.push({
      tipo: "ubicar_stock",
      cantidad: f.sinUbicar,
      texto: `Ubicar ${f.sinUbicar} en piso o almacén`,
      motivo: `${pluralizar(f.sinUbicar, "unidad", "unidades")} sin ubicar (reingreso de una anulación): no se pueden vender hasta que estén en piso o almacén`,
      accionable: true,
    });
    return { pasos, principal: pasos[0], urgencia: "media", reserva, objetivo: null, faltante: null, explicacion: [pasos[0].motivo] };
  }

  // 1. Almacén de la misma tienda → bajar al piso. El POS vende SOLO del piso: lo
  //    que está atrás no se vende hasta que alguien lo baje, y bajarlo no cuesta nada.
  if (f.separaPisoAlmacen && f.almacen > 0) {
    if (demanda !== null) {
      const pisoCubreDias = f.piso / demanda;
      if (pisoCubreDias < DIAS_PISO_ALERTA) {
        const objetivoPiso = Math.ceil(demanda * DIAS_OBJETIVO_PISO);
        const cantidad = Math.min(f.almacen, Math.max(1, objetivoPiso - f.piso));
        pasos.push({
          tipo: "bajar_al_piso",
          cantidad,
          texto: `Bajar ${cantidad} al piso`,
          motivo: `El piso (${f.piso}) alcanza para ${formatoCoberturaConUnidad(pisoCubreDias)} al ritmo de ${formatoVelocidad(demanda)}/día; el almacén de la tienda tiene ${f.almacen}`,
          accionable: true,
        });
      }
    } else if (f.piso === 0) {
      const cantidad = Math.min(f.almacen, UMBRAL_REPOSICION_PISO + 1);
      pasos.push({
        tipo: "bajar_al_piso",
        cantidad,
        texto: `Bajar ${cantidad} al piso`,
        motivo: `No hay nada en el piso y sí ${f.almacen} en el almacén de la tienda: sin bajarlo no se puede vender`,
        accionable: true,
      });
    }
  }

  // ¿Hace falta traer mercadería de afuera? Solo bajo el punto de reposición,
  // agotada con demanda, o para tapar una talla de la curva. Un producto que ya no
  // está activo no se repone.
  const necesitaAfuera = !descontinuada && (motivo === "curva" || agotadaConDemanda || bajoPuntoDeReposicion);
  let faltante: number | null = null;
  let objetivo: number | null = null;

  if (necesitaAfuera) {
    if (demanda === null && motivo !== "curva") {
      // Hay señal de demanda pero no historial para medirla: no se inventa una cantidad.
      pasos.push({
        tipo: "revisar_reposicion",
        cantidad: null,
        texto: "Revisar reposición",
        motivo:
          v.diasBase !== null && v.diasBase > 0
            ? `Solo ${formatoCoberturaConUnidad(v.diasBase)} con stock en el período: todavía no alcanza para estimar cuánto reponer`
            : "No hay días con stock suficientes en el período para estimar cuánto reponer",
        accionable: true,
      });
    } else {
      const disponibleProyectado = f.utilizable;
      // Lo que ya viaja solo cuenta si llega antes de que se agote lo que hay (un día de gracia).
      const diasLlegada = diasHasta(f.proximaLlegada, ahora);
      const margen = (cobertura.tipo === "medida" ? cobertura.dias ?? 0 : 0) + 1;
      const llegaATiempo = f.enCaminoATiempo > 0 && (diasLlegada === null || diasLlegada <= margen);
      const entrante = llegaATiempo ? f.enCaminoATiempo : 0;

      if (demanda !== null && reserva !== null) {
        objetivo = Math.ceil(demanda * DIAS_OBJETIVO_COBERTURA) + reserva;
        faltante = objetivo - disponibleProyectado - entrante;
      } else {
        // Talla de la curva sin ritmo medible: con 1 unidad la talla vuelve a existir.
        faltante = 1 - entrante;
      }
      if (motivo === "curva") faltante = Math.max(faltante, 1 - entrante);

      if (f.enCaminoATiempo > 0 && !llegaATiempo) {
        explicacion.push(`Llegan +${f.enCaminoATiempo}${textoLlegada(diasLlegada)}: después de agotarse lo que hay, no se cuentan`);
      }
      if (f.enCaminoAtrasado) explicacion.push(`Hay ${f.enCamino - f.enCaminoATiempo} en un traslado atrasado: no se cuentan`);

      if (entrante > 0) {
        pasos.push({
          tipo: "esperar_llegada",
          cantidad: entrante,
          texto: "Esperar llegada",
          motivo: `Llegan +${entrante}${textoLlegada(diasLlegada)}${faltante <= 0 ? ": alcanza para cubrir lo que falta" : ` (todavía faltan ${faltante} más)`}`,
          accionable: false,
          trasladoId: f.proximoTrasladoId,
          diasLlegada,
        });
      }

      if (faltante > 0) {
        // 3 y 4. Tiendas primero (solo lo que les sobra), después el Taller.
        const candidatos = f.enRed
          .map((o) => ({ o, ced: cedibleDe(o) }))
          .filter((x) => x.ced.unidades > 0)
          .sort((a, b) => Number(a.o.tipo !== "tienda") - Number(b.o.tipo !== "tienda") || b.ced.unidades - a.ced.unidades || a.o.nombre.localeCompare(b.o.nombre, "es"));
        let restante = faltante;
        let usados = 0;
        for (const { o, ced } of candidatos) {
          if (restante <= 0 || usados >= MAX_ORIGENES) break;
          const cantidad = Math.min(restante, ced.unidades);
          const origen = { id: o.ubicacionId, nombre: o.nombre, tipo: o.tipo, disponible: o.disponible, cedible: ced.unidades, conserva: ced.conserva };
          if (o.tipo === "tienda") {
            pasos.push({ tipo: "trasladar", cantidad, texto: `Trasladar ${cantidad} desde ${nombreCorto(o.nombre)}`, motivo: `${nombreCorto(o.nombre)} puede ceder ${ced.unidades}: ${ced.motivo}`, accionable: true, origen });
          } else {
            const texto = o.tipo === "taller" ? `Pedir ${cantidad} al Taller` : `Pedir ${cantidad} a ${nombreCorto(o.nombre)}`;
            pasos.push({ tipo: "pedir_al_taller", cantidad, texto, motivo: `${nombreCorto(o.nombre)} tiene ${o.disponible} y no vende a clientas`, accionable: true, origen });
          }
          restante -= cantidad;
          usados += 1;
        }
        if (restante > 0) {
          const etiqueta =
            f.origenAbastecimiento === "produccion" ? "Revisar producción" : f.origenAbastecimiento === "compra" ? "Revisar compra" : "Revisar compra o producción";
          pasos.push({
            tipo: "revisar_abastecimiento",
            cantidad: restante,
            texto: etiqueta,
            motivo:
              usados === 0
                ? f.enRed.length === 0
                  ? "Ninguna otra sede tiene esta prenda: hay que reponerla desde afuera"
                  : "Las otras sedes no pueden ceder sin quedarse cortas"
                : `Aun con lo que cedan las otras sedes, faltarían ~${restante}`,
            accionable: true,
          });
        }
      }
    }
  }

  const principal = pasos.find((p) => p.accionable) ?? pasos[0] ?? null;
  const urgencia: Urgencia = criticaOAgotada
    ? "alta"
    : bajoPuntoDeReposicion || (motivo === "curva" && v.ventasNetas > 0)
      ? "media"
      : pasos.some((p) => p.accionable)
        ? "baja"
        : "ninguna";

  for (const p of pasos) explicacion.unshift(p.motivo);
  return { pasos, principal, urgencia, reserva, objetivo, faltante, explicacion };
}

// ---------------------------------------------------------------------------
// ESTADO de cada variante — lo que dice la columna «Estado / interpretación».
// ---------------------------------------------------------------------------

export type EstadoResumen =
  | "agotada_demanda"
  | "cobertura_critica"
  | "curva_rota"
  | "sin_piso"
  | "cobertura_baja"
  | "posible_sobrestock"
  | "agotada"
  | "venta_estable"
  | "sin_historial"
  | "alta_demanda"
  | "en_alza"
  | "en_baja"
  | "descontinuada";

export type TonoResumen = "rojo" | "ambar" | "verde" | "neutro";

export type ChipResumen = { clave: EstadoResumen; texto: string; tono: TonoResumen; ayuda: string };

export const ETIQUETA_ESTADO: Record<EstadoResumen, string> = {
  agotada_demanda: "Agotada con demanda",
  cobertura_critica: "Cobertura crítica",
  curva_rota: "Curva rota",
  sin_piso: "Sin piso",
  cobertura_baja: "Cobertura baja",
  posible_sobrestock: "Posible sobrestock",
  agotada: "Agotada",
  venta_estable: "Venta estable",
  sin_historial: "Sin historial",
  alta_demanda: "Alta demanda",
  en_alza: "En alza",
  en_baja: "En baja",
  descontinuada: "Descontinuada",
};

/** Orden de importancia: el primero que aplica es el principal, y solo se
 *  muestran los dos primeros (una fila con seis chips no dice nada). */
const ORDEN_CHIPS: EstadoResumen[] = [
  "agotada_demanda",
  "cobertura_critica",
  "curva_rota",
  "sin_piso",
  "cobertura_baja",
  "alta_demanda",
  "posible_sobrestock",
  "en_baja",
  "en_alza",
  "descontinuada",
  "agotada",
  "venta_estable",
  "sin_historial",
];

/** Se pinta rojo solo lo que es urgente de verdad. */
const TONO_ESTADO: Record<EstadoResumen, TonoResumen> = {
  agotada_demanda: "rojo",
  cobertura_critica: "rojo",
  curva_rota: "ambar",
  sin_piso: "ambar",
  cobertura_baja: "ambar",
  posible_sobrestock: "ambar",
  agotada: "neutro",
  venta_estable: "verde",
  sin_historial: "neutro",
  alta_demanda: "ambar",
  en_alza: "verde",
  en_baja: "neutro",
  descontinuada: "neutro",
};

/** Cuán arriba va en «Prioridades»: menor = más arriba. */
const RANGO_ESTADO: Partial<Record<EstadoResumen, number>> = {
  agotada_demanda: 0,
  cobertura_critica: 1,
  curva_rota: 2,
  sin_piso: 3,
  cobertura_baja: 4,
  posible_sobrestock: 5,
  agotada: 6,
  venta_estable: 7,
  sin_historial: 8,
};

// ---------------------------------------------------------------------------
// Análisis de una variante y de la sede
// ---------------------------------------------------------------------------

export type AnalisisVariante = {
  fila: FilaResumen;
  velocidad: Velocidad;
  velocidadPrevia: Velocidad | null;
  tendencia: Tendencia | null;
  cobertura: Cobertura;
  banda: BandaCobertura;
  sellThrough: number | null;
  reserva: number | null;
  /** Lo utilizable no alcanza ni para la reserva de seguridad. */
  bajoReserva: boolean;
  altaDemanda: boolean;
  descontinuada: boolean;
  curva: CurvaDeVariante | null;
  estados: EstadoResumen[];
  chips: ChipResumen[];
  plan: PlanReposicion;
  /** Para ordenar: menor = más arriba. */
  rango: number;
  /** Ventas por día valorizadas al precio: desempata dentro de un mismo rango. */
  impacto: number;
};

export type OpcionesAnalisis = {
  ahora: Date;
  /** ¿Se eligió un período de comparación? (sin él no hay tendencia). */
  hayComparacion: boolean;
};

const chipDe = (clave: EstadoResumen, texto: string, ayuda: string): ChipResumen => ({ clave, texto, tono: TONO_ESTADO[clave], ayuda });

/** El valor a partir del cual una variante está entre el `fraccionSuperior` más alto
 *  (0.2 = el 20 % de arriba). Siempre entra al menos una: en una sede de una sola
 *  variante, esa es la más rápida. Los empates en el corte entran todos. */
function umbralDeLosMasAltos(valores: number[], fraccionSuperior: number): number {
  if (valores.length === 0) return Infinity;
  const descendente = [...valores].sort((a, b) => b - a);
  const cuantas = Math.max(1, Math.ceil(valores.length * fraccionSuperior - 1e-9));
  return descendente[cuantas - 1];
}

export function velocidadDeFila(f: FilaResumen): Velocidad {
  return calcularVelocidad({ ventas: f.ventas, devoluciones: f.devoluciones, diasConStock: f.diasConStock, diasObservables: f.diasObservables, ledgerConsistente: f.ledgerConsistente });
}

export function velocidadPreviaDeFila(f: FilaResumen): Velocidad {
  // El período de comparación no trae «días desde que llegó»: sin ledger que
  // cuadre no hay base honesta y queda «sin historial».
  return calcularVelocidad({ ventas: f.ventasCmp, devoluciones: f.devolucionesCmp, diasConStock: f.diasConStockCmp, diasObservables: null, ledgerConsistente: f.ledgerConsistente });
}

function analizarVarianteConUmbral(
  f: FilaResumen,
  ubicacion: Ubicacion,
  curva: CurvaDeVariante | null,
  opciones: OpcionesAnalisis,
  umbralAltaDemanda: number,
): AnalisisVariante {
  const velocidad = velocidadDeFila(f);
  const velocidadPrevia = opciones.hayComparacion ? velocidadPreviaDeFila(f) : null;
  const tendencia = calcularTendencia(velocidad, velocidadPrevia);
  const cobertura = calcularCobertura(f.utilizable, velocidad);
  const banda = bandaDeCobertura(cobertura);
  const sellThrough = calcularSellThrough({ ventasNetas: velocidad.ventasNetas, stockInicial: f.stockInicial, entradas: f.entradas, ledgerConsistente: f.ledgerConsistente });
  const reserva = reservaDeSeguridad(velocidad);
  const esTienda = ubicacion.tipo === "tienda";
  const descontinuada = f.productoEstado !== "activo";
  const hayDemanda = velocidad.ventasNetas > 0;
  const agotada = f.utilizable <= 0;
  const bajoReserva = reserva !== null && !agotada && f.utilizable < reserva;
  const altaDemanda = esTienda && velocidad.estado === "ok" && velocidad.unidadesDia! >= umbralAltaDemanda;

  const evidencia = (velocidad.diasBase ?? 0) >= MIN_DIAS_CON_STOCK_AFIRMAR;
  const bajaRotacion =
    esTienda &&
    !descontinuada &&
    f.utilizable >= MIN_UNIDADES_SOBRESTOCK &&
    evidencia &&
    ((cobertura.tipo === "medida" && (cobertura.dias ?? 0) > UMBRAL_COBERTURA_ALTA_DIAS && (sellThrough === null || sellThrough < SELL_THROUGH_BAJO_PCT)) ||
      cobertura.tipo === "sin_ventas");
  const sobrestock = bajaRotacion || (esTienda && descontinuada && f.utilizable >= MIN_UNIDADES_SOBRESTOCK && evidencia && cobertura.tipo !== "medida");

  const estados: EstadoResumen[] = [];
  const marca = (e: EstadoResumen, aplica: boolean) => {
    if (aplica) estados.push(e);
  };
  marca("agotada_demanda", esTienda && agotada && hayDemanda);
  marca("cobertura_critica", esTienda && cobertura.tipo === "medida" && (cobertura.dias ?? Infinity) <= UMBRAL_COBERTURA_CRITICA_DIAS);
  marca("curva_rota", esTienda && curva !== null);
  marca("sin_piso", esTienda && f.separaPisoAlmacen && f.piso === 0 && f.almacen > 0 && !descontinuada);
  marca("cobertura_baja", esTienda && cobertura.tipo === "medida" && (cobertura.dias ?? Infinity) > UMBRAL_COBERTURA_CRITICA_DIAS && (cobertura.dias ?? Infinity) <= UMBRAL_COBERTURA_RIESGO_DIAS);
  marca("alta_demanda", altaDemanda);
  marca("posible_sobrestock", sobrestock);
  marca("en_baja", esTienda && tendencia?.direccion === "baja");
  marca("en_alza", esTienda && tendencia?.direccion === "alza");
  marca("descontinuada", descontinuada && f.utilizable > 0);
  marca("agotada", esTienda && agotada && !hayDemanda);
  const hayAlerta = estados.some((e) => RANGO_ESTADO[e] !== undefined && RANGO_ESTADO[e]! <= 5);
  marca(
    "venta_estable",
    esTienda && !hayAlerta && !descontinuada && velocidad.estado === "ok" && (banda === "saludable" || banda === "alta") && !estados.includes("en_baja"),
  );
  marca("sin_historial", esTienda && !agotada && (velocidad.estado === "poco_historial" || velocidad.estado === "sin_historial") && !hayAlerta && !descontinuada);

  const plan = sobrestock
    ? planSobrestock(f, descontinuada, cobertura, sellThrough)
    : planDeReposicion({ f, velocidad, cobertura, destino: ubicacion, ahora: opciones.ahora, motivo: curva && !hayDemanda ? "curva" : curva ? "curva" : "demanda" });

  const chips = ORDEN_CHIPS.filter((e) => estados.includes(e))
    .slice(0, 2)
    .map((e) => chipDe(e, textoChip(e, { sellThrough, velocidad, cobertura }), ayudaChip(e, velocidad, cobertura)));

  const rangoBase = RANGO_ESTADO[estados.find((e) => RANGO_ESTADO[e] !== undefined) ?? "sin_historial"] ?? 9;
  // Una talla que falta sin que nadie la haya pedido es menos urgente que un quiebre.
  const rango = estados[0] === "curva_rota" && !hayDemanda ? 4 : rangoBase;
  const impacto = (velocidad.unidadesDia ?? velocidad.ventasNetas) * (f.precio ?? 1);

  return { fila: f, velocidad, velocidadPrevia, tendencia, cobertura, banda, sellThrough, reserva, bajoReserva, altaDemanda, descontinuada, curva, estados, chips, plan, rango, impacto };
}

function planSobrestock(f: FilaResumen, descontinuada: boolean, cobertura: Cobertura, sellThrough: number | null): PlanReposicion {
  const detalle =
    cobertura.tipo === "sin_ventas"
      ? `Sin ventas con ${pluralizar(f.utilizable, "unidad", "unidades")} en la sede`
      : `Cobertura de ${formatoCoberturaConUnidad(cobertura.dias ?? 0)} con ${pluralizar(f.utilizable, "unidad", "unidades")}${sellThrough !== null ? ` y sell-through de ${sellThrough}%` : ""}`;
  const paso: PasoPlan = {
    tipo: "revisar_liquidacion",
    cantidad: null,
    texto: "Revisar liquidación",
    motivo: descontinuada ? `${detalle}. El producto está descontinuado: no se repone` : detalle,
    accionable: true,
  };
  return { pasos: [paso], principal: paso, urgencia: "baja", reserva: null, objetivo: null, faltante: null, explicacion: [paso.motivo, "No se sugiere reposición: ya hay más de lo que se vende"] };
}

function textoChip(e: EstadoResumen, x: { sellThrough: number | null; velocidad: Velocidad; cobertura: Cobertura }): string {
  switch (e) {
    case "posible_sobrestock":
      return x.cobertura.tipo === "sin_ventas" ? "Sin ventas" : "Baja rotación";
    default:
      return ETIQUETA_ESTADO[e];
  }
}

function ayudaChip(e: EstadoResumen, v: Velocidad, c: Cobertura): string {
  switch (e) {
    case "agotada_demanda":
      return "Sin stock utilizable y con ventas en el período";
    case "cobertura_critica":
      return `Cobertura de ${UMBRAL_COBERTURA_CRITICA_DIAS} días o menos al ritmo del período`;
    case "curva_rota":
      return "Falta una talla de la curva mientras quedan otras con stock";
    case "sin_piso":
      return "No hay nada en el piso y sí en el almacén: sin bajarlo no se puede vender";
    case "cobertura_baja":
      return `Cobertura de ${UMBRAL_COBERTURA_RIESGO_DIAS} días o menos: bajo el punto de reposición`;
    case "alta_demanda":
      return "Entre lo que más rápido se vende en esta sede";
    case "posible_sobrestock":
      return c.tipo === "sin_ventas"
        ? `Ninguna venta en ${Math.round(v.diasBase ?? 0)} días con stock`
        : `Cobertura mayor a ${UMBRAL_COBERTURA_ALTA_DIAS} días y baja rotación`;
    case "en_baja":
      return "Vende bastante menos que en el período de comparación";
    case "en_alza":
      return "Vende bastante más que en el período de comparación";
    case "descontinuada":
      return "El producto está descontinuado: no se repone";
    case "agotada":
      return "Sin stock utilizable y sin ventas en el período";
    case "venta_estable":
      return "Se vende con regularidad y la cobertura es sana";
    case "sin_historial":
      return "No hay suficientes días en venta para medir su ritmo";
  }
}

/**
 * Analiza TODAS las filas de la sede (las curvas necesitan a las hermanas, y la
 * «alta demanda» es relativa al resto) y las devuelve ya en orden de prioridad.
 * Los filtros y la búsqueda se aplican DESPUÉS, sobre este resultado.
 */
export function analizarSede(filas: FilaResumen[], ubicacion: Ubicacion, opciones: OpcionesAnalisis): AnalisisVariante[] {
  const velocidades = new Map<string, Velocidad>(filas.map((f) => [f.varianteId, velocidadDeFila(f)]));
  const ventasNetasPorVariante = new Map<string, number>([...velocidades].map(([id, v]) => [id, v.ventasNetas]));

  const curvaPorVariante = new Map<string, CurvaDeVariante>();
  if (ubicacion.tipo === "tienda") {
    for (const curva of detectarCurvasRotas(filas, ventasNetasPorVariante)) {
      for (const fa of curva.faltantes) curvaPorVariante.set(fa.varianteId, { curva, motivo: fa.motivo });
    }
  }

  const ritmos = [...velocidades.values()].filter((v) => v.estado === "ok").map((v) => v.unidadesDia!);
  const umbralAltaDemanda = Math.max(ALTA_DEMANDA_MIN_UDS_DIA, umbralDeLosMasAltos(ritmos, 1 - ALTA_DEMANDA_PERCENTIL));

  return filas
    .map((f) => analizarVarianteConUmbral(f, ubicacion, curvaPorVariante.get(f.varianteId) ?? null, opciones, umbralAltaDemanda))
    .sort(compararPrioridad);
}

export function compararPrioridad(a: AnalisisVariante, b: AnalisisVariante): number {
  return (
    a.rango - b.rango ||
    (a.cobertura.dias ?? Infinity) - (b.cobertura.dias ?? Infinity) ||
    b.impacto - a.impacto ||
    a.fila.referencia.localeCompare(b.fila.referencia, "es") ||
    (a.fila.color ?? "").localeCompare(b.fila.color ?? "", "es") ||
    compararTallas(a.fila.talla ?? "", b.fila.talla ?? "")
  );
}

// ---------------------------------------------------------------------------
// Resumen agregado: tarjetas, distribución, top de velocidad, curvas, capital
// ---------------------------------------------------------------------------

export type BarraVelocidad = { id: string; productoId: string; etiqueta: string; detalle: string | null; unidadesDia: number; ventasNetas: number };

export type CurvaRotaConPlan = CurvaRota & {
  /** Solo los faltantes que están en el alcance actual, cada uno con su plan. */
  acciones: { varianteId: string; talla: string; motivo: "hueco" | "demanda"; plan: PlanReposicion }[];
  /** «Taller: 8 · Trujillo: 3» — dónde hay la talla que falta. */
  dondeHay: string;
};

export type CapitalPorCategoria = { categoria: string; valor: number; unidades: number; conCoberturaAlta: number };

export type CapitalInfo =
  | {
      verificado: true;
      total: number;
      conCoberturaAlta: number;
      unidades: number;
      porCategoria: CapitalPorCategoria[];
      /** Dañado/cuarentena: no entra al total (su valor depende de si se liquida). */
      cuarentena: { unidades: number; valor: number };
      /** Cuántas unidades tienen costo calculado por promedio ponderado (compras/producción) vs. costo de alta. */
      unidadesConCostoOficial: number;
    }
  | {
      verificado: false;
      motivo: string;
      sinCosto: number;
      alterado: number;
      variantes: { varianteId: string; productoId: string; referencia: string; sku: string; estado: "sin_costo" | "alterado" }[];
    };

export type ResumenAlcance = {
  totalVariantes: number;
  agotadasConDemanda: number;
  coberturaCritica: number;
  curvasRotas: { curvas: number; tallas: number };
  sobrestock: { total: number; conEvidencia: number };
  capital: CapitalInfo;
  unidades: { utilizables: number; conCoberturaAlta: number };
  distribucion: { banda: BandaCobertura; variantes: number }[];
  topProductos: BarraVelocidad[];
  topVariantes: BarraVelocidad[];
  curvas: CurvaRotaConPlan[];
  ventas: { periodo: number; previo: number | null };
  categorias: { id: string; nombre: string; variantes: number }[];
};

const TOP_VELOCIDAD = 5;

/** Un texto de «dónde hay» a partir de lo que tienen las otras sedes. */
export function textoDondeHay(enRed: UbicacionRed[], max = 2): string {
  const conStock = enRed.filter((o) => o.utilizable > 0 || (o.tipo !== "tienda" && o.disponible > 0));
  const ordenadas = [...conStock].sort((a, b) => Number(a.tipo === "tienda") - Number(b.tipo === "tienda") || b.utilizable - a.utilizable);
  const partes = ordenadas.slice(0, max).map((o) => `${nombreCorto(o.nombre)}: ${o.tipo === "tienda" ? o.utilizable : o.disponible}`);
  if (ordenadas.length > max) partes.push(`+${ordenadas.length - max}`);
  return partes.join(" · ");
}

function calcularCapital(analisis: AnalisisVariante[]): CapitalInfo {
  const conStock = analisis.filter((a) => a.fila.disponible + a.fila.cuarentena > 0);
  const problemas = conStock.filter((a) => a.fila.estadoCosto === "sin_costo" || a.fila.estadoCosto === "alterado" || a.fila.estadoCosto === null || a.fila.costo === null);
  if (problemas.length > 0) {
    const sinCosto = problemas.filter((a) => a.fila.estadoCosto !== "alterado").length;
    const alterado = problemas.length - sinCosto;
    return {
      verificado: false,
      motivo: alterado > 0 ? "Hay costos modificados por fuera del cálculo de promedio ponderado" : "Hay prendas con stock sin costo cargado",
      sinCosto,
      alterado,
      variantes: problemas.map((a) => ({ varianteId: a.fila.varianteId, productoId: a.fila.productoId, referencia: a.fila.referencia, sku: a.fila.sku, estado: a.fila.estadoCosto === "alterado" ? "alterado" : "sin_costo" })),
    };
  }

  const porCategoria = new Map<string, CapitalPorCategoria>();
  let total = 0;
  let conCoberturaAlta = 0;
  let unidades = 0;
  let unidadesConCostoOficial = 0;
  let cuarentenaUds = 0;
  let cuarentenaValor = 0;
  for (const a of conStock) {
    const costo = a.fila.costo ?? 0;
    const valor = a.fila.disponible * costo;
    const alta = a.cobertura.tipo === "sin_ventas" || (a.cobertura.tipo === "medida" && (a.cobertura.dias ?? 0) > UMBRAL_COBERTURA_ALTA_DIAS);
    total += valor;
    unidades += a.fila.disponible;
    if (alta) conCoberturaAlta += valor;
    if (a.fila.estadoCosto === "oficial") unidadesConCostoOficial += a.fila.disponible;
    cuarentenaUds += a.fila.cuarentena;
    cuarentenaValor += a.fila.cuarentena * costo;
    const nombre = a.fila.categoria ?? "Sin categoría";
    const cat = porCategoria.get(nombre) ?? { categoria: nombre, valor: 0, unidades: 0, conCoberturaAlta: 0 };
    cat.valor += valor;
    cat.unidades += a.fila.disponible;
    if (alta) cat.conCoberturaAlta += valor;
    porCategoria.set(nombre, cat);
  }
  return {
    verificado: true,
    total,
    conCoberturaAlta,
    unidades,
    porCategoria: [...porCategoria.values()].filter((c) => c.unidades > 0).sort((a, b) => b.valor - a.valor),
    cuarentena: { unidades: cuarentenaUds, valor: cuarentenaValor },
    unidadesConCostoOficial,
  };
}

/** Las categorías de un conjunto de variantes, con cuántas tiene cada una. Se
 *  pide sobre la SEDE entera (no sobre lo filtrado) para que el selector no se
 *  encoja al elegir una. */
export function listarCategorias(analisis: AnalisisVariante[]): { id: string; nombre: string; variantes: number }[] {
  const categorias = new Map<string, { id: string; nombre: string; variantes: number }>();
  for (const a of analisis) {
    if (!a.fila.categoriaId) continue;
    const c = categorias.get(a.fila.categoriaId) ?? { id: a.fila.categoriaId, nombre: a.fila.categoria ?? "Sin categoría", variantes: 0 };
    c.variantes += 1;
    categorias.set(a.fila.categoriaId, c);
  }
  return [...categorias.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
}

/** Las tarjetas, los gráficos y el capital de un conjunto de variantes YA analizadas
 *  (la sede entera, o lo que quedó tras categoría y búsqueda). */
export function resumirAlcance(analisis: AnalisisVariante[]): ResumenAlcance {
  const cuenta = (e: EstadoResumen) => analisis.filter((a) => a.estados.includes(e)).length;

  const curvasPorClave = new Map<string, CurvaRotaConPlan>();
  for (const a of analisis) {
    if (!a.curva) continue;
    const { curva, motivo } = a.curva;
    const existente = curvasPorClave.get(curva.clave) ?? { ...curva, acciones: [], dondeHay: "" };
    existente.acciones.push({ varianteId: a.fila.varianteId, talla: a.fila.talla ?? "", motivo, plan: a.plan });
    curvasPorClave.set(curva.clave, existente);
  }
  const curvas = [...curvasPorClave.values()].map((c) => {
    const filas = analisis.filter((a) => c.acciones.some((x) => x.varianteId === a.fila.varianteId));
    const dondeHay =
      c.acciones.length === 1
        ? textoDondeHay(filas[0]?.fila.enRed ?? [])
        : filas
            .slice(0, 2)
            .map((a) => `${a.fila.talla}: ${textoDondeHay(a.fila.enRed, 1) || "—"}`)
            .join(" · ");
    return { ...c, acciones: c.acciones.sort((x, y) => compararTallas(x.talla, y.talla)), dondeHay };
  });

  const conVelocidad = analisis.filter((a) => a.velocidad.estado === "ok");
  const porProducto = new Map<string, BarraVelocidad>();
  for (const a of conVelocidad) {
    const previo = porProducto.get(a.fila.productoId);
    porProducto.set(a.fila.productoId, {
      id: a.fila.productoId,
      productoId: a.fila.productoId,
      etiqueta: a.fila.referencia,
      detalle: null,
      unidadesDia: (previo?.unidadesDia ?? 0) + a.velocidad.unidadesDia!,
      ventasNetas: (previo?.ventasNetas ?? 0) + a.velocidad.ventasNetas,
    });
  }
  const orden = (x: BarraVelocidad, y: BarraVelocidad) => y.unidadesDia - x.unidadesDia || y.ventasNetas - x.ventasNetas || x.etiqueta.localeCompare(y.etiqueta, "es");

  const distribucion = BANDAS_COBERTURA.map((banda) => ({ banda, variantes: analisis.filter((a) => a.banda === banda).length }));

  const sobrestock = analisis.filter((a) => a.estados.includes("posible_sobrestock")).length;
  const conEvidencia = analisis.filter((a) => a.fila.utilizable >= MIN_UNIDADES_SOBRESTOCK && (a.velocidad.diasBase ?? 0) >= MIN_DIAS_CON_STOCK_AFIRMAR).length;

  return {
    totalVariantes: analisis.length,
    agotadasConDemanda: cuenta("agotada_demanda"),
    coberturaCritica: cuenta("cobertura_critica"),
    curvasRotas: { curvas: curvas.length, tallas: curvas.reduce((n, c) => n + c.acciones.length, 0) },
    sobrestock: { total: sobrestock, conEvidencia },
    capital: calcularCapital(analisis),
    unidades: {
      utilizables: analisis.reduce((n, a) => n + a.fila.utilizable, 0),
      conCoberturaAlta: analisis
        .filter((a) => a.cobertura.tipo === "sin_ventas" || (a.cobertura.tipo === "medida" && (a.cobertura.dias ?? 0) > UMBRAL_COBERTURA_ALTA_DIAS))
        .reduce((n, a) => n + a.fila.utilizable, 0),
    },
    distribucion,
    topProductos: [...porProducto.values()].sort(orden).slice(0, TOP_VELOCIDAD),
    topVariantes: conVelocidad
      .map((a) => ({
        id: a.fila.varianteId,
        productoId: a.fila.productoId,
        etiqueta: a.fila.referencia,
        detalle: [a.fila.color, a.fila.talla].filter(Boolean).join(" · ") || null,
        unidadesDia: a.velocidad.unidadesDia!,
        ventasNetas: a.velocidad.ventasNetas,
      }))
      .sort(orden)
      .slice(0, TOP_VELOCIDAD),
    curvas: curvas.sort((x, y) => y.acciones.length - x.acciones.length || x.referencia.localeCompare(y.referencia, "es")),
    ventas: {
      periodo: analisis.reduce((n, a) => n + a.velocidad.ventasNetas, 0),
      previo: analisis.some((a) => a.velocidadPrevia !== null) ? analisis.reduce((n, a) => n + (a.velocidadPrevia?.ventasNetas ?? 0), 0) : null,
    },
    categorias: listarCategorias(analisis),
  };
}

// ---------------------------------------------------------------------------
// Exactitud del inventario — cuánto confiar en lo anterior.
// ---------------------------------------------------------------------------

export type EstadoExactitud = {
  estado: "pendiente" | "vigente" | "antiguo" | "baja";
  ultimoConteo: string | null;
  diasDesde: number | null;
  porcentaje: number | null;
  lineas: number;
  conteos: number;
};

export function evaluarExactitud(
  datos: { exactitud: { porcentaje: number; lineas: number; conteos: number } | null; ultimoCerradoEn: string | null },
  ahora: Date,
): EstadoExactitud {
  const { exactitud, ultimoCerradoEn } = datos;
  if (!exactitud || !ultimoCerradoEn) return { estado: "pendiente", ultimoConteo: null, diasDesde: null, porcentaje: null, lineas: 0, conteos: 0 };
  const diasDesde = Math.floor((ahora.getTime() - new Date(ultimoCerradoEn).getTime()) / MS_DIA);
  const base = { ultimoConteo: ultimoCerradoEn, diasDesde, porcentaje: exactitud.porcentaje, lineas: exactitud.lineas, conteos: exactitud.conteos };
  if (diasDesde > DIAS_CONTEO_VIGENTE) return { estado: "antiguo", ...base };
  if (exactitud.porcentaje < EXACTITUD_ACEPTABLE_PCT) return { estado: "baja", ...base };
  return { estado: "vigente", ...base };
}
