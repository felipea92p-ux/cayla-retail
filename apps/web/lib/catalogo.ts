import { createClient } from "@/lib/supabase/server";
import { mapaSedes } from "@/lib/sedes";
import type { PersonaActual } from "@/lib/persona";

export type VarianteConStock = {
  varianteId: string;
  productoId: string;
  sku: string;
  referencia: string;
  categoria: string | null;
  familia: string | null;
  marca: string | null;
  estado: string | null;
  fotoUrl: string | null; // una foto por modelo (productos.foto_url)
  talla: string | null;
  color: string | null;
  stockMinimo: number;
  costo: number | null; // null salvo Líder — el costo/margen es información sensible
  precio: number | null; // visible para todas: la Encargada lo necesita para vender
  stockPorSede: Record<string, number>; // codigo de sede -> cantidad
  minimoPorSede: Record<string, number>; // solo sedes con mínimo propio definido
  stockTotal: number;
}

export async function getCatalogoConStock(persona: PersonaActual): Promise<VarianteConStock[]> {
  const supabase = await createClient();

  const { data: variantes, error: errVariantes } = await supabase
    .from("variantes")
    .select(
      "id, sku, talla, color, costo, precio, stock_minimo, productos(id, referencia, marca, estado, foto_url, categorias(nombre, familia))"
    )
    .order("sku");

  if (errVariantes || !variantes) return [];

  const [{ data: stockRows }, sedes] = await Promise.all([
    supabase.from("stock").select("variante_id, cantidad, stock_minimo, sede_id"),
    mapaSedes(),
  ]);

  const stockPorVariante = new Map<string, Record<string, number>>();
  const minimoPorVariante = new Map<string, Record<string, number>>();
  (stockRows ?? []).forEach((r) => {
    const codigo = sedes.get(r.sede_id)?.codigo;
    if (!codigo) return;
    const actual = stockPorVariante.get(r.variante_id) ?? {};
    actual[codigo] = r.cantidad;
    stockPorVariante.set(r.variante_id, actual);
    if (r.stock_minimo != null) {
      const minimos = minimoPorVariante.get(r.variante_id) ?? {};
      minimos[codigo] = r.stock_minimo;
      minimoPorVariante.set(r.variante_id, minimos);
    }
  });

  const verCostos = persona.rol === "lider";

  return variantes
    .filter((v) => {
      const producto = Array.isArray(v.productos) ? v.productos[0] : v.productos;
      return producto?.estado !== "descontinuada";
    })
    .map((v) => {
      const producto = Array.isArray(v.productos) ? v.productos[0] : v.productos;
      const categoriaRow = producto ? (Array.isArray(producto.categorias) ? producto.categorias[0] : producto.categorias) : null;
      const porSede = stockPorVariante.get(v.id) ?? {};
      const stockTotal = Object.values(porSede).reduce((a, b) => a + b, 0);
      return {
        varianteId: v.id,
        productoId: producto?.id ?? "",
        sku: v.sku,
        referencia: producto?.referencia ?? "(sin referencia)",
        categoria: categoriaRow?.nombre ?? null,
        familia: categoriaRow?.familia ?? null,
        marca: producto?.marca ?? null,
        estado: producto?.estado ?? null,
        fotoUrl: producto?.foto_url ?? null,
        talla: v.talla,
        color: v.color,
        stockMinimo: v.stock_minimo,
        costo: verCostos ? v.costo : null,
        precio: v.precio,
        stockPorSede: porSede,
        minimoPorSede: minimoPorVariante.get(v.id) ?? {},
        stockTotal,
      };
    });
}
