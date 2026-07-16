import { createClient } from "@/lib/supabase/server";
import type { PersonaActual } from "@/lib/persona";

export type VarianteConStock = {
  varianteId: string;
  productoId: string;
  sku: string;
  referencia: string;
  categoria: string | null;
  talla: string | null;
  color: string | null;
  stockMinimo: number;
  costo: number | null; // null si el rol no debe verlo
  precio: number | null;
  stockPorSede: Record<string, number>; // codigo de sede -> cantidad
  stockTotal: number;
}

export async function getCatalogoConStock(persona: PersonaActual): Promise<VarianteConStock[]> {
  const supabase = await createClient();

  const { data: variantes, error: errVariantes } = await supabase
    .from("variantes")
    .select("id, sku, talla, color, costo, precio, stock_minimo, productos(id, referencia, categoria, estado)")
    .order("sku");

  if (errVariantes || !variantes) return [];

  const { data: stockRows } = await supabase
    .from("stock")
    .select("variante_id, cantidad, sedes(codigo)");

  const stockPorVariante = new Map<string, Record<string, number>>();
  (stockRows ?? []).forEach((r) => {
    const sede = Array.isArray(r.sedes) ? r.sedes[0] : r.sedes;
    if (!sede) return;
    const actual = stockPorVariante.get(r.variante_id) ?? {};
    actual[sede.codigo] = r.cantidad;
    stockPorVariante.set(r.variante_id, actual);
  });

  const verCostos = persona.rol === "lider";

  return variantes
    .filter((v) => {
      const producto = Array.isArray(v.productos) ? v.productos[0] : v.productos;
      return producto?.estado !== "descontinuada";
    })
    .map((v) => {
      const producto = Array.isArray(v.productos) ? v.productos[0] : v.productos;
      const porSede = stockPorVariante.get(v.id) ?? {};
      const stockTotal = Object.values(porSede).reduce((a, b) => a + b, 0);
      return {
        varianteId: v.id,
        productoId: producto?.id ?? "",
        sku: v.sku,
        referencia: producto?.referencia ?? "(sin referencia)",
        categoria: producto?.categoria ?? null,
        talla: v.talla,
        color: v.color,
        stockMinimo: v.stock_minimo,
        costo: verCostos ? v.costo : null,
        precio: verCostos ? v.precio : null,
        stockPorSede: porSede,
        stockTotal,
      };
    });
}
