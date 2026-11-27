// Resumen de Producción: «¿qué necesita mi decisión hoy?» (ADR-0133, F6). Puro: sin Supabase ni React.
//
// Desde el 2026-11-26 («Producción más clara») cada asunto de «Por resolver» es una tarjeta con un título corto que se entiende solo, una línea que dice de qué o de quién
// habla (`de`) y sus datos en piezas (`pares`: rótulo arriba, valor abajo), nunca una frase larga con los datos pegados. La cuenta de la que sale sigue bajo «¿Por qué?».
//
// Cada tarjeta nace de datos que YA existen y lleva su evidencia; ninguna es un texto fijo, y desaparece sola cuando el dato cambia (se recibe la tela,
// se paga, se cierra la orden). Solo HECHOS y cuentas sobre datos medidos: no hay plazos por etapa, ni «días de trabajo que faltan», ni tiempo de una corrida
// inventados (contrato del plan). Donde no hay base honesta —sin ritmo de venta, sin rendimiento medido— la tarjeta no se dibuja, en vez de adivinar.

import { DIAS_RITMO_RECIENTE, UMBRAL_COBERTURA_ALTA_DIAS, UMBRAL_COBERTURA_RIESGO_DIAS, UMBRAL_COBERTURA_SALUDABLE_DIAS, UMBRAL_POCA_BASE_VENTAS } from "./inventario-reglas";
import { diasHasta, type ComprobanteProduccion } from "./comprobantes-produccion-reglas";
import { cantidadTexto, type UnidadInsumo } from "./insumos-reglas";
import { estadoEntrega, etapaActual, etapasDe, urlLlevarATiendas, type EtapaClave, type EstadoEtapa } from "./produccion-reglas";
import { DIAS_OBJETIVO_PRODUCCION, repartirFalta, type DemandaVariante, type Rendimiento } from "./produccion-decision-reglas";
import { compararTallas } from "./tallas";
import { tramosPorPagar } from "./por-pagar-produccion-reglas";
import { textoDePedido, type PedidoDeInsumo } from "./orden-pagina-reglas";
import type { TelaDelTallerLeida } from "./tela-del-taller-reglas";

