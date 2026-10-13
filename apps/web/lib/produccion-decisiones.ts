// Resumen de Producción: «¿qué necesita mi decisión hoy?» (ADR-0133, F6). Puro: sin Supabase ni React.
//
// Cada tarjeta nace de datos que YA existen y lleva su evidencia; ninguna es un texto fijo, y desaparece sola cuando el dato cambia (se recibe la tela,
// se paga, se cierra la orden). Solo HECHOS y cuentas sobre datos medidos: no hay plazos por etapa, ni «días de trabajo que faltan», ni tiempo de una corrida
// inventados (contrato del plan). Donde no hay base honesta —sin ritmo de venta, sin rendimiento medido— la tarjeta no se dibuja, en vez de adivinar.

import { DIAS_RITMO_RECIENTE, UMBRAL_COBERTURA_ALTA_DIAS, UMBRAL_COBERTURA_RIESGO_DIAS, UMBRAL_COBERTURA_SALUDABLE_DIAS, UMBRAL_POCA_BASE_VENTAS } from "./inventario-reglas";
import { redondear2, type ComprobanteProduccion } from "./comprobantes-produccion-reglas";
import { cantidadTexto, type UnidadInsumo } from "./insumos-reglas";
import { DIAS_ENTREGA_PRONTO, estadoEntrega, etapaActual, etapasDe, urlLlevarATiendas, type EtapaClave, type EstadoEtapa } from "./produccion-reglas";
import { DIAS_OBJETIVO_PRODUCCION, repartirFalta, type DemandaVariante, type Rendimiento } from "./produccion-decision-reglas";
import { tramosPorPagar } from "./por-pagar-produccion-reglas";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------
// Entradas (tipos mínimos: quien llama pasa lo que ya tiene)
// ---------------------------------------------------------------------------

