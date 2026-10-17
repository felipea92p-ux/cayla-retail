// Análisis v4 (ADR-0357): las reglas que deciden en qué grupo cae cada prenda. Lógica pura (sin base ni React): la usan el
// servidor (el resumen de cada tienda) y cada pestaña, así una prenda cae en el mismo grupo en Hoy, en su carril y en su ficha.
//
// Las cifras son las de la maqueta aprobada por Felipe (2026-10-06, artifact TBSFBD1nikBu8FeShiKMMp): se acaba lo que dura dos
// semanas o menos al ritmo de lo vendido desde que la prenda se colgó (2026-10-14; antes, los días de ventas de la tienda, y antes
// siempre 30), nunca en menos de una semana; se vigila lo que lleva un mes quieto; se liquida desde el umbral que eligió la tienda
// (60 días por defecto, uno para todos); en rojo, lo de más de 3 meses. El sistema NO decide si pedirla a otra tienda o
// comprarla (decisión 7): todo lo que se acaba aparece para comprar y, si otra tienda la tiene, se dice cuántas tiene.

import type { DatosAnalisis, EdadInventario, LlegadaPrenda, PrendaAnalisis, PrendaEnOtraSede, SedeAnalisis, VistaAnalisis } from "./analisis-tipos";
import { VISTAS_ANALISIS } from "./analisis-tipos";
import { diaLima, diasEntreFechas } from "./fechas-lima";
import { esPedidoDeTalla, type MotivoPedido } from "./se-probo-reglas";

/** Hasta cuántos días de stock «se está acabando» (el eje del carril llega a 2 semanas). */
export const DIAS_SE_ACABA = 14;
/** Desde cuántos días sin venderse se vigila (un mes). */
export const DIAS_VIGILAR = 30;
/** Desde cuántos días sin venderse va en rojo (3 meses). */
export const DIAS_TRES_MESES = 90;
/** El largo mínimo del carril «Días sin venderse» (4 meses): se alarga si «Liquidar desde» pasa de ahí (`finDelEje`). */
export const DIAS_EJE_QUIETAS = 120;
/**
 * «Liquidar desde»: el valor de fábrica y lo que acepta. Felipe, 2026-10-06: se mueve, no es fijo; 2026-10-07: sin tope, los días que
 * se quiera (de 1 a 999, lo mismo que la base: 20261007100000). Cada toque de − y + suma o resta LIQUIDAR_PASO.
 */
export const LIQUIDAR_DEFECTO = 60;
export const LIQUIDAR_MIN = 1;
export const LIQUIDAR_MAX = 999;
export const LIQUIDAR_PASO = 5;
/** Cuánto tiene que haber vendido otra tienda en 30 días para proponer mandársela («Mándalas a donde sí se venden»). */
export const VENDIDAS_PARA_ENVIAR = 2;
/** La ventana de ventas de Análisis: el ritmo de lo que se vende se mide en hasta 30 días. */
export const VENTANA_VENTAS = 30;

/**
 * Cuántos días de ventas tiene la tienda en el ERP, hasta 30: desde su primera venta, hoy incluido. Sin ventas, 30 (no hay ritmo
 * que medir y la ventana es la de siempre). Ejemplo inventado: una tienda que vende en el ERP desde el 30 de setiembre tiene 8 el
 * 7 de octubre.
 */
export function diasDeVentas(primeraVenta: string | null | undefined, hoy: string): number {
  if (!primeraVenta) return VENTANA_VENTAS;
  return Math.min(VENTANA_VENTAS, Math.max(1, diasEntreFechas(primeraVenta, hoy) + 1));
}

/**
 * El ritmo de una prenda se mide en los días que estuvo COLGADA (Felipe 2026-10-12, decidido el 2026-10-14 con su piso): una blusa
 * colgada hace 4 días que vendió 2 vende ~0,5 por día, no 2 entre los 15 días de la tienda. Nunca en menos de una semana (una venta
 * suelta de ayer no dice «1 por día») ni en más de los días de ventas de la tienda (hasta 30: lo que mide `vendidas30`).
 */
export const DIAS_MINIMOS_RITMO = 7;