const soles = (n: number) => `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------
// Entradas (tipos mínimos: quien llama pasa lo que ya tiene)
// ---------------------------------------------------------------------------

export type OrdenParaDecidir = {
  id: string;
  /** «OP-000031», si quien llama lo conoce (la lista de Órdenes): va en la línea «de» de su asunto. Sin él, el asunto nombra solo el modelo. */
  numeroTexto?: string;
  referencia: string;
  productoId: string;
  estado: string;
  esMuestra: boolean;
  fechaEntrega: string | null;
  cantidadPlan: number;
  etapas: Partial<Record<EtapaClave, EstadoEtapa>>;
};

export type InsumoParaDecidir = { id: string; nombre: string; unidad: UnidadInsumo; tipo: "tela" | "avio"; saldo: number; minimo: number | null; tono: "sin_saldo" | "bajo" | "bien" | "sin_minimo" };

/** Una línea facturada que todavía no llegó (F4d). */
export type LlegadaPendiente = { insumoId: string; documento: string; proveedor: string; pendiente: number };

/** Cantidad neta consumida por orden e insumo (consumo − devolución). */
export type ConsumoNetoPorOrden = Record<string, Record<string, number>>;

/** Cómo se llama una variante (talla y color), para decirlo en pantalla; el dato de stock y ventas viene de `DemandaVariante`. */
export type RotuloDeVariante = { varianteId: string; talla: string | null; color: string | null; colorHex: string | null };

/** `variantesIds` manda (qué variantes tiene el modelo); `variantes`, si viene, solo les pone nombre: sin él la fila guarda las cifras de cada variante y la talla y el color en `null`. */
export type ModeloParaDecidir = { productoId: string; referencia: string; variantesIds: string[]; variantes?: RotuloDeVariante[] };

/** Un dato de un asunto: el rótulo chico arriba y el valor abajo (`<ParDato>`). El tono solo cuando el dato dice algo: ámbar pide atención, rojo es plata vencida. */
export type ParDeDato = { rotulo: string; valor: string; tono?: "ambar" | "rojo" | "verde" };

export type Decision = {
  id: string;
  /** 3 = pide acción ya; 2 = conviene mirarlo pronto; 1 = informativo. */
  severidad: 1 | 2 | 3;
  tipo: "entrega" | "insumo" | "recibir" | "pago" | "producir" | "trasladar" | "sobrestock" | "minimo";
  /** Qué pasa, corto y sin datos adentro: «Una orden está atrasada», «Falta tela para cortar». */
  titulo: string;
  /** De qué o de quién habla: el modelo (y su orden), la tela, los proveedores. */
  de: string;
  /** Los datos del asunto, cada uno una pieza. */
  pares: ParDeDato[];
  /** `ver`: el botón solo lleva a mirar otra pantalla (la flecha de «Ver»). `modelo`: abre la hoja «Ver el modelo» de ese modelo en vez de navegar (`href` queda de respaldo). */
  accion: { texto: string; href: string; ver?: boolean; modelo?: string };
  /** Los modelos de que habla la tarjeta (el que es, o los 3 más urgentes si junta varios), para dibujar su foto. Vacío o ausente en las que no son de un modelo. */
  productoIds?: string[];
  /** Cuántos asuntos junta la tarjeta (los modelos por producir, en la que los reúne). Ausente = 1. Si no cabe en pantalla, «y N más» cuenta estos, no la tarjeta. */
  asuntos?: number;
  /** La cuenta de la que sale el asunto (cuánto piden las órdenes, cuánto hay, qué viene en camino, en cuántas ventas se apoya): se ve bajo un «¿Por qué?» a un toque, no siempre abierta. */
  porque?: string;
};

// ---------------------------------------------------------------------------
// Demanda de insumos de las órdenes abiertas
// ---------------------------------------------------------------------------

export type DemandaInsumo = { insumoId: string; necesita: number; ordenes: string[] };

/**
 * Lo que las órdenes de producción abiertas todavía necesitan descontar, por insumo: rendimiento MEDIDO del modelo × prendas planeadas, menos lo que la orden
 * ya descontó. Un modelo sin rendimiento medido no aporta demanda (no se inventa).
 */
export function demandaDeInsumos(ordenes: OrdenParaDecidir[], rendimientoPorModelo: Record<string, Rendimiento[]>, consumoNeto: ConsumoNetoPorOrden): Map<string, DemandaInsumo> {
  const mapa = new Map<string, DemandaInsumo>();
  for (const o of ordenes) {
    if (o.estado !== "en_proceso" || o.esMuestra) continue;
    for (const r of rendimientoPorModelo[o.productoId] ?? []) {
      const pendiente = Math.max(0, r.porPrenda * o.cantidadPlan - (consumoNeto[o.id]?.[r.insumoId] ?? 0));
      if (pendiente <= 1e-9) continue;
      const d = mapa.get(r.insumoId) ?? { insumoId: r.insumoId, necesita: 0, ordenes: [] };
      d.necesita += pendiente;
      d.ordenes.push(o.referencia);
      mapa.set(r.insumoId, d);
    }
  }
  return mapa;
}

/**
 * Lo que las órdenes abiertas todavía necesitan, por insumo, con UNA sola cuenta (ADR-0400, actividad 8d): la tela que cada orden DECLARÓ —su plan menos lo ya descontado: la misma cuenta de «Nueva orden» y de la página de la
 * orden— y, solo para las órdenes que no declaran ninguna (las de antes de las fases), el rendimiento medido de su modelo (`demandaDeInsumos`). Si la base no pudo contestar (`declarada` null), todas se cuentan con el
 * medido, como antes: la pantalla se degrada, no se rompe.
 */
export function demandaDelTaller(
  declarada: Pick<TelaDelTallerLeida, "telas" | "sinDeclarar"> | null,
  ordenes: OrdenParaDecidir[],
  rendimientoPorModelo: Record<string, Rendimiento[]>,
  consumoNeto: ConsumoNetoPorOrden,
): Map<string, DemandaInsumo> {
  if (!declarada) return demandaDeInsumos(ordenes, rendimientoPorModelo, consumoNeto);
  const mapa = new Map<string, DemandaInsumo>();
  for (const t of declarada.telas) if (t.comprometido > 1e-9) mapa.set(t.insumoId, { insumoId: t.insumoId, necesita: t.comprometido, ordenes: [...new Set(t.ordenes)] });
  const sinDeclarar = new Set(declarada.sinDeclarar.map((o) => o.id));
  for (const d of demandaDeInsumos(ordenes.filter((o) => sinDeclarar.has(o.id)), rendimientoPorModelo, consumoNeto).values()) {
    const previa = mapa.get(d.insumoId);
    if (previa) {
      previa.necesita += d.necesita;
      previa.ordenes = [...new Set([...previa.ordenes, ...d.ordenes])];
    } else mapa.set(d.insumoId, { ...d, ordenes: [...new Set(d.ordenes)] });
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// ¿Qué producir? Una fila por modelo
// ---------------------------------------------------------------------------

export type EstadoModelo = "producir_ya" | "trasladar" | "en_produccion" | "vigilar" | "alcanza" | "sobrestock" | "sin_ritmo";

/** Una talla y color de un modelo, con lo que hay, lo que viene y lo que falta. `trasladar` + `producir` son lo que falta para cubrir `DIAS_OBJETIVO_PRODUCCION` días de venta (`repartirFalta`). */
export type VarianteDeFila = RotuloDeVariante & {
  stockRed: number;
  stockTaller: number;
  enCamino: number;
  enProduccion: number;
  ritmoDia: number | null;
  /** Ventas netas de la red en la ventana (cuenten o no para el ritmo): con ellas se ve que «se vendió y ya no hay». */
  ventasNetas: number;
  ventasBase: number;
  /** Prendas terminadas del Taller que bastan para llevarlas al piso y cubrir lo que falta. */
  trasladar: number;
  /** Prendas que de verdad hay que fabricar, después de contar tiendas, camino, órdenes abiertas y Taller. */
  producir: number;
};

export type FilaModelo = {
  productoId: string;
  referencia: string;
  stockRed: number;
  stockTaller: number;
  enCamino: number;
  enProduccion: number;
  /** Lo de `enProduccion` que de verdad se descontó al calcular lo que falta: solo cuenta en las variantes con ritmo medido (en una que no se vende, `repartirFalta` no calcula nada). */
  enProduccionContada: number;
  /** Unidades por día de toda la red; `null` sin ritmo medido. */
  ritmoDia: number | null;
  /** Las ventas netas en que se apoya ese ritmo (las de las sedes con las que se midió): lo que «se vende X por semana» tiene detrás. */
  ventasBase: number;
  /** Días que dura el stock de la red al ritmo medido; `null` sin ritmo. */
  diasRed: number | null;
  /** Cada talla y color del modelo, con sus cifras: lo que `estado`, `trasladar` y `producir` suman. */
  variantes: VarianteDeFila[];
  /** Suma de lo que se resuelve llevando al piso prendas que ya están en el Taller (por variante: lo de una talla no cubre a otra). */
  trasladar: number;
  /** Suma de lo que falta fabricar. Es la misma cifra que sugiere «Nueva orden». */
  producir: number;
  estado: EstadoModelo;
};

export const ETIQUETA_ESTADO_MODELO: Record<EstadoModelo, string> = {
  producir_ya: "Producir ya",
  trasladar: "Llevar a tienda",
  en_produccion: "Ya hay orden abierta",
  vigilar: "Vigilar",
  alcanza: "Alcanza",
  sobrestock: "Hay de sobra",
  sin_ritmo: "Sin ventas todavía",
};

/** Cuánto dura el stock, dicho como se lee: «agotado» con 0 en tiendas (nunca «0 días» ni «se agota en 1 día»), «1 día» en singular y «N días»
 *  redondeado hacia lo cercano, con un mínimo de 1 mientras quede algo. */
export function textoDiasDeStock(stockRed: number, diasRed: number): string {
  if (stockRed <= 0) return "agotado";
  const n = Math.max(1, Math.round(diasRed));
  return n === 1 ? "1 día" : `${n} días`;
}

/** En cuántas ventas se apoya el «se vende X por semana», dicho para quien lee. Con `UMBRAL_POCA_BASE_VENTAS` ventas o menos dice «poca base»: la
 *  cifra existe, pero con tan pocas ventas es casi ruido. `largo` va en el texto de una tarjeta; `corto` entre paréntesis, en una lista. */
export function baseDelRitmo(ventas: number): { pocaBase: boolean; largo: string; corto: string } {
  const n = ventas === 1 ? "1 venta" : `${ventas} ventas`;
  const pocaBase = ventas <= UMBRAL_POCA_BASE_VENTAS;
  return {
    pocaBase,
    largo: pocaBase ? `solo ${n} en ${DIAS_RITMO_RECIENTE} días: poca base` : `${n} en ${DIAS_RITMO_RECIENTE} días`,
    corto: pocaBase ? `solo ${n}: poca base` : n,
  };
}

/**
 * Suma la red por modelo y lo clasifica. «Producir ya» ya no depende de si existe una orden, sino de si lo que se fabrica ALCANZA: se compara lo que falta para cubrir
 * `diasObjetivo` días de venta contra lo que hay en tiendas, lo que viene en camino y lo que ya está en órdenes abiertas, talla por talla y color por color (lo que sobra
 * de una no cubre a otra). Lo que falta se reparte en lo que ya está hecho en el Taller (se traslada) y lo que hay que fabricar. Sin ritmo medido no se opina.
 *
 *   - diasRed ≤ 7 y queda algo por fabricar        → «Producir ya» (aunque haya una orden: una de 1 prenda no apaga una falta de 30)
 *   - diasRed ≤ 30 y lo que falta está en el Taller → «Llevar a tienda»
 *   - diasRed ≤ 30 y las órdenes abiertas cubren todo → «Ya hay orden abierta» (solo si CUBREN: una que no alcanza no se anuncia como si resolviera)
 *   - diasRed ≤ 30 en cualquier otro caso           → «Vigilar» (falta algo pero no urge, o lo cubre lo que viene en camino)
 *   - más de 30 días                               → «Alcanza» (hasta 60) o «Hay de sobra»
 */
export function filasPorModelo(demanda: DemandaVariante[], modelos: ModeloParaDecidir[], enProduccionPorVariante: Record<string, number>, diasObjetivo: number = DIAS_OBJETIVO_PRODUCCION): FilaModelo[] {
  const porVariante = new Map(demanda.map((d) => [d.varianteId, d]));
  const filas: FilaModelo[] = modelos.map((m) => {
    const rotulos = new Map((m.variantes ?? []).map((v) => [v.varianteId, v]));
    let stockRed = 0, stockTaller = 0, enCamino = 0, enProduccion = 0, enProduccionContada = 0, ritmo = 0, hayRitmo = false, ventasBase = 0, trasladar = 0, producir = 0;
    const variantes: VarianteDeFila[] = [];
    for (const id of m.variantesIds) {
      const enProd = enProduccionPorVariante[id] ?? 0;
      enProduccion += enProd;
      const d = porVariante.get(id);
      const falta = repartirFalta(d, enProd, diasObjetivo);
      if (d?.ritmoDia) enProduccionContada += enProd;
      trasladar += falta.trasladar;
      producir += falta.producir;
      const r = rotulos.get(id);
      variantes.push({
        varianteId: id,
        talla: r?.talla ?? null,
        color: r?.color ?? null,
        colorHex: r?.colorHex ?? null,
        stockRed: d?.stockRed ?? 0,
        stockTaller: d?.stockTaller ?? 0,
        enCamino: d?.enCamino ?? 0,
        enProduccion: enProd,
        ritmoDia: d?.ritmoDia ?? null,
        ventasNetas: d?.ventasNetas ?? 0,
        ventasBase: d?.ventasBase ?? 0,
        trasladar: falta.trasladar,
        producir: falta.producir,
      });
      if (!d) continue;
      stockRed += d.stockRed;
      stockTaller += d.stockTaller;
      enCamino += d.enCamino;
      if (d.ritmoDia) {
        ritmo += d.ritmoDia;
        hayRitmo = true;
      }
      ventasBase += d.ventasBase;
    }
    const ritmoDia = hayRitmo ? ritmo : null;
    const diasRed = ritmoDia ? stockRed / ritmoDia : null;
    let estado: EstadoModelo;
    if (diasRed === null) estado = "sin_ritmo";
    else if (diasRed <= UMBRAL_COBERTURA_SALUDABLE_DIAS) {
      if (producir > 0 && diasRed <= UMBRAL_COBERTURA_RIESGO_DIAS) estado = "producir_ya";
      else if (producir === 0 && trasladar > 0) estado = "trasladar";
      else if (producir === 0 && enProduccion > 0) estado = "en_produccion";
      else estado = "vigilar";
    } else if (diasRed <= UMBRAL_COBERTURA_ALTA_DIAS) estado = "alcanza";
    else estado = "sobrestock";
    return { productoId: m.productoId, referencia: m.referencia, stockRed, stockTaller, enCamino, enProduccion, enProduccionContada, ritmoDia, ventasBase, diasRed, variantes, trasladar, producir, estado };
  });
  const orden: Record<EstadoModelo, number> = { producir_ya: 0, trasladar: 1, en_produccion: 2, vigilar: 3, alcanza: 4, sobrestock: 5, sin_ritmo: 6 };
  // Con el stock en 0 todos empatan en 0 días: entre iguales va primero el que más se vende (lo que se pierde por día) y, si también empatan, el
  // nombre. Antes decidía el alfabeto cuál de los agotados llegaba a tener tarjeta.
  return filas.sort(
    (a, b) =>
      orden[a.estado] - orden[b.estado] ||
      (a.diasRed ?? Infinity) - (b.diasRed ?? Infinity) ||
      (b.ritmoDia ?? 0) - (a.ritmoDia ?? 0) ||
      a.referencia.localeCompare(b.referencia, "es")
  );
}

/** Cuántas tallas y colores nombra el aviso de «se vendían y ya no hay» antes de decir «y N más». */
const NOMBRADAS_AGOTADAS = 3;

/** «S Negro»: una talla y color como se lee en una frase (sin punto medio: en una lista ya las separa la coma). Sin ninguno de los dos, «una variante» (no se inventa un nombre). */
export function nombreDeVariante(v: Pick<RotuloDeVariante, "talla" | "color">): string {
  return [v.talla, v.color].filter(Boolean).join(" ") || "una variante";
}

/** «Se vendió y ya no hay en tiendas»: más ventas que el umbral de poca base (con menos es ruido, ADR-0346) y nada en tiendas. La única definición: la fila, el aviso y la hoja «Ver el modelo». */
export const seVendioYYaNoHay = (ventas: number, stockRed: number): boolean => stockRed <= 0 && ventas > UMBRAL_POCA_BASE_VENTAS;

/**
 * Las tallas y colores de un modelo que SÍ tiene stock en alguna otra, y que ya se agotaron en las tiendas pero se vendían (más de `UMBRAL_POCA_BASE_VENTAS` ventas
 * en la ventana: con menos es ruido, ADR-0346). Es solo un AVISO: el consejo del modelo («Alcanza», «Hay de sobra»…) no cambia por esto. Si TODO el modelo está
 * agotado no hay aviso: su estado y su cobertura ya lo dicen. Va primero la que más se vendía.
 */
export function agotadasQueSeVendian(f: Pick<FilaModelo, "stockRed" | "variantes">): VarianteDeFila[] {
  if (f.stockRed <= 0) return [];
  return f.variantes.filter((v) => seVendioYYaNoHay(v.ventasNetas, v.stockRed)).sort((a, b) => b.ventasNetas - a.ventasNetas);
}

/** «Se vendían y ya no hay en tiendas: S Negro, M Negro y 2 más». Vacío si no hay ninguna. */
export function textoAgotadas(vs: VarianteDeFila[]): string {
  if (vs.length === 0) return "";
  const nombradas = vs.slice(0, NOMBRADAS_AGOTADAS).map(nombreDeVariante).join(", ");
  const resto = vs.length - NOMBRADAS_AGOTADAS;
  return `Se vendían y ya no hay en tiendas: ${nombradas}${resto > 0 ? ` y ${resto} más` : ""}`;
}

/** La talla de una variante que no la tiene, dicha en una frase (no se inventa una). */
const SIN_TALLA_EN_FRASE = "sin talla";

/**
 * ¿El consejo del modelo habla de fabricar (o de llevar del Taller)? «Alcanza», «Hay de sobra» y «Sin ventas todavía» NO: el Resumen dice «no fabriques más» o no opina, y una frase como «faltan 15, hay
 * que fabricarlas» o un botón «Preparar orden» con cantidad en la misma hoja diría lo contrario. Una talla agotada dentro de un modelo así solo AVISA (decisión de Felipe, 2026-10-13: «solo avisar»).
 */
export const estadoPideFabricar = (estado: EstadoModelo): boolean => estado === "producir_ya" || estado === "trasladar" || estado === "en_produccion" || estado === "vigilar";

/**
 * Cuánto conviene fabricar de un modelo, y de cada talla, si hay base para decirlo. Con `UMBRAL_POCA_BASE_VENTAS` ventas o menos una cantidad por talla es ruido (ADR-0346, y el Resumen ya
 * lo dice con «poca base»): no se muestra ni se precarga. Sin nada que fabricar tampoco, ni si el consejo del modelo no es fabricar (`estadoPideFabricar`). La cifra es la de `repartirFalta`:
 * la misma que escribe «Usar la sugerencia» en «Nueva orden».
 */
export function sugerenciaDeOrden(m: Pick<FilaModelo, "estado" | "ventasBase" | "producir" | "variantes">): { total: number; porTalla: { talla: string; cantidad: number }[] } | null {
  if (!estadoPideFabricar(m.estado) || baseDelRitmo(m.ventasBase).pocaBase || m.producir <= 0) return null;
  const porTalla = new Map<string, number>();
  for (const v of m.variantes) if (v.producir > 0) porTalla.set(v.talla ?? SIN_TALLA_EN_FRASE, (porTalla.get(v.talla ?? SIN_TALLA_EN_FRASE) ?? 0) + v.producir);
  const orden = [...porTalla].sort(([a], [b]) => (a === SIN_TALLA_EN_FRASE ? 1 : b === SIN_TALLA_EN_FRASE ? -1 : compararTallas(a, b)));
  return { total: m.producir, porTalla: orden.map(([talla, cantidad]) => ({ talla, cantidad })) };
}

/** «Sugerido: 52 prendas (S 8, M 16, L 16, XL 12)». Con una sola talla el desglose repetiría la cifra («36 prendas (M 36)»): se omite. */
export function textoSugerencia(s: NonNullable<ReturnType<typeof sugerenciaDeOrden>>): string {
  const cuantas = s.total === 1 ? "1 prenda" : `${s.total} prendas`;
  return s.porTalla.length < 2 ? `Sugerido: ${cuantas}` : `Sugerido: ${cuantas} (${s.porTalla.map((t) => `${t.talla} ${t.cantidad}`).join(", ")})`;
}

/** A «Nueva orden» con el modelo elegido; con `sugerida`, además trae escritas las cantidades sugeridas. El `?nueva=` es el contrato de siempre (también lo usan Análisis y Nuevo producto): `sugerida` es opcional y quien no lo manda no cambia. */
export function hrefNuevaOrden(productoId: string, sugerida: boolean): string {
  return `/produccion/ordenes?nueva=${productoId}${sugerida ? "&sugerida=1" : ""}`;
}

/** A dónde lleva «Llevar a tienda»: Mover mercadería con el Taller de origen y las prendas (lo que cubre la falta de cada talla y color) ya puestas. `null` sin Taller o sin nada que llevar. */
export function urlTrasladarModelo(m: Pick<FilaModelo, "variantes">, tallerId: string | null | undefined): string | null {
  if (!tallerId) return null;
  return urlLlevarATiendas(tallerId, m.variantes.filter((v) => v.trasladar > 0).map((v) => ({ varianteId: v.varianteId, cantidadBuenas: v.trasladar })));
}

// ---------------------------------------------------------------------------
// Las tarjetas
// ---------------------------------------------------------------------------

export type ContextoDecisiones = {
  hoy: string;
  ordenes: OrdenParaDecidir[];
  insumos: InsumoParaDecidir[];
  llegadas: LlegadaPendiente[];
  demanda: Map<string, DemandaInsumo>;
  comprobantes: ComprobanteProduccion[];
  modelos: FilaModelo[];
  /** El Taller, de donde salen las prendas que «Llevar a tienda» lleva. Sin él no se dibuja esa tarjeta (la fila de la tabla sí dice el estado). */
  tallerId?: string | null;
  /** Lo que viene en camino de cada tela y avío (por insumo): lo que FALTA RECIBIR de las órdenes de insumos, sin los pedidos atrasados, que se cuenta como tela que llega (regla de Felipe del 2026-10-16). Sin ello nada viene. */
  enCamino?: Map<string, CaminoDeInsumo>;
  /** Los modelos por producir tienen su propia lista («¿Qué fabrico primero?», `lib/produccion-primero.ts`): con `true` no se arman sus tarjetas, para no decir lo mismo dos veces. De fábrica `false`. */
  producirAparte?: boolean;
  /** La fase en que está cada orden abierta, con el nombre de la lista de Órdenes («Por plotear», «En costura»), por id de orden. Sin él (la lista no se pudo leer) se dice la etapa de siempre. */
  faseDeLaOrden?: Readonly<Record<string, string>>;
};

/** Lo que viene a un insumo: `cuenta` (lo que falta recibir y no está atrasado), `atrasado` (lo que falta recibir de pedidos cuya fecha ya pasó: no cuenta) y los `pedidos`, los que cuentan primero. */
export type CaminoDeInsumo = { cuenta: number; atrasado: number; pedidos: PedidoDeInsumo[] };

const MAX_TARJETAS = 7;
/** Ninguna clase de asunto ocupa más de 3 tarjetas: con 9 entregas vencidas se ven 3 y el resto se cuenta en «y N más» (con el pago por vencer a la vista). */
const MAX_POR_TIPO = 3;
/** Hasta 3 modelos por producir tienen su propia tarjeta (con su «Preparar orden»); con más, UNA tarjeta los junta y manda a la lista. */
const MAX_PRODUCIR_INDIVIDUALES = 3;
/** Cuántos modelos nombra la tarjeta que junta a los que hay que producir. */
const NOMBRADOS_EN_GRUPO = 3;
/** Cuántos nombres (proveedores, insumos) caben en la línea «de» de un asunto antes de decir «y N más». */
const NOMBRADOS_EN_DE = 3;

/** El `id` del bloque «Qué fabricar primero» y el de «Lo demás está en orden» (donde se despliega la tabla de modelos): a ellos manda un «y N más» de modelos. La pantalla los pone con estas mismas constantes. */
export const ID_FABRICAR = "primero";
export const ID_LO_DEMAS = "lo-demas";
const ANCLA_FABRICAR = `#${ID_FABRICAR}`;
const ANCLA_LO_DEMAS = `#${ID_LO_DEMAS}`;

