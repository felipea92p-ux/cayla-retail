// Plan de campaña: lo ya pedido en órdenes de compra (ADR-0372 act. 2026-10-12 (e), ADR-0362). Lógica pura, sin React ni red.
//
// LAS REGLAS (decisiones de Felipe, 2026-10-12):
//   · Una orden es de la campaña si llega dentro de sus fechas (su entrega estimada; sin ella, su emisión). Lo decide la base
//     (`fn_plan_compra_pedido`); aquí solo se lee.
//   · Lo pedido se MUESTRA y no se resta de «Comprar»: las órdenes no saben todavía cuándo llegó la mercadería, y restarlo contaría dos veces lo
//     que ya entró al stock. Cuando Órdenes reciba contra la orden (fase 4), esto pasa a restar.
//   · El precio del Plan es un SUPUESTO para calcular cuánto comprar: no cambia el precio de las prendas. Si se aparta del catálogo, se avisa.

export const RPC_PEDIDO = "fn_plan_compra_pedido";

export type OrdenDelPlan = { id: string; numero: number; proveedor: string; destino: string; emision: string; entrega: string | null; unidades: number; total: number };
export type PedidoCategoria = { unidades: number; soles: number; ordenes: number[] };
export type LecturaPedido = { ordenes: OrdenDelPlan[]; porCategoria: Map<string, PedidoCategoria>; total: number; unidades: number };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Lo que devuelve `fn_plan_compra_pedido`; null si no se entiende o la base todavía no lo manda (el Plan se ve como antes). */
export function leerPedido(v: unknown): LecturaPedido | null {
  if (!esObjeto(v) || !Array.isArray(v.ordenes) || !Array.isArray(v.categorias)) return null;
  const ordenes = lista(v.ordenes).flatMap((o): OrdenDelPlan[] => {
    const id = texto(o.id);
    const emision = fechaIso(o.emision);
    return id && emision
      ? [{ id, numero: num(o.numero), proveedor: texto(o.proveedor) ?? "Proveedor", destino: texto(o.destino) ?? "Por repartir", emision, entrega: fechaIso(o.entrega), unidades: num(o.unidades), total: num(o.total) }]
      : [];
  });
  const porCategoria = new Map(
    lista(v.categorias).flatMap((c) => {
      const id = texto(c.c);
      return id ? [[id, { unidades: num(c.unidades), soles: num(c.soles), ordenes: Array.isArray(c.ordenes) ? c.ordenes.map(num).filter((n) => n > 0).sort((a, b) => a - b) : [] }] as const] : [];
    }),
  );
  return { ordenes, porCategoria, total: Math.round(ordenes.reduce((a, o) => a + o.total, 0) * 100) / 100, unidades: ordenes.reduce((a, o) => a + o.unidades, 0) };
}

/** «OC-000012»: como lo dice Órdenes de compra. */
export const numeroDeOrden = (n: number) => `OC-${String(n).padStart(6, "0")}`;

/**
 * Lo pedido de una categoría contra lo que el Plan dice comprar, en una frase corta para la fila o la hoja. null si no se pidió nada.
 * No resta: dice cuánto se pidió y, si pasa lo que el Plan pide, por cuánto.
 */
export function fraseDelPedido(p: PedidoCategoria | undefined, comprar: number | null): string | null {
  if (!p || p.unidades <= 0) return null;
  const base = `${p.unidades.toLocaleString("es-PE")} ya ${p.unidades === 1 ? "pedida" : "pedidas"}`;
  if (comprar === null) return base;
  if (p.unidades > comprar) return `${base} · ${(p.unidades - comprar).toLocaleString("es-PE")} más de lo que pide el plan`;
  return base;
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
    texto: `En el catálogo hoy: S/ ${catalogo.toFixed(2)} en promedio. Supones ${veces}: el Plan calcula con tu precio, pero no cambia el de las prendas. Si de verdad va a ${pct > 0 ? "subir" : "bajar"}, cámbialo en Productos.`,
  };
}