/**
 * Entre cuántos días se divide lo vendido de una prenda: desde que salió al piso (`salioAlPiso`, hoy incluido), con el piso de
 * `DIAS_MINIMOS_RITMO` y el techo de los días de ventas de la tienda. Sin saber cuándo salió, los de la tienda (como antes).
 */
export function ventanaDeRitmo(salioAlPiso: string | null | undefined, hoy: string, diasTienda: number): number {
  const tienda = Math.min(VENTANA_VENTAS, Math.max(1, Math.round(diasTienda)));
  if (!salioAlPiso) return tienda;
  return Math.min(tienda, Math.max(DIAS_MINIMOS_RITMO, diasEntreFechas(salioAlPiso, hoy) + 1));
}

/** Cada talla con su ventana de ritmo (`ventanaDeRitmo`), y los días de la tienda para rearmarla en el modelo. */
export function conVentanaDeRitmo<T extends Pick<PrendaAnalisis, "salioAlPiso">>(tallas: readonly T[], hoy: string, diasTienda: number): (T & { diasDeVentas: number; diasDeVentasTienda: number })[] {
  return tallas.map((t) => ({ ...t, diasDeVentas: ventanaDeRitmo(t.salioAlPiso, hoy, diasTienda), diasDeVentasTienda: diasTienda }));
}

/** Cuántas prendas muestran las listas cortas de Hoy. */
export const PRENDAS_EN_LISTA = 5;

/** «duda»: quieta, pero alguna unidad colgada puede ser una venta sin registrar (ADR-0357, act. 2026-10-14): no se sabe, no se liquida. */
export type GrupoAnalisis = "comprar" | "enviar" | "liquidar" | "vigila" | "duda";
/** Los grupos de «Se está acabando» y de «No se vende», en el orden de su carril. */
export const GRUPOS_ACABA: readonly GrupoAnalisis[] = ["comprar"];
export const GRUPOS_QUIETAS: readonly GrupoAnalisis[] = ["enviar", "liquidar"];
export const GRUPOS_CARRIL_QUIETAS: readonly GrupoAnalisis[] = ["enviar", "liquidar", "duda", "vigila"];

/**
 * Nunca salió al piso (20261007120000): tiene unidades guardadas en mi tienda y la base no sabe de ninguna vez en su piso de venta
 * (ni una bajada, ni una venta). Lo que está colgado ya salió, aunque la base no lo hubiera visto moverse. Vive aquí (y no en
 * `analisis-piso.ts`) porque lo usan «Nunca salió al piso» y «Qué pedir».
 */
export const nuncaSalio = (p: Pick<PrendaAnalisis, "salioAlPiso" | "almacen" | "piso">): boolean => p.salioAlPiso === null && p.almacen > 0 && p.piso === 0;

/** Lo libre en mi tienda. */
export const totalEnTienda = (p: Pick<PrendaAnalisis, "piso" | "almacen">): number => p.piso + p.almacen;

/**
 * Una llegada está atrasada cuando su fecha estimada ya pasó (el mismo día todavía se espera). Sin fecha no se sabe cuándo debía llegar:
 * no se llama atrasada, y tampoco se le inventa una fecha.
 */
export const llegadaAtrasada = (x: Pick<LlegadaPrenda, "fecha">, hoy: string): boolean => x.fecha !== null && x.fecha < hoy;

/** Lo que viene en camino, partido en lo que todavía se espera y lo que ya se atrasó (A3, plan verificado 2026-10-16). */
export type LlegadasDe = {
  /** Unidades que se esperan: llegan hoy o después (hasta `hasta`, si se pide), o nadie anotó cuándo. Es lo único que cuenta como «viene». */
  vienen: number;
  /** De `vienen`, las que no tienen fecha (se dicen así; no se inventa una). */
  sinFecha: number;
  /** Unidades cuya fecha estimada ya pasó: NO cuentan como «viene» (una llegada vencida no es stock y no debe esconder una compra). */
  atrasadas: number;
  /** Los días de la más atrasada (0 si ninguna lo está). */
  diasAtraso: number;
  /** Unidades que llegan DESPUÉS de `hasta` (la meta): no cuentan como «viene» para esa meta, pero se dicen; 0 si no se pidió `hasta`. */
  despues: number;
};