/** Los asuntos de una clase que no cupieron, para decir «y N más» y a dónde ir a verlos. */
export type DecisionesOcultas = { tipo: Decision["tipo"]; cantidad: number; texto: string; href: string };

export type ResumenDeDecisiones = {
  /** Lo que se dibuja: del más urgente al menos, con los topes de arriba. */
  decisiones: Decision[];
  /** Lo que no cupo, por clase. Vacío si todo se ve. */
  ocultas: DecisionesOcultas[];
  /** Todos los asuntos que hay (la tarjeta que junta modelos cuenta como uno), se vean o no. */
  total: number;
};

const OCULTAS: Record<Decision["tipo"], { uno: string; varios: string; href: string }> = {
  entrega: { uno: "entrega", varios: "entregas", href: "/produccion/ordenes" },
  insumo: { uno: "insumo que falta", varios: "insumos que faltan", href: "/produccion/insumos" },
  recibir: { uno: "tela por recibir", varios: "telas por recibir", href: "/produccion/comprobantes" },
  pago: { uno: "pago", varios: "pagos", href: "/produccion/por-pagar" },
  producir: { uno: "modelo por producir", varios: "modelos por producir", href: ANCLA_FABRICAR },
  trasladar: { uno: "modelo por llevar a tienda", varios: "modelos por llevar a tienda", href: ANCLA_LO_DEMAS },
  sobrestock: { uno: "modelo con stock de sobra", varios: "modelos con stock de sobra", href: ANCLA_LO_DEMAS },
  minimo: { uno: "insumo por acabarse", varios: "insumos por acabarse", href: "/produccion/insumos" },
};

