// Nueva orden con decisión (ADR-0133, F5). Puro: sin Supabase ni React.
//
// Responde, antes de abrir una orden, lo que hoy se decidía a ojo: ¿cuánto conviene fabricar de cada talla y color?, ¿alcanza la tela y
// los avíos?, ¿cuánto costará cada prenda? Todo sale de DATOS que ya existen —el ritmo de venta y el stock de cada tienda (las mismas
// reglas de Inventario: `velocidadDeFila`, `calcularCobertura`), el consumo real de las órdenes ya cerradas y el saldo de Insumos—; no se
// inventa ningún plazo ni ningún rendimiento. Donde no hay base honesta, se dice «sin ritmo medido» / «sin historial de consumo».

import { calcularCobertura, bandaDeCobertura, velocidadDeFila, type BandaCobertura, type Cobertura, type FilaResumen, type Velocidad } from "./resumen-reglas";
import { UMBRAL_COBERTURA_SALUDABLE_DIAS } from "./inventario-reglas";
import type { UnidadInsumo } from "./insumos-reglas";

/** Cuántos días de venta se quiere cubrir con el stock de la red. Por defecto el techo de «saludable» de Inventario (30 días); el líder lo ajusta. */
export const DIAS_OBJETIVO_PRODUCCION = UMBRAL_COBERTURA_SALUDABLE_DIAS;
export const OPCIONES_DIAS_OBJETIVO = [15, 30, 45, 60] as const;

// ---------------------------------------------------------------------------
// Demanda de la red por variante
// ---------------------------------------------------------------------------

export type TipoSede = "tienda" | "almacen" | "taller";
export type FilasDeSede = { tipo: TipoSede; filas: FilaResumen[] };

export type DemandaVariante = {
  varianteId: string;
  productoId: string;
  /** Lo utilizable en tiendas y almacenes (lo que se puede vender ya). */
  stockRed: number;
  /** Prendas terminadas que están en el Taller, todavía por trasladar. */
  stockTaller: number;
  enCamino: number;
  /** Suma del ritmo de cada sede con ritmo medido (unidades por día); `null` si ninguna lo tiene. */
  ritmoDia: number | null;
  sedesConRitmo: number;
  /** Ventas netas de TODAS las sedes de la red en la ventana (sostengan o no el ritmo). */
  ventasNetas: number;
  /** Las ventas netas de las sedes con las que SE MIDIÓ el ritmo: es la base honesta de «se vende X por semana». Menor o igual a `ventasNetas`. */
  ventasBase: number;
  cobertura: Cobertura;
  banda: BandaCobertura;
};

