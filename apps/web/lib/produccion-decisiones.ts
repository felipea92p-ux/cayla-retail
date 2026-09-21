// Resumen de Producción: «¿qué necesita mi decisión hoy?» (ADR-0133, F6). Puro: sin Supabase ni React.
//
// Cada tarjeta nace de datos que YA existen y lleva su evidencia; ninguna es un texto fijo, y desaparece sola cuando el dato cambia (se recibe la tela,
// se paga, se cierra la orden). Solo HECHOS y cuentas sobre datos medidos: no hay plazos por etapa, ni «días de trabajo que faltan», ni tiempo de una corrida
// inventados (contrato del plan). Donde no hay base honesta —sin ritmo de venta, sin rendimiento medido— la tarjeta no se dibuja, en vez de adivinar.

import { UMBRAL_COBERTURA_ALTA_DIAS, UMBRAL_COBERTURA_RIESGO_DIAS, UMBRAL_COBERTURA_SALUDABLE_DIAS } from "./inventario-reglas";
import { redondear2, type ComprobanteProduccion } from "./comprobantes-produccion-reglas";
import { cantidadTexto, type UnidadInsumo } from "./insumos-reglas";
import { DIAS_ENTREGA_PRONTO, estadoEntrega, etapaActual, etapasDe, type EtapaClave, type EstadoEtapa } from "./produccion-reglas";
import type { DemandaVariante, Rendimiento } from "./produccion-decision-reglas";
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

export type ModeloParaDecidir = { productoId: string; referencia: string; variantesIds: string[] };

export type Decision = {
  id: string;
  /** 3 = pide acción ya; 2 = conviene mirarlo pronto; 1 = informativo. */
  severidad: 1 | 2 | 3;
  tipo: "entrega" | "insumo" | "recibir" | "pago" | "producir" | "sobrestock" | "minimo";
  titulo: string;
  detalle: string;
  accion: { texto: string; href: string };
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

export type EstadoModelo = "producir_ya" | "en_produccion" | "vigilar" | "alcanza" | "sobrestock" | "sin_ritmo";

export type FilaModelo = {
  productoId: string;
  referencia: string;
  stockRed: number;
  stockTaller: number;
  enCamino: number;
  enProduccion: number;
  /** Unidades por día de toda la red; `null` sin ritmo medido. */
  ritmoDia: number | null;
  /** Días que dura el stock de la red al ritmo medido; `null` sin ritmo. */
  diasRed: number | null;
  estado: EstadoModelo;
};

export const ETIQUETA_ESTADO_MODELO: Record<EstadoModelo, string> = {
  producir_ya: "Producir ya",
  en_produccion: "Ya hay orden abierta",
  vigilar: "Vigilar",
  alcanza: "Alcanza",
  sobrestock: "Sobrestock",
  sin_ritmo: "Sin ritmo medido",
};

/** Suma la red por modelo y lo clasifica con los umbrales de cobertura de Inventario (7, 30 y 60 días). Sin ritmo medido no se opina. */
export function filasPorModelo(demanda: DemandaVariante[], modelos: ModeloParaDecidir[], enProduccionPorVariante: Record<string, number>): FilaModelo[] {
  const porVariante = new Map(demanda.map((d) => [d.varianteId, d]));
  const filas: FilaModelo[] = modelos.map((m) => {
    let stockRed = 0, stockTaller = 0, enCamino = 0, enProduccion = 0, ritmo = 0, hayRitmo = false;
    for (const id of m.variantesIds) {
      enProduccion += enProduccionPorVariante[id] ?? 0;
      const d = porVariante.get(id);
      if (!d) continue;
      stockRed += d.stockRed;
      stockTaller += d.stockTaller;
      enCamino += d.enCamino;
      if (d.ritmoDia) {
        ritmo += d.ritmoDia;
        hayRitmo = true;
      }
    }
    const ritmoDia = hayRitmo ? ritmo : null;
    const diasRed = ritmoDia ? stockRed / ritmoDia : null;
    let estado: EstadoModelo;
    if (diasRed === null) estado = "sin_ritmo";
    else if (diasRed <= UMBRAL_COBERTURA_RIESGO_DIAS) estado = enProduccion > 0 ? "en_produccion" : "producir_ya";
    else if (diasRed <= UMBRAL_COBERTURA_SALUDABLE_DIAS) estado = enProduccion > 0 ? "en_produccion" : "vigilar";
    else if (diasRed <= UMBRAL_COBERTURA_ALTA_DIAS) estado = "alcanza";
    else estado = "sobrestock";
    return { productoId: m.productoId, referencia: m.referencia, stockRed, stockTaller, enCamino, enProduccion, ritmoDia, diasRed, estado };
  });
  const orden: Record<EstadoModelo, number> = { producir_ya: 0, en_produccion: 1, vigilar: 2, alcanza: 3, sobrestock: 4, sin_ritmo: 5 };
  return filas.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.diasRed ?? Infinity) - (b.diasRed ?? Infinity) || a.referencia.localeCompare(b.referencia, "es"));
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
};

const MAX_TARJETAS = 7;

export function decisionesDeProduccion(c: ContextoDecisiones): Decision[] {
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

  // 4 · qué producir
  for (const m of c.modelos) {
    if (m.estado === "producir_ya" && m.ritmoDia)
      out.push({
        id: `producir-${m.productoId}`,
        severidad: 3,
        tipo: "producir",
        titulo: `«${m.referencia}» se agota en ~${Math.max(1, Math.round(m.diasRed ?? 0))} ${Math.round(m.diasRed ?? 0) <= 1 ? "día" : "días"} y no hay orden abierta`,
        detalle: `Se vende ${(Math.round(m.ritmoDia * 7 * 10) / 10).toLocaleString("es-PE")} por semana y quedan ${m.stockRed} en tiendas${m.stockTaller > 0 ? `, más ${m.stockTaller} en el Taller por trasladar` : ""}${m.enCamino > 0 ? `, ${m.enCamino} en camino` : ""}.`,
        accion: { texto: "Abrir orden sugerida", href: `/produccion/ordenes?nueva=${m.productoId}` },
      });
    if (m.estado === "sobrestock" && m.ritmoDia)
      out.push({
        id: `sobrestock-${m.productoId}`,
        severidad: 1,
        tipo: "sobrestock",
        titulo: `«${m.referencia}» tiene ${Math.round(m.diasRed ?? 0)} días de stock: no produzcas más`,
        detalle: `Se vende ${(Math.round(m.ritmoDia * 7 * 10) / 10).toLocaleString("es-PE")} por semana y hay ${m.stockRed} en tiendas y almacenes.`,
        accion: { texto: "Ver qué producir", href: "#produce" },
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

  return out.sort((a, b) => b.severidad - a.severidad).slice(0, MAX_TARJETAS);
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