/** «5,1»: lo que se vende por semana (el ritmo es por día). */
export const porSemana = (ritmoDia: number) => (Math.round(ritmoDia * 7 * 10) / 10).toLocaleString("es-PE");

const prendasTexto = (n: number) => (n === 1 ? "1 prenda" : `${n} prendas`);

/** «Lino, Denim y Gabardina» o, si son más de `tope`, «Lino, Denim, Gabardina y 2 más»: los nombres de la línea «de». */
function enumerar(nombres: string[], tope: number = NOMBRADOS_EN_DE): string {
  const unicos = [...new Set(nombres)];
  if (unicos.length > tope) return `${unicos.slice(0, tope).join(", ")} y ${unicos.length - tope} más`;
  if (unicos.length <= 1) return unicos[0] ?? "";
  return `${unicos.slice(0, -1).join(", ")} y ${unicos[unicos.length - 1]}`;
}

/** Lo que queda en las tiendas, como dato: el número, o «Agotado» en ámbar (nunca «0»). */
const parEnTiendas = (stockRed: number): ParDeDato => (stockRed <= 0 ? { rotulo: "En tiendas", valor: "Agotado", tono: "ambar" } : { rotulo: "En tiendas", valor: String(stockRed) });

/** Un pedido dicho en una frase, sin punto medio: «OI-000003, 50 m a Textiles Andinos, llega el vie 23 oct». */
const pedidoEnFrase = (p: PedidoDeInsumo) => textoDePedido(p).replaceAll(" · ", ", ");