export type OrdenParaDecidir = {
  id: string;
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

export type Decision = {
  id: string;
  /** 3 = pide acción ya; 2 = conviene mirarlo pronto; 1 = informativo. */
  severidad: 1 | 2 | 3;
  tipo: "entrega" | "insumo" | "recibir" | "pago" | "producir" | "trasladar" | "sobrestock" | "minimo";
  titulo: string;
  detalle: string;
  accion: { texto: string; href: string };
  /** Los modelos de que habla la tarjeta (el que es, o los 3 más urgentes si junta varios), para dibujar su foto. Vacío o ausente en las que no son de un modelo. */
  productoIds?: string[];
  /** Cuántos asuntos junta la tarjeta (los modelos por producir, en la que los reúne). Ausente = 1. Si no cabe en pantalla, «y N más» cuenta estos, no la tarjeta. */
  asuntos?: number;
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
  trasladar: "Trasladar al piso",
  en_produccion: "Ya hay orden abierta",
  vigilar: "Vigilar",
  alcanza: "Alcanza",
  sobrestock: "Sobrestock",
  sin_ritmo: "Sin ritmo medido",
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
 *   - diasRed ≤ 30 y lo que falta está en el Taller → «Trasladar al piso»
 *   - diasRed ≤ 30 con orden abierta               → «Ya hay orden abierta»; sin orden, «Vigilar»
 *   - más de 30 días                               → «Alcanza» (hasta 60) o «Sobrestock»
 */
export function filasPorModelo(demanda: DemandaVariante[], modelos: ModeloParaDecidir[], enProduccionPorVariante: Record<string, number>, diasObjetivo: number = DIAS_OBJETIVO_PRODUCCION): FilaModelo[] {
  const porVariante = new Map(demanda.map((d) => [d.varianteId, d]));
  const filas: FilaModelo[] = modelos.map((m) => {
    const rotulos = new Map((m.variantes ?? []).map((v) => [v.varianteId, v]));
    let stockRed = 0, stockTaller = 0, enCamino = 0, enProduccion = 0, ritmo = 0, hayRitmo = false, ventasBase = 0, trasladar = 0, producir = 0;
    const variantes: VarianteDeFila[] = [];
    for (const id of m.variantesIds) {
      const enProd = enProduccionPorVariante[id] ?? 0;
      enProduccion += enProd;
      const d = porVariante.get(id);
      const falta = repartirFalta(d, enProd, diasObjetivo);
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
      else estado = enProduccion > 0 ? "en_produccion" : "vigilar";
    } else if (diasRed <= UMBRAL_COBERTURA_ALTA_DIAS) estado = "alcanza";
    else estado = "sobrestock";
    return { productoId: m.productoId, referencia: m.referencia, stockRed, stockTaller, enCamino, enProduccion, ritmoDia, ventasBase, diasRed, variantes, trasladar, producir, estado };
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

/** «S · Negro»: una talla y color como se lee en una frase. Sin ninguno de los dos, «una variante» (no se inventa un nombre). */
export function nombreDeVariante(v: Pick<RotuloDeVariante, "talla" | "color">): string {
  return [v.talla, v.color].filter(Boolean).join(" · ") || "una variante";
}

/**
 * Las tallas y colores de un modelo que SÍ tiene stock en alguna otra, y que ya se agotaron en las tiendas pero se vendían (más de `UMBRAL_POCA_BASE_VENTAS` ventas
 * en la ventana: con menos es ruido, ADR-0346). Es solo un AVISO: el consejo del modelo («Alcanza», «Sobrestock»…) no cambia por esto. Si TODO el modelo está
 * agotado no hay aviso: su estado y su cobertura ya lo dicen. Va primero la que más se vendía.
 */
export function agotadasQueSeVendian(f: Pick<FilaModelo, "stockRed" | "variantes">): VarianteDeFila[] {
  if (f.stockRed <= 0) return [];
  return f.variantes.filter((v) => v.stockRed <= 0 && v.ventasNetas > UMBRAL_POCA_BASE_VENTAS).sort((a, b) => b.ventasNetas - a.ventasNetas);
}

/** «Se vendían y ya no hay en tiendas: S · Negro, M · Negro y 2 más». Vacío si no hay ninguna. */
export function textoAgotadas(vs: VarianteDeFila[]): string {
  if (vs.length === 0) return "";
  const nombradas = vs.slice(0, NOMBRADAS_AGOTADAS).map(nombreDeVariante).join(", ");
  const resto = vs.length - NOMBRADAS_AGOTADAS;
  return `Se vendían y ya no hay en tiendas: ${nombradas}${resto > 0 ? ` y ${resto} más` : ""}`;
}

/** A dónde lleva «Trasladar al piso»: Mover mercadería con el Taller de origen y las prendas (lo que cubre la falta de cada talla y color) ya puestas. `null` sin Taller o sin nada que llevar. */
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
  /** El Taller, de donde salen las prendas que «Trasladar al piso» lleva. Sin él no se dibuja esa tarjeta (la fila de la tabla sí dice el estado). */
  tallerId?: string | null;
};

const MAX_TARJETAS = 7;
/** Ninguna clase de asunto ocupa más de 3 tarjetas: con 9 entregas vencidas se ven 3 y el resto se cuenta en «y N más» (con el pago por vencer a la vista). */
const MAX_POR_TIPO = 3;
/** Hasta 3 modelos por producir tienen su propia tarjeta (con su «Abrir orden sugerida»); con más, UNA tarjeta los junta y manda a la tabla de abajo. */
const MAX_PRODUCIR_INDIVIDUALES = 3;
/** Cuántos modelos nombra la tarjeta que junta a los que hay que producir. */
const NOMBRADOS_EN_GRUPO = 3;

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
  recibir: { uno: "tela por recibir", varios: "telas por recibir", href: "/produccion/recibir" },
  pago: { uno: "pago", varios: "pagos", href: "/produccion/por-pagar" },
  producir: { uno: "modelo por producir", varios: "modelos por producir", href: "#produce" },
  trasladar: { uno: "modelo por trasladar", varios: "modelos por trasladar", href: "#produce" },
  sobrestock: { uno: "modelo con sobrestock", varios: "modelos con sobrestock", href: "#produce" },
  minimo: { uno: "insumo bajo el mínimo", varios: "insumos bajo el mínimo", href: "/produccion/insumos" },
};

/** «5,1»: lo que se vende por semana (el ritmo es por día). */
const porSemana = (ritmoDia: number) => (Math.round(ritmoDia * 7 * 10) / 10).toLocaleString("es-PE");

/** «y no hay orden abierta», o, si ya hay una que no alcanza, cuánto falta de verdad: la tarjeta nunca dice «no hay orden» delante de una orden. */
const frasePorOrden = (m: FilaModelo) => (m.enProduccion > 0 ? `la orden abierta de ${m.enProduccion} no alcanza (faltan ${m.producir})` : "no hay orden abierta");

function tarjetaProducir(m: FilaModelo & { ritmoDia: number }): Decision {
  return {
    id: `producir-${m.productoId}`,
    severidad: 3,
    tipo: "producir",
    titulo:
      m.stockRed <= 0
        ? `«${m.referencia}» ya se agotó en las tiendas y ${frasePorOrden(m)}`
        : `«${m.referencia}» se agota en ~${textoDiasDeStock(m.stockRed, m.diasRed ?? 0)} y ${frasePorOrden(m)}`,
    detalle: `Se vende ${porSemana(m.ritmoDia)} por semana (${baseDelRitmo(m.ventasBase).largo}) y quedan ${m.stockRed} en tiendas${m.stockTaller > 0 ? `, más ${m.stockTaller} en el Taller por trasladar` : ""}${m.enCamino > 0 ? `, ${m.enCamino} en camino` : ""}.`,
    accion: { texto: "Abrir orden sugerida", href: `/produccion/ordenes?nueva=${m.productoId}` },
    productoIds: [m.productoId],
  };
}

/** Una sola tarjeta para cuando son muchos: nombra a los más urgentes (la lista ya viene ordenada) y manda a la tabla, donde está cada uno con su botón. */
function tarjetaProducirAgrupada(ms: (FilaModelo & { ritmoDia: number })[]): Decision {
  const nombrados = ms.slice(0, NOMBRADOS_EN_GRUPO).map((m) => `«${m.referencia}» (${m.stockRed <= 0 ? "ya se agotó" : `quedan ${m.stockRed}`}, ${porSemana(m.ritmoDia)} por semana, ${baseDelRitmo(m.ventasBase).corto})`);
  const resto = ms.length - nombrados.length;
  const conOrden = ms.filter((m) => m.enProduccion > 0).length;
  return {
    id: "producir-grupo",
    severidad: 3,
    tipo: "producir",
    titulo: `${ms.length} modelos por producir ${conOrden === 0 ? "y ninguno tiene orden abierta" : `y en ${conOrden === 1 ? "1" : conOrden} la orden abierta no alcanza`}`,
    detalle: `Los más urgentes (ventas de los últimos ${DIAS_RITMO_RECIENTE} días): ${nombrados.join(", ")}${resto > 0 ? `; y ${resto} más` : ""}.`,
    accion: { texto: `Ver los ${ms.length} modelos`, href: "#produce" },
    productoIds: ms.slice(0, NOMBRADOS_EN_GRUPO).map((m) => m.productoId),
    asuntos: ms.length,
  };
}

/** Lo que falta ya está hecho y guardado en el Taller: no hay que fabricar nada, hay que llevarlo a las tiendas. */
function tarjetaTrasladar(m: FilaModelo & { ritmoDia: number }, href: string): Decision {
  return {
    id: `trasladar-${m.productoId}`,
    severidad: 3,
    tipo: "trasladar",
    titulo:
      m.stockRed <= 0
        ? `«${m.referencia}» ya se agotó en las tiendas, pero hay ${m.stockTaller} en el Taller`
        : `«${m.referencia}» se agota en ~${textoDiasDeStock(m.stockRed, m.diasRed ?? 0)}, pero hay ${m.stockTaller} en el Taller`,
    detalle: `Se vende ${porSemana(m.ritmoDia)} por semana (${baseDelRitmo(m.ventasBase).largo}). Llevar ${m.trasladar} al piso cubre ${DIAS_OBJETIVO_PRODUCCION} días de venta: no hace falta fabricar.`,
    accion: { texto: "Trasladar al piso", href },
    productoIds: [m.productoId],
  };
}

/** Lo mismo que `resumenDeDecisiones(c).decisiones`: lo que se dibuja. */
export function decisionesDeProduccion(c: ContextoDecisiones): Decision[] {
  return resumenDeDecisiones(c).decisiones;
}

export function resumenDeDecisiones(c: ContextoDecisiones): ResumenDeDecisiones {
  const out: Decision[] = [];
  const porId = new Map(c.insumos.map((i) => [i.id, i]));

  // 1 · entregas vencidas o por vencer (solo hechos: la fecha ya pasó / falta poco)
  for (const o of c.ordenes) {
    if (o.estado !== "en_proceso") continue;
    const e = estadoEntrega(o.fechaEntrega, c.hoy);
    const etapa = etapaActual(o.etapas, o.esMuestra);
    const dondeEsta = etapa === "listo" ? "lista para cerrar" : `en ${etapasDe(o.esMuestra).find((x) => x.clave === etapa)?.etiqueta.toLowerCase() ?? etapa}`;
    if (e.tipo === "vencida")
      out.push({
        id: `entrega-${o.id}`,
        severidad: 3,
        tipo: "entrega",
        titulo: `«${o.referencia}» debía entregarse hace ${plural(e.dias, "día", "días")} y sigue en proceso`,
        detalle: `Son ${o.cantidadPlan} prendas${o.esMuestra ? " (muestra)" : ""}, hoy ${dondeEsta}.`,
        accion: { texto: "Ver la orden", href: `/produccion/ordenes?orden=${o.id}` },
      });
    else if (e.tipo === "pronto")
      out.push({
        id: `entrega-${o.id}`,
        severidad: 2,
        tipo: "entrega",
        titulo: e.dias === 0 ? `«${o.referencia}» se entrega hoy y sigue en proceso` : `«${o.referencia}» se entrega en ${plural(e.dias, "día", "días")} y sigue en proceso`,
        detalle: `Son ${o.cantidadPlan} prendas${o.esMuestra ? " (muestra)" : ""}, hoy ${dondeEsta}.`,
        accion: { texto: "Ver la orden", href: `/produccion/ordenes?orden=${o.id}` },
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
    const pide = `Las órdenes abiertas (${d.ordenes.join(", ")}) todavía necesitan ${cantidadTexto(d.necesita, i.unidad)} y hay ${cantidadTexto(i.saldo, i.unidad)}`;
    yaAvisados.add(i.id);
    if (porLlegar + 1e-9 >= falta && viene.length > 0) {
      const docs = [...new Set(viene.map((l) => `${l.documento} (${l.proveedor})`))].join(", ");
      out.push({
        id: `insumo-${i.id}`,
        severidad: 3,
        tipo: "recibir",
        titulo: `Faltan ${cantidadTexto(falta, i.unidad)} de ${i.nombre} para lo que hay que cortar — pero ya está facturado`,
        detalle: `${pide}. Falta recibir ${cantidadTexto(porLlegar, i.unidad)}: ${docs}. Recibirlo destraba el corte.`,
        accion: { texto: "Recibir mercadería", href: "/produccion/recibir" },
      });
    } else {
      out.push({
        id: `insumo-${i.id}`,
        severidad: 3,
        tipo: "insumo",
        titulo: `Faltan ${cantidadTexto(falta - porLlegar, i.unidad)} de ${i.nombre} para lo que hay que cortar`,
        detalle: `${pide}${porLlegar > 0 ? `; ya viene ${cantidadTexto(porLlegar, i.unidad)} facturado` : ""}. No alcanza ni contando lo que viene.`,
        accion: { texto: "Registrar el comprobante", href: "/produccion/comprobantes" },
      });
    }
  }

  // 3 · plata que vence
  const tramos = tramosPorPagar(c.comprobantes, c.hoy);
  const vencido = tramos.find((t) => t.clave === "vencido");
  const semana = tramos.find((t) => t.clave === "semana");
  if (vencido || semana) {
    const partes = [vencido ? `${soles(vencido.monto)} vencidos` : null, semana ? `${soles(semana.monto)} por vencer en 7 días` : null].filter(Boolean).join(" y ");
    const quienes = (vencido ?? semana)!.comprobantes.slice(0, 3).map((x) => `${x.proveedor} ${x.serie}-${x.numero}`).join(", ");
    out.push({
      id: "pago",
      severidad: vencido ? 3 : 2,
      tipo: "pago",
      titulo: partes,
      detalle: `${quienes}${(vencido ?? semana)!.comprobantes.length > 3 ? " y más" : ""}. Pagar tarde a un proveedor de tela pone en riesgo el crédito del que depende el Taller.`,
      accion: { texto: "Ir a Por pagar", href: "/produccion/por-pagar" },
    });
  }

  // 4 · qué producir: hasta 3 modelos, una tarjeta cada uno; con más, una sola que los junta (los 9 «producir» ya no se comen a lo demás)
  const porProducir = c.modelos.filter((m): m is FilaModelo & { ritmoDia: number } => m.estado === "producir_ya" && !!m.ritmoDia);
  if (porProducir.length > MAX_PRODUCIR_INDIVIDUALES) out.push(tarjetaProducirAgrupada(porProducir));
  else for (const m of porProducir) out.push(tarjetaProducir(m));
  // Lo que falta ya está en el Taller: se traslada. Solo cuando de verdad urge (la misma barra que «Producir ya»); más allá de 7 días lo dice la fila de la tabla.
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
        titulo: `«${m.referencia}» tiene ${Math.round(m.diasRed ?? 0)} días de stock: no produzcas más`,
        detalle: `Se vende ${porSemana(m.ritmoDia)} por semana (${baseDelRitmo(m.ventasBase).largo}) y hay ${m.stockRed} en tiendas y almacenes.`,
        accion: { texto: "Ver qué producir", href: "#produce" },
        productoIds: [m.productoId],
      });
  }

  // 5 · insumos bajo el mínimo (los que ya tienen su tarjeta de falta no se repiten)
  const bajos = c.insumos.filter((i) => (i.tono === "bajo" || i.tono === "sin_saldo") && !yaAvisados.has(i.id) && !(llegadasPorInsumo.get(i.id)?.length));
  if (bajos.length > 0)
    out.push({
      id: "minimo",
      severidad: 2,
      tipo: "minimo",
      titulo: `${bajos.map((i) => i.nombre).join(" y ")} ${bajos.length > 1 ? "están" : "está"} bajo el mínimo y no hay pedido en camino`,
      detalle: bajos.map((i) => `${i.nombre}: ${cantidadTexto(i.saldo, i.unidad)}${i.minimo !== null ? ` (mínimo ${cantidadTexto(i.minimo, i.unidad)})` : ""}`).join(" · "),
      accion: { texto: "Ver Insumos", href: "/produccion/insumos" },
    });

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

// ---------------------------------------------------------------------------
// Cifras de arriba
// ---------------------------------------------------------------------------

export type CifrasResumen = {
  capitalInsumos: number | null;
  insumosBajoMinimo: number;
  valorEnProceso: number;
  ordenesEnProceso: number;
  porPagar: number;
  vencido: number;
  entregasEnRiesgo: number;
};

/** «Entregas en riesgo» = solo lo que los hechos dicen: la fecha ya pasó o falta `DIAS_ENTREGA_PRONTO` días o menos. */
export function cifrasResumen(args: {
  hoy: string;
  ordenes: (OrdenParaDecidir & { costoTela: number; costoAvios: number })[];
  insumos: InsumoParaDecidir[];
  capitalInsumos: number | null;
  comprobantes: ComprobanteProduccion[];
}): CifrasResumen {
  const abiertas = args.ordenes.filter((o) => o.estado === "en_proceso");
  const tramos = tramosPorPagar(args.comprobantes, args.hoy);
  return {
    capitalInsumos: args.capitalInsumos,
    insumosBajoMinimo: args.insumos.filter((i) => i.tono === "bajo" || i.tono === "sin_saldo").length,
    valorEnProceso: redondear2(abiertas.filter((o) => !o.esMuestra).reduce((s, o) => s + o.costoTela + o.costoAvios, 0)),
    ordenesEnProceso: abiertas.length,
    porPagar: redondear2(tramos.reduce((s, t) => s + t.monto, 0)),
    vencido: tramos.find((t) => t.clave === "vencido")?.monto ?? 0,
    entregasEnRiesgo: abiertas.filter((o) => {
      const e = estadoEntrega(o.fechaEntrega, args.hoy);
      return e.tipo === "vencida" || (e.tipo === "pronto" && e.dias <= DIAS_ENTREGA_PRONTO);
    }).length,
  };
}

// ---------------------------------------------------------------------------
// ¿Alcanza la tela? Una fila por tela
// ---------------------------------------------------------------------------

export type FilaTela = {
  insumoId: string;
  nombre: string;
  unidad: UnidadInsumo;
  saldo: number;
  porLlegar: number;
  /** Lo que las órdenes abiertas todavía necesitan; 0 = ninguna orden la pide (o el modelo no tiene rendimiento medido). */
  piden: number;
  estado: "sin_demanda" | "alcanza" | "alcanza_si_llega" | "falta";
  faltan: number;
};

export function filasDeTela(insumos: InsumoParaDecidir[], demanda: Map<string, DemandaInsumo>, llegadas: LlegadaPendiente[]): FilaTela[] {
  return insumos
    .filter((i) => i.tipo === "tela")
    .map((i) => {
      const piden = demanda.get(i.id)?.necesita ?? 0;
      const porLlegar = llegadas.filter((l) => l.insumoId === i.id).reduce((s, l) => s + Math.max(0, l.pendiente), 0);
      const estado: FilaTela["estado"] = piden <= 1e-9 ? "sin_demanda" : i.saldo + 1e-9 >= piden ? "alcanza" : i.saldo + porLlegar + 1e-9 >= piden ? "alcanza_si_llega" : "falta";
      return { insumoId: i.id, nombre: i.nombre, unidad: i.unidad, saldo: i.saldo, porLlegar, piden, estado, faltan: estado === "falta" ? piden - i.saldo - porLlegar : 0 };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
