// Las compras pagadas que vienen a una tienda (ADR-0636, paso 1). Lógica pura: la usan la puerta de «Recibir sin aviso» y su prueba.
//
// EL PROBLEMA: la mercadería a veces llega antes de que quien compró «mande» el envío, y la tienda la recibe sin aviso. El stock entra por
// ahí y la compra queda esperando con su envío propio: si después lo cierran contando, las prendas entran dos veces. Aquí solo se decide
// qué se le dice a quien recibe; la base (`fn_compras_pagadas_hacia`) dice qué compras hay. Sin montos: lo lee quien recibe.

type Fila = Record<string, unknown>;

export type EnvioDeLaCompra = { id: string; numero: string; estado: "en_camino" | "abierto" };
export type CompraPagada = {
  papelId: string;
  proveedorId: string | null;
  proveedor: string;
  fecha: string | null;
  prendas: number;
  /** Prendas que quien compró todavía no manda en un envío. */
  porMandar: number;
  envios: EnvioDeLaCompra[];
};

const entero = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, Math.trunc(x)) : 0;
};

/** Lo que devuelve la base, ya con su forma. Una fila que no trae papel o prendas se descarta: no se le puede decir nada cierto a la tienda. */
export function leerComprasPagadas(data: unknown): CompraPagada[] {
  if (!Array.isArray(data)) return [];
  return (data as Fila[])
    .map((r) => ({
      papelId: String(r.papel_id ?? ""),
      proveedorId: r.proveedor_id == null ? null : String(r.proveedor_id),
      proveedor: String(r.proveedor ?? "").trim() || "Proveedor por confirmar",
      fecha: r.fecha == null ? null : String(r.fecha),
      prendas: entero(r.prendas),
      porMandar: entero(r.por_mandar),
      envios: (Array.isArray(r.envios) ? (r.envios as Fila[]) : [])
        .filter((e) => e.id != null && (e.estado === "en_camino" || e.estado === "abierto"))
        .map((e) => ({ id: String(e.id), numero: String(e.numero ?? ""), estado: e.estado as EnvioDeLaCompra["estado"] })),
    }))
    .filter((c) => c.papelId !== "" && c.prendas > 0);
}

/** Con un proveedor elegido en la puerta, solo sus compras; sin elegir, todas las que vienen a la sede. */
export function comprasQueAvisar(compras: readonly CompraPagada[], proveedorId: string | null): CompraPagada[] {
  return proveedorId ? compras.filter((c) => c.proveedorId === proveedorId) : [...compras];
}

const prendas = (n: number) => (n === 1 ? "1 prenda" : `${n} prendas`);

/** Dónde está esa compra, dicho para quien recibe: en qué envío viene, o que todavía no la mandan. */
export function dondeEsta(c: CompraPagada): string {
  if (c.envios.length === 0) return "quien la compró todavía no la manda";
  const nombres = c.envios.map((e) => e.numero).filter(Boolean);
  const cual = nombres.length ? nombres.join(" y ") : "un envío";
  const falta = c.porMandar > 0 ? ` (faltan mandar ${prendas(c.porMandar)})` : "";
  return `viene en ${cual}${falta}`;
}

/** El título del aviso: cuántas compras, y de quién si es una sola. */
export function tituloDelAviso(compras: readonly CompraPagada[], sede: string): string {
  if (compras.length === 1) return `${compras[0]!.proveedor} tiene una compra pagada que viene a ${sede}`;
  return `Hay ${compras.length} compras pagadas que vienen a ${sede}`;
}

/** La línea de cada compra: «Textiles Sol · 46 prendas · viene en ENV-0016». */
export function lineaDeLaCompra(c: CompraPagada, conProveedor: boolean): string {
  return `${conProveedor ? `${c.proveedor} · ` : ""}${prendas(c.prendas)} · ${dondeEsta(c)}`;
}

export type GrupoPorEnvio = { clave: string; envioId: string | null; texto: string };

/**
 * Sin proveedor elegido pueden ser decenas de compras: se dicen por envío («ENV-0016 · 9 compras · 212 prendas»), que es lo que la tienda
 * puede abrir. Lo que todavía no mandan va junto, al final. Una compra repartida en dos envíos se cuenta en el primero.
 */
export function porEnvio(compras: readonly CompraPagada[]): GrupoPorEnvio[] {
  const grupos = new Map<string, { envioId: string | null; numero: string; compras: number; prendas: number }>();
  for (const c of compras) {
    const e = c.envios[0] ?? null;
    const clave = e ? e.id : "por-mandar";
    const g = grupos.get(clave) ?? { envioId: e?.id ?? null, numero: e?.numero ?? "", compras: 0, prendas: 0 };
    g.compras += 1;
    g.prendas += c.prendas;
    grupos.set(clave, g);
  }
  const cuantas = (n: number) => (n === 1 ? "1 compra" : `${n} compras`);
  return [...grupos.entries()]
    .sort(([a, x], [b, y]) => Number(a === "por-mandar") - Number(b === "por-mandar") || x.numero.localeCompare(y.numero))
    .map(([clave, g]) => ({
      clave,
      envioId: g.envioId,
      texto: g.envioId ? `${g.numero || "Un envío"} · ${cuantas(g.compras)} · ${prendas(g.prendas)}` : `Todavía sin mandar · ${cuantas(g.compras)} · ${prendas(g.prendas)}`,
    }));
}

/** Cuántas se listan en la hoja; las demás se cuentan en una línea. */
export const COMPRAS_A_LA_VISTA = 4;