/**
 * «no hay orden abierta», o, si ya hay una que no alcanza, lo dice —la tarjeta nunca afirma «no hay orden» delante de una orden— y cuánto falta, salvo con poca base (una cantidad ahí es ruido,
 * como en `sugerenciaDeOrden`). No cita la cantidad de la orden: con varias tallas, lo que suma `enProduccion` no es lo que cubrió la falta de cada una.
 */
const frasePorOrden = (m: FilaModelo) =>
  m.enProduccion === 0 ? "no hay orden abierta" : baseDelRitmo(m.ventasBase).pocaBase ? "lo que ya se fabrica no alcanza" : `lo que ya se fabrica no alcanza (faltan ${m.producir})`;

// Las dos tarjetas de «producir» solo se arman sin `producirAparte`. El Resumen las pide aparte (su lista «Qué fabricar primero»), así que hoy no se dibujan: conservan su frase de siempre.
function tarjetaProducir(m: FilaModelo & { ritmoDia: number }): Decision {
  const sugerida = sugerenciaDeOrden(m);
  return {
    id: `producir-${m.productoId}`,
    severidad: 3,
    tipo: "producir",
    titulo:
      m.stockRed <= 0
        ? `«${m.referencia}» ya se agotó en las tiendas y ${frasePorOrden(m)}`
        : `«${m.referencia}» se agota en ~${textoDiasDeStock(m.stockRed, m.diasRed ?? 0)} y ${frasePorOrden(m)}`,
    de: m.referencia,
    pares: [parEnTiendas(m.stockRed), { rotulo: "Venta por semana", valor: porSemana(m.ritmoDia) }],
    porque: `Se vende ${porSemana(m.ritmoDia)} por semana (${baseDelRitmo(m.ventasBase).largo}) y quedan ${m.stockRed} en tiendas${m.stockTaller > 0 ? `, más ${m.stockTaller} en el Taller por llevar a tienda` : ""}${m.enCamino > 0 ? `, ${m.enCamino} en camino` : ""}.${sugerida ? ` ${textoSugerencia(sugerida)}.` : ""}`,
    // Un solo nombre para el botón (Felipe 2026-11-26): «Preparar orden». Con una cantidad que decir la orden se abre con ella escrita; con poca base, vacía.
    accion: { texto: "Preparar orden", href: hrefNuevaOrden(m.productoId, sugerida !== null) },
    productoIds: [m.productoId],
  };
}

/** Una sola tarjeta para cuando son muchos: nombra a los más urgentes (la lista ya viene ordenada) y manda a la lista, donde está cada uno con su botón. */
function tarjetaProducirAgrupada(ms: (FilaModelo & { ritmoDia: number })[]): Decision {
  const urgentes = ms.slice(0, NOMBRADOS_EN_GRUPO);
  const nombrados = urgentes.map((m) => `«${m.referencia}» (${m.stockRed <= 0 ? "ya se agotó" : `quedan ${m.stockRed}`}, ${porSemana(m.ritmoDia)} por semana, ${baseDelRitmo(m.ventasBase).corto})`);
  const resto = ms.length - nombrados.length;
  const conOrden = ms.filter((m) => m.enProduccion > 0).length;
  return {
    id: "producir-grupo",
    severidad: 3,
    tipo: "producir",
    titulo: `${ms.length} modelos por producir ${conOrden === 0 ? "y ninguno tiene orden abierta" : `y en ${conOrden} lo que ya se fabrica no alcanza`}`,
    de: enumerar(ms.map((m) => m.referencia), NOMBRADOS_EN_GRUPO),
    pares: [
      { rotulo: "Modelos", valor: String(ms.length) },
      { rotulo: "Con orden abierta", valor: conOrden === 0 ? "Ninguno" : String(conOrden) },
    ],
    porque: `Los más urgentes (ventas de los últimos ${DIAS_RITMO_RECIENTE} días): ${nombrados.join(", ")}${resto > 0 ? `; y ${resto} más` : ""}.`,
    accion: { texto: `Ver los ${ms.length} modelos`, href: ANCLA_FABRICAR, ver: true },
    productoIds: urgentes.map((m) => m.productoId),
    asuntos: ms.length,
  };
}

/** Lo que falta ya está hecho y guardado en el Taller: no hay que fabricar nada, hay que llevarlo a las tiendas. */
function tarjetaTrasladar(m: FilaModelo & { ritmoDia: number }, href: string): Decision {
  const enTiendas = m.stockRed <= 0 ? "Ya se agotó en las tiendas" : `Lo que queda en las tiendas alcanza para ${textoDiasDeStock(m.stockRed, m.diasRed ?? 0)}`;
  return {
    id: `trasladar-${m.productoId}`,
    severidad: 3,
    tipo: "trasladar",
    titulo: "Prendas listas sin llevar a tienda",
    de: m.referencia,
    pares: [{ rotulo: "En el Taller", valor: prendasTexto(m.stockTaller) }, parEnTiendas(m.stockRed)],
    porque: `${enTiendas} y se vende ${porSemana(m.ritmoDia)} por semana (${baseDelRitmo(m.ventasBase).largo}). Llevar ${m.trasladar} a tienda${m.enCamino + m.enProduccionContada > 0 ? ", junto con lo que ya viene," : ""} cubre ${DIAS_OBJETIVO_PRODUCCION} días de venta: no hace falta fabricar.`,
    accion: { texto: "Llevar a tienda", href },
    productoIds: [m.productoId],
  };
}