/**
 * Parte lo que viene en camino a mi tienda según `hoy`. Una parte sin unidades (cero, negativa o que no es número) no cuenta en ninguna.
 * Con `hasta` (el último día que importa: Navidad hoy, el fin de la campaña con A6), lo que llega después se aparta en `despues`: un
 * pedido del 5 de enero no cubre el 25 de diciembre. Sin `hasta` no se corta por arriba (Se está acabando no mide contra una meta).
 * Un traslado en tránsito SIN líneas ni siquiera llega aquí: `fn_analisis_por_llegar` emite una parte por prenda y ese traslado no
 * tiene ninguna, así que no infla ni esconde nada (el de Taller a tienda del 20-sep de producción se cierra en su origen, Traslados).
 */
export function llegadasDe(llega: readonly LlegadaPrenda[], hoy: string, hasta?: string): LlegadasDe {
  const r: LlegadasDe = { vienen: 0, sinFecha: 0, atrasadas: 0, diasAtraso: 0, despues: 0 };
  for (const x of llega) {
    if (!(x.cantidad > 0)) continue;
    if (llegadaAtrasada(x, hoy)) {
      r.atrasadas += x.cantidad;
      r.diasAtraso = Math.max(r.diasAtraso, diasEntreFechas(x.fecha!, hoy));
    } else if (hasta !== undefined && x.fecha !== null && x.fecha > hasta) {
      r.despues += x.cantidad;
    } else {
      r.vienen += x.cantidad;
      if (x.fecha === null) r.sinFecha += x.cantidad;
    }
  }
  return r;
}

/**
 * Lo que viene en camino y todavía se espera, sume de donde sume (compra, almacén, taller, otra tienda). Lo atrasado NO suma: sigue
 * pendiente en el papel, pero no es stock ni lo será hasta que llegue (`llegadasDe` lo dice aparte).
 */
export const porLlegar = (p: Pick<PrendaAnalisis, "llega">, hoy: string): number => llegadasDe(p.llega, hoy).vienen;

/**
 * Cuántos días le quedan al ritmo de lo vendido en su ventana (`diasDeVentas`: los días que estuvo colgada, de 7 a los días de ventas
 * de la tienda, `ventanaDeRitmo`; si falta, 30): 0 si ya no hay; al menos 1 si queda algo; null si no se vendió (no se acaba: no tiene
 * ritmo).
 */
export function diasQueQuedan(p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasDeVentas">): number | null {
  if (p.vendidas30 <= 0) return null;
  const total = totalEnTienda(p);
  if (total === 0) return 0;
  const ventana = Math.min(VENTANA_VENTAS, Math.max(1, Math.round(p.diasDeVentas ?? VENTANA_VENTAS)));
  return Math.max(1, Math.round(total / (p.vendidas30 / ventana)));
}

/** Se está acabando: se vende y lo que queda dura dos semanas o menos (o ya no hay). */
export function seEstaAcabando(p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasDeVentas">): boolean {
  const d = diasQueQuedan(p);
  return d !== null && d <= DIAS_SE_ACABA;
}

/** La otra tienda que más vendió esta prenda en 30 días (para «Mándalas»); null si ninguna vendió. */
export function sedeQueMasVende(otras: readonly PrendaEnOtraSede[]): PrendaEnOtraSede | null {
  const conVenta = otras.filter((o) => o.vendidas30 > 0);
  if (conVenta.length === 0) return null;
  return [...conVenta].sort((a, b) => b.vendidas30 - a.vendidas30 || b.stock - a.stock || a.sedeId.localeCompare(b.sedeId))[0];
}

/**
 * Otra tienda que la tiene (cualquier cantidad): la que más tiene. Solo es un dato a la vista («AQP tiene 3» y «o pedir a
 * Arequipa»): la persona decide si pedirla o comprarla (decisión 7). null si ninguna la tiene.
 */
export function otraSedeQueLaTiene(otras: readonly PrendaEnOtraSede[]): PrendaEnOtraSede | null {
  const con = otras.filter((o) => o.stock >= 1);
  if (con.length === 0) return null;
  return [...con].sort((a, b) => b.stock - a.stock || b.vendidas30 - a.vendidas30 || a.sedeId.localeCompare(b.sedeId))[0];
}

