// Plan de campaña: lo ya pedido en órdenes de compra (ADR-0372 act. 2026-10-12 (e), ADR-0362). Lógica pura, sin React ni red.
//
// LAS REGLAS (decisiones de Felipe, 2026-10-12):
//   · Una orden es de la campaña si llega dentro de sus fechas (su entrega estimada; sin ella, su emisión). Lo decide la base
//     (`fn_plan_compra_pedido`); aquí solo se lee.
//   · De «Comprar» se resta lo que todavía no llegó a ninguna tienda (`por_llegar`, Felipe 2026-10-13): lo que no salió en un envío, lo que va
//     en un envío sin recibir y lo que el proveedor debe reponer («Nos debe»). Lo que ya llegó está en «Hay hoy» y no se vuelve a restar. Lo
//     decide la base (`fn_plan_compra_pedido`, 20261013213000); si todavía no lo manda, `porLlegar` es null y no se resta nada, como antes.
//     Antes (2026-10-12) solo se mostraba: las órdenes no sabían cuándo llegaba la mercadería, y restarlo lo habría contado dos veces.
//   · El precio del Plan es un SUPUESTO para calcular cuánto comprar: no cambia el precio de las prendas. Si se aparta del catálogo, se avisa.

export const RPC_PEDIDO = "fn_plan_compra_pedido";

/** `porLlegar`: lo pedido que todavía no está en ninguna tienda; null si la base todavía no lo manda (entonces no se resta nada). */
export type OrdenDelPlan = { id: string; numero: number; proveedor: string; destino: string; emision: string; entrega: string | null; unidades: number; porLlegar: number | null; total: number };
export type PedidoCategoria = { unidades: number; porLlegar: number | null; soles: number; ordenes: number[] };
export type LecturaPedido = { ordenes: OrdenDelPlan[]; porCategoria: Map<string, PedidoCategoria>; total: number; unidades: number; porLlegar: number | null };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
/** `por_llegar` si la base lo manda (entero, nunca negativo); null si no viene: la base de antes de 20261013213000. */
const porLlegarDe = (v: unknown): number | null => (v === undefined || v === null ? null : Math.max(0, Math.round(num(v))));

/** Lo que devuelve `fn_plan_compra_pedido`; null si no se entiende o la base todavía no lo manda (el Plan se ve como antes). */
export function leerPedido(v: unknown): LecturaPedido | null {
  if (!esObjeto(v) || !Array.isArray(v.ordenes) || !Array.isArray(v.categorias)) return null;
  const ordenes = lista(v.ordenes).flatMap((o): OrdenDelPlan[] => {
    const id = texto(o.id);
    const emision = fechaIso(o.emision);
    return id && emision
      ? [{ id, numero: num(o.numero), proveedor: texto(o.proveedor) ?? "Proveedor", destino: texto(o.destino) ?? "Por repartir", emision, entrega: fechaIso(o.entrega), unidades: num(o.unidades), porLlegar: porLlegarDe(o.por_llegar), total: num(o.total) }]
      : [];
  });
  const porCategoria = new Map(
    lista(v.categorias).flatMap((c) => {
      const id = texto(c.c);
      return id ? [[id, { unidades: num(c.unidades), porLlegar: porLlegarDe(c.por_llegar), soles: num(c.soles), ordenes: Array.isArray(c.ordenes) ? c.ordenes.map(num).filter((n) => n > 0).sort((a, b) => a - b) : [] }] as const] : [];
    }),
  );
  // El total por llegar solo existe si la base lo manda para TODAS las órdenes: una suma a medias diría menos de lo que viene.
  const conPorLlegar = ordenes.length > 0 && ordenes.every((o) => o.porLlegar !== null);
  return {
    ordenes,
    porCategoria,
    total: Math.round(ordenes.reduce((a, o) => a + o.total, 0) * 100) / 100,
    unidades: ordenes.reduce((a, o) => a + o.unidades, 0),
    porLlegar: conPorLlegar ? ordenes.reduce((a, o) => a + (o.porLlegar ?? 0), 0) : null,
  };
}