/** Los pagos que vencen: lo vencido manda (severidad 3, monto en rojo); si no hay vencido, lo que vence en 7 días. Una sola tarjeta: se paga en la misma pantalla. */
function tarjetaPago(comprobantes: ComprobanteProduccion[], hoy: string): Decision | null {
  const tramos = tramosPorPagar(comprobantes, hoy);
  const vencido = tramos.find((t) => t.clave === "vencido");
  const semana = tramos.find((t) => t.clave === "semana");
  const tramo = vencido ?? semana;
  if (!tramo) return null;
  const n = tramo.comprobantes.length;
  // El tramo viene ordenado: el primero es el que venció (o vence) antes.
  const primero = tramo.comprobantes[0].fechaVencimiento;
  const dias = primero ? diasHasta(primero, hoy) : null;
  const documentos = `${tramo.comprobantes.slice(0, 3).map((x) => `${x.proveedor} ${x.serie}-${x.numero}`).join(", ")}${n > 3 ? ` y ${n - 3} más` : ""}`;
  const comun = { id: "pago", tipo: "pago" as const, de: enumerar(tramo.comprobantes.map((x) => x.proveedor)), accion: { texto: "Ir a Por pagar", href: "/produccion/por-pagar", ver: true } };
  if (vencido) {
    const pares: ParDeDato[] = [{ rotulo: "Monto", valor: soles(vencido.monto), tono: "rojo" }];
    if (dias !== null && dias < 0) pares.push({ rotulo: n === 1 ? "Venció" : "El primero venció", valor: `Hace ${plural(-dias, "día", "días")}` });
    if (semana) pares.push({ rotulo: "Vence esta semana", valor: soles(semana.monto) });
    return { ...comun, severidad: 3, titulo: n === 1 ? "Un pago está vencido" : `${n} pagos están vencidos`, pares, porque: `Lo vencido: ${documentos}.` };
  }
  const pares: ParDeDato[] = [{ rotulo: "Monto", valor: soles(tramo.monto) }];
  if (dias !== null) pares.push({ rotulo: n === 1 ? "Vence" : "El primero vence", valor: dias <= 0 ? "Hoy" : dias === 1 ? "Mañana" : `En ${dias} días` });
  return { ...comun, severidad: 2, titulo: n === 1 ? "Vence un pago esta semana" : "Vencen pagos esta semana", pares, porque: `Lo que vence: ${documentos}.` };
}