/** Desde cuántos días sin venderse se liquida esta prenda: el p90 de la vara de su tipo o, sin ella, «Liquidar desde». */
export const umbralLiquidar = (p: Pick<PrendaAnalisis, "umbrales">, liquidarDesde: number): number => p.umbrales?.liquidar ?? liquidarDesde;
/** Desde cuántos días sin venderse se vigila esta prenda: el p75 de la vara de su tipo o, sin ella, un mes. */
export const umbralVigilar = (p: Pick<PrendaAnalisis, "umbrales">): number => p.umbrales?.vigila ?? DIAS_VIGILAR;

/**
 * El grupo de una prenda, o null si no pide nada (se vende bien, o todavía no lleva quieta lo que se vigila). Una prenda vive en UN
 * solo grupo: lo que se acaba se compra; lo quieto desde el umbral de liquidar se manda a donde sí se vende (si otra tienda vendió 2
 * o más) o se liquida; lo quieto desde el umbral de vigilar, se vigila. Los umbrales son los de la vara de su tipo (p90 y p75,
 * `analisis-vara.ts`; ADR-0357, act. 2026-10-14) o, sin ella, «Liquidar desde» y un mes. Lo quieto con una unidad que puede ser una
 * venta sin registrar (`enDuda`, la cuenta de Frescura) no se manda ni se liquida: va a «duda» hasta que se registre esa venta.
 */
export function grupoDe(
  p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasSinVender" | "otras" | "diasDeVentas" | "enDuda" | "umbrales">,
  liquidarDesde: number,
): GrupoAnalisis | null {
  if (seEstaAcabando(p)) return "comprar";
  if (p.vendidas30 > 0 || p.diasSinVender === null || totalEnTienda(p) === 0) return null;
  const liquidar = umbralLiquidar(p, liquidarDesde);
  if (p.diasSinVender < liquidar && p.diasSinVender < umbralVigilar(p)) return null;
  if ((p.enDuda ?? 0) > 0) return "duda";
  if (p.diasSinVender < liquidar) return "vigila";
  const vende = sedeQueMasVende(p.otras);
  if (vende && vende.vendidas30 >= VENDIDAS_PARA_ENVIAR) return "enviar";
  return "liquidar";
}

/** Las prendas de unos grupos, en el orden en que se atienden. */
export function prendasDe<T extends PrendaAnalisis>(prendas: readonly T[], grupos: readonly GrupoAnalisis[], liquidarDesde: number): T[] {
  const g = new Set(grupos);
  return prendas.filter((p) => {
    const x = grupoDe(p, liquidarDesde);
    return x !== null && g.has(x);
  });
}

/** Lo que se acaba, de lo más urgente a lo menos: primero lo agotado; a igual plazo, lo que más se vende. */
export function ordenSeAcaba(a: PrendaAnalisis, b: PrendaAnalisis): number {
  return (diasQueQuedan(a) ?? Infinity) - (diasQueQuedan(b) ?? Infinity) || b.vendidas30 - a.vendidas30 || a.nombre.localeCompare(b.nombre, "es");
}

/** Lo quieto, de lo que más espera a lo que menos. */
export function ordenQuietas(a: PrendaAnalisis, b: PrendaAnalisis): number {
  return (b.diasSinVender ?? 0) - (a.diasSinVender ?? 0) || totalEnTienda(b) - totalEnTienda(a) || a.nombre.localeCompare(b.nombre, "es");
}

/** Las unidades de mi tienda por tramo de días sin venderse («Por tienda» en No se vende). Sin dato de días, no cuenta. */
export function edadDelInventario(prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "diasSinVender">[]): EdadInventario {
  const e: EdadInventario = { hasta30: 0, de31a60: 0, de61a90: 0, masDe90: 0 };
  for (const p of prendas) {
    const u = totalEnTienda(p);
    if (u <= 0 || p.diasSinVender === null) continue;
    if (p.diasSinVender <= 30) e.hasta30 += u;
    else if (p.diasSinVender <= 60) e.de31a60 += u;
    else if (p.diasSinVender <= 90) e.de61a90 += u;
    else e.masDe90 += u;
  }
  return e;
}