/** Lo que se resta de «Comprar» en una categoría: lo que falta llegar; 0 si no hay nada pedido o la base todavía no lo manda. */
export const enCaminoDe = (p: PedidoCategoria | undefined): number => p?.porLlegar ?? 0;

/** «OC-000012»: como lo dice Órdenes de compra. */
export const numeroDeOrden = (n: number) => `OC-${String(n).padStart(6, "0")}`;

/**
 * Lo pedido de una categoría, en una frase corta para la fila. null si no se pidió nada. Dice cuánto falta llegar (eso ya se restó de
 * «Comprar») y, si con lo que viene se pasa de lo que conviene tener, por cuánto: solo lo que pone de más el pedido, no lo que ya sobraba
 * en la red. `cuenta` es el cálculo de la fila (su `stock` ya incluye lo que viene); null si la categoría no tiene plan.
 * Con una base que no manda `porLlegar`, como antes: lo pedido contra lo que pide comprar.
 */
export function fraseDelPedido(p: PedidoCategoria | undefined, cuenta: { objetivo: number; stock: number; comprar: number } | null): string | null {
  if (!p || p.unidades <= 0) return null;
  const n = (x: number) => x.toLocaleString("es-PE");
  const base = `${n(p.unidades)} ya ${p.unidades === 1 ? "pedida" : "pedidas"}`;
  if (p.porLlegar === null) {
    if (cuenta === null) return base;
    return p.unidades > cuenta.comprar ? `${base} · ${n(p.unidades - cuenta.comprar)} más de lo que pide el plan` : base;
  }
  const llegada = p.porLlegar === 0 ? `${base} · ya llegaron` : `${base} · ${n(p.porLlegar)} por llegar, ya descontadas`;
  if (cuenta === null || p.porLlegar === 0) return llegada;
  const deMas = Math.min(p.porLlegar, cuenta.stock - cuenta.objetivo);
  return deMas > 0 ? `${llegada} · ${n(deMas)} más de lo que pide el plan` : llegada;
}

/**
 * El monto del catálogo para volver a ponerlo en la hoja (Felipe 2026-10-12: «si quito el precio o el costo, un botón que me regrese el que hay en el
 * sistema»): el promedio de la categoría con dos decimales, o null si no hay catálogo o la caja ya dice eso.
 */
export function montoParaVolver(texto: string, catalogo: number | null): string | null {
  if (catalogo === null || !Number.isFinite(catalogo) || catalogo <= 0) return null;
  const monto = catalogo.toFixed(2);
  const escrito = Number(texto.replace(",", "."));
  return texto.trim() !== "" && Number.isFinite(escrito) && escrito.toFixed(2) === monto ? null : monto;
}

/**
 * El aviso del precio supuesto contra el catálogo (Felipe 2026-10-12: «solo supuesto, con aviso»): si se aparta 1 % o más del promedio que hoy
 * tiene la categoría en el catálogo, cuánto. null si no hay con qué comparar o casi no se aparta.
 */
export function avisoDelPrecio(supuesto: number | null, catalogo: number | null): { pct: number; texto: string } | null {
  if (supuesto === null || catalogo === null || supuesto <= 0 || catalogo <= 0) return null;
  const pct = supuesto / catalogo - 1;
  if (Math.abs(pct) < 0.01) return null;
  const veces = `${pct > 0 ? "+" : "−"}${Math.abs(Math.round(pct * 100))} %`;
  return {
    pct,
    texto: `En el catálogo hoy: S/\u00a0${catalogo.toFixed(2)} en promedio. Supones ${veces}: el Plan calcula con tu precio, pero no cambia el de las prendas. Si de verdad va a ${pct > 0 ? "subir" : "bajar"}, cámbialo en Productos.`,
  };
}