export function resumenDeDecisiones(c: ContextoDecisiones): ResumenDeDecisiones {
  const out: Decision[] = [];
  const porId = new Map(c.insumos.map((i) => [i.id, i]));

  // 1 · entregas vencidas o por vencer (solo hechos: la fecha ya pasó / falta poco)
  for (const o of c.ordenes) {
    if (o.estado !== "en_proceso") continue;
    const e = estadoEntrega(o.fechaEntrega, c.hoy);
    if (e.tipo !== "vencida" && e.tipo !== "pronto") continue;
    const etapa = etapaActual(o.etapas, o.esMuestra);
    // La fase la dice la lista de Órdenes cuando se pudo leer: así las dos pantallas nombran igual dónde está («Por plotear», no «Corte»).
    const fase = c.faseDeLaOrden?.[o.id];
    const dondeEsta: ParDeDato = fase
      ? { rotulo: "Dónde está", valor: fase }
      : etapa === "listo"
        ? { rotulo: "Está", valor: "Lista para el stock" }
        : { rotulo: "Está en", valor: etapasDe(o.esMuestra).find((x) => x.clave === etapa)?.etiqueta ?? etapa };
    const comun = {
      id: `entrega-${o.id}`,
      tipo: "entrega" as const,
      de: o.numeroTexto ? `${o.referencia}, ${o.esMuestra ? "muestra" : "orden"} ${o.numeroTexto}` : `${o.referencia}${o.esMuestra ? " (muestra)" : ""}`,
      accion: { texto: "Ver la orden", href: `/produccion/ordenes?orden=${o.id}`, ver: true },
    };
    const son: ParDeDato = { rotulo: "Son", valor: prendasTexto(o.cantidadPlan) };
    if (e.tipo === "vencida")
      out.push({ ...comun, severidad: 3, titulo: "Una orden está atrasada", pares: [{ rotulo: "Debía entregarse", valor: `Hace ${plural(e.dias, "día", "días")}`, tono: "ambar" }, dondeEsta, son] });
    else
      out.push({
        ...comun,
        severidad: 2,
        titulo: e.dias === 0 ? "Una orden se entrega hoy" : "Una orden se entrega pronto",
        pares: [e.dias === 0 ? { rotulo: "Se entrega", valor: "Hoy", tono: "ambar" } : { rotulo: "Se entrega", valor: `En ${plural(e.dias, "día", "días")}` }, dondeEsta, son],
      });
  }

  // 2 · tela y avíos que faltan para lo que las órdenes abiertas todavía necesitan
  const llegadasPorInsumo = new Map<string, LlegadaPendiente[]>();
  for (const l of c.llegadas) if (l.pendiente > 0) llegadasPorInsumo.set(l.insumoId, [...(llegadasPorInsumo.get(l.insumoId) ?? []), l]);
  const yaAvisados = new Set<string>();
  for (const d of c.demanda.values()) {
    const i = porId.get(d.insumoId);
    if (!i || d.necesita <= i.saldo + 1e-9) continue;
    const falta = d.necesita - i.saldo;
    const viene = llegadasPorInsumo.get(i.id) ?? [];
    const porLlegar = viene.reduce((s, l) => s + l.pendiente, 0);
    const esTela = i.tipo === "tela";
    const pide = `Las órdenes abiertas (${d.ordenes.join(", ")}) todavía necesitan ${cantidadTexto(d.necesita, i.unidad)} y hay ${cantidadTexto(i.saldo, i.unidad)}`;
    yaAvisados.add(i.id);
    if (porLlegar + 1e-9 >= falta && viene.length > 0) {
      const facturas = [...new Set(viene.map((l) => l.documento))];
      const docs = [...new Set(viene.map((l) => `${l.documento} (${l.proveedor})`))].join(", ");
      out.push({
        id: `insumo-${i.id}`,
        severidad: 3,
        tipo: "recibir",
        titulo: esTela ? "Falta recibir tela ya comprada" : "Falta recibir avíos ya comprados",
        de: i.nombre,
        pares: [
          { rotulo: "Faltan", valor: cantidadTexto(falta, i.unidad), tono: "ambar" },
          { rotulo: "Por recibir", valor: cantidadTexto(porLlegar, i.unidad) },
          { rotulo: facturas.length === 1 ? "Factura" : "Facturas", valor: facturas.length === 1 ? facturas[0] : `${facturas[0]} y ${facturas.length - 1} más` },
        ],
        porque: `${pide}. Falta recibir ${cantidadTexto(porLlegar, i.unidad)}: ${docs}. Recibirlo destraba el corte.`,
        // Sin la pantalla Recibir del Taller (ADR-0702): se va a la factura, donde se ve qué falta.
        accion: { texto: "Ver la factura", href: "/produccion/comprobantes", ver: true },
      });
      continue;
    }
    // Lo que viene en camino (lo que falta recibir de los pedidos, sin los atrasados) se SUMA a lo que hay: una orden de insumos ya se liga a la recepción (ADR-0362), así que no se cuenta dos veces.
    const camino = c.enCamino?.get(i.id) ?? { cuenta: 0, atrasado: 0, pedidos: [] };
    const viaja = porLlegar + camino.cuenta;
    const nombrados = camino.pedidos.slice(0, 2).map(pedidoEnFrase).join("; ");
    const mas = camino.pedidos.length > 2 ? ` y ${camino.pedidos.length - 2} más` : "";
    const cuenta = [
      `${pide}`,
      porLlegar > 0 ? `facturado por recibir ${cantidadTexto(porLlegar, i.unidad)}` : null,
      camino.pedidos.length > 0 ? `en camino${camino.cuenta > 0 ? ` ${cantidadTexto(camino.cuenta, i.unidad)}` : ""}: ${nombrados}${mas}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    if (viaja + 1e-9 >= falta && camino.cuenta > 0) {
      // Alcanza, pero solo cuando llegue lo pedido: se avisa (sale amarillo, no rojo) y se manda a mirar los pedidos.
      out.push({
        id: `insumo-${i.id}`,
        severidad: 2,
        tipo: "insumo",
        titulo: esTela ? "Falta tela, pero ya viene" : "Faltan avíos, pero ya vienen",
        de: i.nombre,
        pares: [
          { rotulo: "Faltan", valor: cantidadTexto(falta, i.unidad), tono: "ambar" },
          { rotulo: "En camino", valor: cantidadTexto(viaja, i.unidad) },
        ],
        porque: `${cuenta}. Alcanza cuando llegue lo pedido. Si ya llegó, anótalo en Insumos y este número baja.`,
        accion: { texto: "Ver en Insumos", href: "/produccion/insumos", ver: true },
      });
    } else {
      const atrasados = camino.pedidos.filter((p) => p.atrasado);
      // Lo que dice depende de lo que viene: si viene algo, «ni con lo que viene»; si solo hay pedidos atrasados, que no se cuentan; y si no hay nada pedido, que no hay nada pedido.
      const loQueViene: ParDeDato[] = [];
      if (viaja > 0) loQueViene.push({ rotulo: "En camino", valor: cantidadTexto(viaja, i.unidad) });
      if (atrasados.length > 0) loQueViene.push(atrasados.length === 1 ? { rotulo: "Pedido atrasado", valor: "No se cuenta", tono: "ambar" } : { rotulo: "Pedidos atrasados", valor: `${atrasados.length}, no se cuentan`, tono: "ambar" });
      if (loQueViene.length === 0) loQueViene.push({ rotulo: "Pedido en camino", valor: "Ninguno" });
      const explica =
        viaja > 0
          ? `No alcanza ni con lo que viene.${atrasados.length > 0 ? ` Hay ${atrasados.length === 1 ? "un pedido atrasado" : `${atrasados.length} pedidos atrasados`} que no cuento.` : ""}`
          : atrasados.length > 0
            ? "No alcanza: lo pedido está atrasado y no lo cuento."
            : "No alcanza y no hay nada pedido.";
      out.push({
        id: `insumo-${i.id}`,
        severidad: 3,
        tipo: "insumo",
        titulo: esTela ? "Falta tela para cortar" : "Faltan avíos",
        de: i.nombre,
        pares: [{ rotulo: "Faltan", valor: cantidadTexto(falta - viaja, i.unidad), tono: "ambar" }, ...loQueViene],
        porque: `${cuenta}. ${explica}`,
        // Sin Órdenes de insumos (ADR-0702, 2026-11-25): lo que falta se compra y se anota en Insumos ▸ «Llegó una compra».
        accion: atrasados.length > 0 ? { texto: "Ver en Insumos", href: "/produccion/insumos", ver: true } : { texto: esTela ? "Comprar tela" : "Comprar avíos", href: "/produccion/insumos" },
      });
    }
  }

  // 3 · plata que vence
  const pago = tarjetaPago(c.comprobantes, c.hoy);
  if (pago) out.push(pago);

  // 4 · qué producir: hasta 3 modelos, una tarjeta cada uno; con más, una sola que los junta (los 9 «producir» ya no se comen a lo demás)
  const porProducir = c.producirAparte ? [] : c.modelos.filter((m): m is FilaModelo & { ritmoDia: number } => m.estado === "producir_ya" && !!m.ritmoDia);
  if (porProducir.length > MAX_PRODUCIR_INDIVIDUALES) out.push(tarjetaProducirAgrupada(porProducir));
  else for (const m of porProducir) out.push(tarjetaProducir(m));
  // Lo que falta ya está en el Taller: se lleva a tienda. Solo cuando de verdad urge (la misma barra que «Producir ya»); más allá de 7 días lo dice la fila de la tabla.
  for (const m of c.modelos) {
    const href = urlTrasladarModelo(m, c.tallerId);
    if (m.estado === "trasladar" && m.ritmoDia && href && (m.diasRed ?? Infinity) <= UMBRAL_COBERTURA_RIESGO_DIAS) out.push(tarjetaTrasladar(m as FilaModelo & { ritmoDia: number }, href));
  }
  for (const m of c.modelos) {
    if (m.estado === "sobrestock" && m.ritmoDia)
      out.push({
        id: `sobrestock-${m.productoId}`,
        severidad: 1,
        tipo: "sobrestock",
        titulo: "Hay de sobra: no fabriques más",
        de: m.referencia,
        pares: [
          { rotulo: "En tiendas", valor: String(m.stockRed) },
          { rotulo: "Alcanza para", valor: `${Math.round(m.diasRed ?? 0)} días` },
        ],
        porque: `Se vende ${porSemana(m.ritmoDia)} por semana (${baseDelRitmo(m.ventasBase).largo}) y hay ${m.stockRed} en tiendas y almacenes.`,
        // «Ver el modelo», no «Ver qué producir»: la tarjeta dice «no fabriques más» y su botón no puede decir lo contrario (segunda prueba ciega, 2026-10-27). Abre su hoja; sin ella, baja a la tabla.
        accion: { texto: "Ver el modelo", href: ANCLA_LO_DEMAS, modelo: m.productoId },
        productoIds: [m.productoId],
      });
  }

  // 5 · insumos bajo el mínimo (los que ya tienen su tarjeta de falta no se repiten)
  // «No hay pedido en camino»: ni facturado por recibir ni un pedido que cuente; un pedido atrasado no cuenta como en camino.
  const bajos = c.insumos.filter((i) => (i.tono === "bajo" || i.tono === "sin_saldo") && !yaAvisados.has(i.id) && !(llegadasPorInsumo.get(i.id)?.length) && !((c.enCamino?.get(i.id)?.cuenta ?? 0) > 0));
  if (bajos.length > 0) {
    const [uno] = bajos;
    const paresDeUno: ParDeDato[] = [{ rotulo: "Quedan", valor: cantidadTexto(uno.saldo, uno.unidad), tono: "ambar" }];
    if (uno.minimo !== null) paresDeUno.push({ rotulo: "Lo mínimo es", valor: cantidadTexto(uno.minimo, uno.unidad) });
    paresDeUno.push({ rotulo: "Pedido en camino", valor: "Ninguno" });
    out.push({
      id: "minimo",
      severidad: 2,
      tipo: "minimo",
      titulo: bajos.length === 1 ? "Un insumo por acabarse" : "Insumos por acabarse",
      de: enumerar(bajos.map((i) => i.nombre)),
      // Uno solo: lo que queda contra su mínimo. Varios: lo que queda de cada uno (hasta 3; el resto está en la línea «de» y en el porqué).
      pares: bajos.length === 1 ? paresDeUno : bajos.slice(0, NOMBRADOS_EN_DE).map((i) => ({ rotulo: i.nombre, valor: cantidadTexto(i.saldo, i.unidad), tono: "ambar" as const })),
      porque: `${bajos.map((i) => `${i.nombre}: quedan ${cantidadTexto(i.saldo, i.unidad)}${i.minimo !== null ? ` y lo mínimo es ${cantidadTexto(i.minimo, i.unidad)}` : ""}`).join("; ")}. No hay pedido en camino.`,
      accion: { texto: "Ver Insumos", href: "/produccion/insumos", ver: true },
    });
  }

  // Del más urgente al menos (el orden es estable: dentro de una severidad quedan en el orden en que se armaron). Se dibuja hasta MAX_TARJETAS y sin
  // pasar de MAX_POR_TIPO por clase; lo que no cabe NO se pierde en silencio: se cuenta por clase para decir «y N más» y a dónde ir a verlo.
  const ordenadas = out.sort((a, b) => b.severidad - a.severidad);
  const decisiones: Decision[] = [];
  const porTipo = new Map<Decision["tipo"], number>();
  const fuera = new Map<Decision["tipo"], number>();
  for (const d of ordenadas) {
    const n = porTipo.get(d.tipo) ?? 0;
    if (decisiones.length < MAX_TARJETAS && n < MAX_POR_TIPO) {
      decisiones.push(d);
      porTipo.set(d.tipo, n + 1);
    } else fuera.set(d.tipo, (fuera.get(d.tipo) ?? 0) + (d.asuntos ?? 1));
  }
  const ocultas: DecisionesOcultas[] = [...fuera].map(([tipo, cantidad]) => ({ tipo, cantidad, texto: cantidad === 1 ? OCULTAS[tipo].uno : OCULTAS[tipo].varios, href: OCULTAS[tipo].href }));
  return { decisiones, ocultas, total: ordenadas.length };
}

/** Cuántos asuntos de cada clase hay en «Por resolver», se vean o estén en «y N más»: con esto «Lo demás está en orden» sabe qué ya se dijo arriba y no lo repite como alarma. */
export function asuntosPorTipo(r: Pick<ResumenDeDecisiones, "decisiones" | "ocultas">): Partial<Record<Decision["tipo"], number>> {
  const cuenta: Partial<Record<Decision["tipo"], number>> = {};
  for (const d of r.decisiones) cuenta[d.tipo] = (cuenta[d.tipo] ?? 0) + (d.asuntos ?? 1);
  for (const o of r.ocultas) cuenta[o.tipo] = (cuenta[o.tipo] ?? 0) + o.cantidad;
  return cuenta;
}

// ---------------------------------------------------------------------------
// Lo que se debe a los proveedores del Taller
// ---------------------------------------------------------------------------

/** Lo que el Resumen necesita saber de los pagos para decir si están al día: lo vencido, lo que vence en 7 días, el total y si hay alguna factura cargada (sin ninguna, «no se debe nada» sería afirmar lo que no se sabe). */
export type PagosDelTaller = { porPagar: number; vencido: number; estaSemana: number; facturasCargadas: number };

export function pagosDelTaller(comprobantes: ComprobanteProduccion[], hoy: string): PagosDelTaller {
  const tramos = tramosPorPagar(comprobantes, hoy);
  const monto = (clave: "vencido" | "semana") => tramos.find((t) => t.clave === clave)?.monto ?? 0;
  return { porPagar: Math.round(tramos.reduce((s, t) => s + t.monto, 0) * 100) / 100, vencido: monto("vencido"), estaSemana: monto("semana"), facturasCargadas: comprobantes.length };
}

// ---------------------------------------------------------------------------
// ¿Alcanza la tela? Una fila por tela
// ---------------------------------------------------------------------------

export type FilaTela = {
  insumoId: string;
  nombre: string;
  unidad: UnidadInsumo;
  saldo: number;
  /** Lo que viene y cuenta: lo facturado sin orden por recibir más lo que viene en camino de los pedidos (sin los atrasados). */
  porLlegar: number;
  /** De `porLlegar`, lo facturado por recibir que no es de una orden de insumos. */
  facturado: number;
  /** De `porLlegar`, lo que falta recibir de los pedidos generados (regla de Felipe del 2026-10-16). */
  enCamino: number;
  /** Lo que falta recibir de pedidos ATRASADOS (su fecha estimada de entrega ya pasó): no cuenta en `porLlegar`. */
  atrasado: number;
  /** Lo que las órdenes abiertas todavía necesitan; 0 = ninguna orden la pide (o el modelo no tiene rendimiento medido). */
  piden: number;
  estado: "sin_demanda" | "alcanza" | "alcanza_si_llega" | "falta";
  faltan: number;
  /** Los pedidos de esta tela con lo que falta recibir de cada uno: los que cuentan primero, los atrasados al fondo. */
  pedidos: PedidoDeInsumo[];
};

export function filasDeTela(insumos: InsumoParaDecidir[], demanda: Map<string, DemandaInsumo>, llegadas: LlegadaPendiente[], enCamino: Map<string, CaminoDeInsumo> = new Map()): FilaTela[] {
  return insumos
    .filter((i) => i.tipo === "tela")
    .map((i) => {
      const piden = demanda.get(i.id)?.necesita ?? 0;
      const facturado = llegadas.filter((l) => l.insumoId === i.id).reduce((s, l) => s + Math.max(0, l.pendiente), 0);
      const camino = enCamino.get(i.id);
      const viene = Math.max(camino?.cuenta ?? 0, 0);
      const porLlegar = facturado + viene;
      const estado: FilaTela["estado"] = piden <= 1e-9 ? "sin_demanda" : i.saldo + 1e-9 >= piden ? "alcanza" : i.saldo + porLlegar + 1e-9 >= piden ? "alcanza_si_llega" : "falta";
      return {
        insumoId: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        saldo: i.saldo,
        porLlegar,
        facturado,
        enCamino: viene,
        atrasado: Math.max(camino?.atrasado ?? 0, 0),
        piden,
        estado,
        faltan: estado === "falta" ? piden - i.saldo - porLlegar : 0,
        pedidos: camino?.pedidos ?? [],
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