/** «Liquidar desde» dentro de sus topes; lo que no es un número vuelve al de fábrica. */
export function liquidarDesdeValido(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return LIQUIDAR_DEFECTO;
  return Math.min(LIQUIDAR_MAX, Math.max(LIQUIDAR_MIN, Math.round(n)));
}

/** La pestaña de la URL (`?vista=`), o Hoy. */
export function leerVista(v: string | string[] | undefined | null): VistaAnalisis {
  const x = Array.isArray(v) ? v[0] : v;
  return (VISTAS_ANALISIS as readonly string[]).includes(x ?? "") ? (x as VistaAnalisis) : "hoy";
}

/**
 * Lo que llega buscado en la dirección (`?q=`): otra pantalla lleva a Análisis ya filtrado (el Plan de campaña manda la categoría que pide
 * más o que hay que impulsar, Felipe 2026-10-12). Recortado y con un largo razonable; vacío si no hay.
 */
export function leerBusqueda(v: string | string[] | undefined | null): string {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" ? x.trim().slice(0, 60) : "";
}

/** Busca sin tildes ni mayúsculas en nombre, color, talla y categoría (el buscador de la cabecera). */
export function coincideBusqueda(p: Pick<PrendaAnalisis, "nombre" | "color" | "talla" | "categoria">, q: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const buscado = norm(q.trim());
  if (!buscado) return true;
  return norm([p.nombre, p.color, p.talla, p.categoria ?? ""].join(" ")).includes(buscado);
}

/** Las tallas que no se nombran en una lista corta («Polo Lucky» y no «Polo Lucky · Estándar»). */
export const esTallaUnica = (talla: string): boolean => /^(est[aá]ndar|[uú]nica|unitalla|talla [uú]nica)$/i.test(talla.trim());

/** Ciudad y código de cada tienda, para hablar en tienda: «AQP tiene 3», «o pedir a Arequipa». */
const CIUDADES: readonly { patron: RegExp; codigo: string; ciudad: string }[] = [
  { patron: /\b(tru|trujillo)\b/i, codigo: "TRU", ciudad: "Trujillo" },
  { patron: /\b(aqp|arequipa)\b/i, codigo: "AQP", ciudad: "Arequipa" },
  { patron: /\b(lim|lima)\b/i, codigo: "LIM", ciudad: "Lima" },
];

/** La tienda como la nombra Análisis, a partir de su nombre del sistema («Tienda AQP» → AQP · Arequipa). */
export function sedeDeAnalisis(u: { id: string; nombre: string }): SedeAnalisis {
  const c = CIUDADES.find((x) => x.patron.test(u.nombre));
  if (c) return { id: u.id, nombre: u.nombre, codigo: c.codigo, ciudad: c.ciudad };
  const sinPrefijo = u.nombre.replace(/^tienda\s+/i, "").trim() || u.nombre;
  return { id: u.id, nombre: u.nombre, codigo: sinPrefijo.slice(0, 3).toUpperCase(), ciudad: sinPrefijo };
}

/** «1 prenda» / «3 prendas». */
export const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);

/** Un pedido de la tienda tal como lo lee `getPedidosNoAtendidos` (`pedidos_no_atendidos`). */
type PedidoParaNoHabia = { resuelto: boolean; motivo: MotivoPedido; productoReferencia: string | null; descripcionLibre: string | null; talla: string | null; creadoEn: string };

/** «Te pidieron y no había»: los pedidos de talla sin resolver, con qué se pidió y el día de Lima en que se anotó. `creadoEn` es un
 *  instante que la base manda en UTC: con sus 10 primeros caracteres, lo anotado de 7 pm a medianoche salía con el día siguiente.
 *  Sin un instante que se lea, el día queda en `null`: no se inventa. */
export function noHabiaDe(pedidos: readonly PedidoParaNoHabia[]): DatosAnalisis["noHabia"] {
  return pedidos
    .filter((p) => !p.resuelto && esPedidoDeTalla(p.motivo))
    .map((p) => ({
      que: [p.productoReferencia ?? p.descripcionLibre ?? "Prenda sin nombre", p.talla].filter(Boolean).join(" · "),
      dia: diaLima(p.creadoEn),
    }));
}