/** Junta lo que dice cada sede en UNA fila por variante. El ritmo de la red es la suma del ritmo de cada sede (cada una medido sobre sus días con stock). */
export function demandaDeLaRed(sedes: FilasDeSede[]): Map<string, DemandaVariante> {
  const mapa = new Map<string, DemandaVariante>();
  for (const s of sedes) {
    for (const f of s.filas) {
      const d =
        mapa.get(f.varianteId) ??
        ({ varianteId: f.varianteId, productoId: f.productoId, stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia: null, sedesConRitmo: 0, ventasNetas: 0, ventasBase: 0 } as DemandaVariante);
      if (s.tipo === "taller") d.stockTaller += f.utilizable;
      else {
        d.stockRed += f.utilizable;
        d.enCamino += f.enCamino;
        const v = velocidadDeFila(f);
        d.ventasNetas += v.ventasNetas;
        if (v.estado === "ok" && v.unidadesDia) {
          d.ritmoDia = (d.ritmoDia ?? 0) + v.unidadesDia;
          d.sedesConRitmo++;
          d.ventasBase += v.ventasNetas;
        }
      }
      mapa.set(f.varianteId, d);
    }
  }
  for (const d of mapa.values()) {
    const v: Velocidad = { estado: d.ritmoDia ? "ok" : d.ventasNetas > 0 ? "poco_historial" : "sin_historial", unidadesDia: d.ritmoDia, diasBase: null, metodo: null, ventasNetas: d.ventasNetas, estimada: false };
    d.cobertura = calcularCobertura(d.stockRed, v);
    d.banda = bandaDeCobertura(d.cobertura);
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Curva sugerida
// ---------------------------------------------------------------------------

export type Sugerencia = {
  varianteId: string;
  /** Prendas que conviene fabricar de esta variante (0 = no hace falta o no hay base para decir). */
  sugerido: number;
  /** Por qué, en una frase legible. */
  motivo: string;
  /** Cuánto dura lo que hay y viene, al ritmo medido; `null` sin ritmo. */
  diasConLoQueHay: number | null;
  /** Lo que ya se cuenta como disponible: red + Taller + en camino + órdenes abiertas. */
  disponible: number;
};

const redondear1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Cuánto fabricar de una variante: lo que se venderá en `diasObjetivo` al ritmo medido, menos lo que ya hay (red, Taller, en camino y lo que ya
 * está en órdenes abiertas). Sin ritmo medido no se sugiere nada —no se inventa una demanda—, y se dice por qué.
 */
export function sugerirVariante(d: DemandaVariante | undefined, enProduccion: number, diasObjetivo: number): Sugerencia | null {
  if (!d) return null;
  const disponible = d.stockRed + d.stockTaller + d.enCamino + enProduccion;
  if (!d.ritmoDia) {
    return {
      varianteId: d.varianteId,
      sugerido: 0,
      motivo: d.ventasNetas > 0 ? "Poco historial de venta: sin ritmo medido no se sugiere cantidad." : "Sin ventas medidas en los últimos 30 días.",
      diasConLoQueHay: null,
      disponible,
    };
  }
  const necesita = d.ritmoDia * diasObjetivo;
  const sugerido = Math.max(0, Math.ceil(necesita - disponible - 1e-9));
  const dias = disponible / d.ritmoDia;
  return {
    varianteId: d.varianteId,
    sugerido,
    diasConLoQueHay: redondear1(dias),
    disponible,
    motivo:
      sugerido > 0
        ? `Se vende ${redondear1(d.ritmoDia)}/día; con lo que hay y viene alcanza ${Math.floor(dias)} días de los ${diasObjetivo} que quieres cubrir.`
        : `Con lo que hay y viene alcanza ${Math.floor(dias)} días: ya cubres los ${diasObjetivo}.`,
  };
}

/**
 * Lo que falta de una variante para cubrir `diasObjetivo` días de venta, repartido en lo que se resuelve SIN gastar —prendas terminadas que ya están en el
 * Taller y solo hay que llevar a las tiendas (`trasladar`)— y lo que de verdad hay que fabricar (`producir`). La falta cuenta lo que hay en tiendas, lo que
 * viene en camino y lo que ya está en órdenes abiertas; lo del Taller se descuenta recién después, para poder decir «llévalo» en vez de «prodúcelo».
 * `producir` es EXACTAMENTE el `sugerido` de `sugerirVariante` (que cuenta el Taller de una vez): una sola cifra para «Nueva orden» y para el Resumen.
 * Sin ritmo medido no hay base para decir qué falta: 0 y 0.
 */
export function repartirFalta(d: DemandaVariante | undefined, enProduccion: number, diasObjetivo: number): { trasladar: number; producir: number } {
  if (!d?.ritmoDia) return { trasladar: 0, producir: 0 };
  const faltaSinTaller = Math.max(0, Math.ceil(d.ritmoDia * diasObjetivo - (d.stockRed + d.enCamino + enProduccion) - 1e-9));
  const trasladar = Math.min(d.stockTaller, faltaSinTaller);
  return { trasladar, producir: faltaSinTaller - trasladar };
}

export type CurvaSugerida = { porVariante: Map<string, Sugerencia>; total: number };

export function sugerirCurva(variantes: readonly { varianteId: string }[], demanda: Map<string, DemandaVariante>, enProduccionPorVariante: Map<string, number>, diasObjetivo: number): CurvaSugerida {
  const porVariante = new Map<string, Sugerencia>();
  let total = 0;
  for (const v of variantes) {
    const s = sugerirVariante(demanda.get(v.varianteId), enProduccionPorVariante.get(v.varianteId) ?? 0, diasObjetivo);
    if (!s) continue;
    porVariante.set(v.varianteId, s);
    total += s.sugerido;
  }
  return { porVariante, total };
}

/** Lo que «Usar la sugerencia» escribe en la matriz de «Nueva orden»: la cantidad de cada variante que conviene fabricar, como texto de campo. Las que no hace falta fabricar no se escriben.
 *  También es lo que llena la matriz al llegar desde el Resumen con «Abrir orden sugerida» (`?nueva=<modelo>&sugerida=1`): la misma cifra que decía la tarjeta. */
export function cantidadesDeLaCurva(curva: CurvaSugerida): Record<string, string> {
  const cantidades: Record<string, string> = {};
  for (const [id, s] of curva.porVariante) if (s.sugerido > 0) cantidades[id] = String(s.sugerido);
  return cantidades;
}

/**
 * Lo que trae escrito la matriz de «Nueva orden» al abrirse. Vacía, salvo que se llegue desde «Abrir orden sugerida» del Resumen (`?nueva=<modelo>&sugerida=1`): entonces trae la sugerencia de la red
 * —la MISMA cuenta que dijo la tarjeta—, pero solo si el modelo pedido existe (nunca se llena el primero de la lista por error), si es una orden de producción (una muestra se hace aparte) y si la
 * red respondió. Pura, y es lo que usa el formulario: así la promesa de la tarjeta se prueba contra lo que de verdad aparece en la pantalla.
 */
export function cantidadesInicialesDeNuevaOrden(a: {
  sugerida: boolean;
  tipo: "produccion" | "muestra";
  productoInicialId: string | null;
  modelos: readonly { productoId: string; variantes: readonly { varianteId: string }[] }[];
  datos: { demanda: readonly DemandaVariante[]; enProduccion: Readonly<Record<string, number>> } | null;
  diasObjetivo?: number;
}): Record<string, string> {
  const pedido = a.sugerida && a.tipo === "produccion" && a.productoInicialId !== null ? a.modelos.find((m) => m.productoId === a.productoInicialId) : undefined;
  if (!pedido || !a.datos) return {};
  const curva = sugerirCurva(pedido.variantes, new Map(a.datos.demanda.map((d) => [d.varianteId, d])), new Map(Object.entries(a.datos.enProduccion)), a.diasObjetivo ?? DIAS_OBJETIVO_PRODUCCION);
  return cantidadesDeLaCurva(curva);
}

/** Lo que ya se está fabricando por variante: las líneas de las órdenes de producción en proceso (no muestras). */
export function enProduccionPorVariante(ordenes: { estado: string; esMuestra: boolean; lineas: { varianteId: string; cantidadPlan: number }[] }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of ordenes) {
    if (o.estado !== "en_proceso" || o.esMuestra) continue;
    for (const l of o.lineas) m.set(l.varianteId, (m.get(l.varianteId) ?? 0) + l.cantidadPlan);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Rendimiento medido (D-D): cuánto insumo consumió de verdad cada prenda de este modelo
// ---------------------------------------------------------------------------

export type OrdenParaRendimiento = { id: string; productoId: string; estado: string; esMuestra: boolean; cantidadBuenas: number | null };
export type ConsumoParaRendimiento = { insumoId: string; insumo: string; unidad: UnidadInsumo; tipo: "tela" | "avio"; cantidad: number };

export type Rendimiento = { insumoId: string; insumo: string; unidad: UnidadInsumo; tipo: "tela" | "avio"; porPrenda: number; ordenes: number; prendas: number };

/**
 * Los productos para los que hay que medir el rendimiento: los que se ofrecen para fabricar Y todo producto que tenga una orden, se ofrezca o no.
 * Una orden abierta de un modelo que se dejó de ofrecer (descontinuado, de prueba, familia apagada) igual va a cortar tela y avíos: si su
 * rendimiento no se midiera, «¿Alcanza la tela?» y «Faltan X de tela» se calcularían con menos demanda de la real y podrían esconder una falta.
 */
export function productosParaRendimiento(modelos: readonly { productoId: string }[], ordenes: readonly { productoId: string }[]): string[] {
  return [...new Set([...modelos.map((m) => m.productoId), ...ordenes.map((o) => o.productoId)])];
}

/**
 * Consumo real ÷ prendas buenas de las órdenes CERRADAS del modelo, por insumo. Se pesa por prendas (un lote grande cuenta más que uno
 * chico). Un consumo devuelto resta (`cantidad` ya viene con signo). Sin órdenes cerradas con consumo registrado, no hay rendimiento.
 */
export function rendimientoMedido(productoId: string, ordenes: OrdenParaRendimiento[], consumosPorOrden: Record<string, ConsumoParaRendimiento[]>): Rendimiento[] {
  const acum = new Map<string, { info: ConsumoParaRendimiento; consumo: number; prendas: number; ordenes: Set<string> }>();
  for (const o of ordenes) {
    if (o.productoId !== productoId || o.estado !== "terminada" || o.esMuestra || !o.cantidadBuenas || o.cantidadBuenas <= 0) continue;
    const porInsumo = new Map<string, number>();
    for (const c of consumosPorOrden[o.id] ?? []) porInsumo.set(c.insumoId, (porInsumo.get(c.insumoId) ?? 0) + c.cantidad);
    for (const c of consumosPorOrden[o.id] ?? []) {
      const neto = porInsumo.get(c.insumoId) ?? 0;
      if (neto <= 0) continue;
      const a = acum.get(c.insumoId) ?? { info: c, consumo: 0, prendas: 0, ordenes: new Set<string>() };
      if (!a.ordenes.has(o.id)) {
        a.consumo += neto;
        a.prendas += o.cantidadBuenas;
        a.ordenes.add(o.id);
      }
      acum.set(c.insumoId, a);
    }
  }
  return [...acum.values()]
    .map((a) => ({ insumoId: a.info.insumoId, insumo: a.info.insumo, unidad: a.info.unidad, tipo: a.info.tipo, porPrenda: a.consumo / a.prendas, ordenes: a.ordenes.size, prendas: a.prendas }))
    .sort((x, y) => (x.tipo === y.tipo ? x.insumo.localeCompare(y.insumo, "es") : x.tipo === "tela" ? -1 : 1));
}

// ---------------------------------------------------------------------------
// ¿Alcanza la tela y los avíos?
// ---------------------------------------------------------------------------

export type EstadoInsumoOrden = "alcanza" | "alcanza_si_llega" | "falta";

export type AnalisisInsumo = {
  insumoId: string;
  insumo: string;
  unidad: UnidadInsumo;
  tipo: "tela" | "avio";
  necesita: number;
  saldo: number;
  /** Lo facturado que todavía no llegó (F4d). */
  porLlegar: number;
  estado: EstadoInsumoOrden;
  /** Lo que falta aun contando lo que viene (0 si alcanza). */
  faltan: number;
  /** Cuántas prendas de este modelo se pueden cortar con el saldo de hoy. */
  prendasConElSaldo: number;
  ordenesMedidas: number;
};

export type SaldoParaAnalisis = { insumoId: string; saldo: number; porLlegar: number };

export function analizarInsumos(rendimiento: Rendimiento[], prendas: number, saldos: Map<string, SaldoParaAnalisis>): AnalisisInsumo[] {
  return rendimiento.map((r) => {
    const s = saldos.get(r.insumoId) ?? { insumoId: r.insumoId, saldo: 0, porLlegar: 0 };
    const necesita = r.porPrenda * prendas;
    const alcanza = s.saldo + 1e-9 >= necesita;
    const conLlegada = s.saldo + s.porLlegar + 1e-9 >= necesita;
    return {
      insumoId: r.insumoId,
      insumo: r.insumo,
      unidad: r.unidad,
      tipo: r.tipo,
      necesita,
      saldo: s.saldo,
      porLlegar: s.porLlegar,
      estado: alcanza ? "alcanza" : conLlegada ? "alcanza_si_llega" : "falta",
      faltan: conLlegada ? 0 : necesita - s.saldo - s.porLlegar,
      prendasConElSaldo: r.porPrenda > 0 ? Math.floor(Math.max(0, s.saldo) / r.porPrenda) : 0,
      ordenesMedidas: r.ordenes,
    };
  });
}

