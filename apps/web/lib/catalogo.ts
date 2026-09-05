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
  stockPorSede: Record<string, number>; // codigo de sede -> cantidad EN PISO (vendible ahora)
  minimoPorSede: Record<string, number>; // solo sedes con mínimo propio definido
  stockTotal: number; // suma de stockPorSede — lo que se puede vender hoy
  stockAlmacenPorSede: Record<string, number>; // recibido pero sin bajar a piso todavía
  stockAlmacenTotal: number;
  ultimaVenta: string | null; // más reciente entre sedes, null si nunca se vendió
  creadaEn: string; // variantes.created_at — usado por inteligencia.ts para "días sin venta" si nunca vendió
}

export async function getCatalogoConStock(persona: PersonaActual): Promise<VarianteConStock[]> {
  const supabase = await createClient();

  // Las 3 consultas son independientes entre sí (el cruce entre variantes/stock/sedes
  // ocurre después, en JS, por variante_id/sede_id) — en paralelo en vez de esperar a
  // `variantes` sola antes de arrancar las otras dos.
  const [{ data: variantes, error: errVariantes }, { data: stockRows }, { data: stockAlmacenRows }, sedes] = await Promise.all([
    supabase
      .from("variantes")
      .select(
        "id, sku, talla, color, costo, precio, stock_minimo, created_at, productos(id, referencia, marca, estado, foto_url, categorias(nombre, familia))"
      )
      .order("sku"),
    supabase.from("stock").select("variante_id, cantidad, stock_minimo, sede_id, ultima_venta"),
    // Lo recibido que todavía no se bajó a piso — bolsa aparte desde el
    // almacén interno (0011_produccion_material_etapas en adelante). Sin
    // esto, "Recibir mercadería" mete unidades reales que no se ven en
    // ningún lado del Catálogo hasta que alguien las baja a tienda.
    supabase.from("stock_almacen").select("variante_id, cantidad, sede_id"),
    mapaSedes(),
  ]);

  if (errVariantes || !variantes) return [];

  const stockPorVariante = new Map<string, Record<string, number>>();
  const minimoPorVariante = new Map<string, Record<string, number>>();
  // Última venta por variante = la más reciente ENTRE SEDES. Sellada solo con
  // motivo='venta' en fn_aplicar_movimiento (migración 0011) — no se "rejuvenece"
  // con bajadas de almacén a tienda, que son salida pero no venta.
  const ultimaVentaPorVariante = new Map<string, string>();
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
    if (r.ultima_venta) {
      const actualVenta = ultimaVentaPorVariante.get(r.variante_id);
      if (!actualVenta || r.ultima_venta > actualVenta) ultimaVentaPorVariante.set(r.variante_id, r.ultima_venta);
    }
  });

  const stockAlmacenPorVariante = new Map<string, Record<string, number>>();
  (stockAlmacenRows ?? []).forEach((r) => {
    const codigo = sedes.get(r.sede_id)?.codigo;
    if (!codigo) return;
    const actual = stockAlmacenPorVariante.get(r.variante_id) ?? {};
    actual[codigo] = r.cantidad;
    stockAlmacenPorVariante.set(r.variante_id, actual);
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
      const porSedeAlmacen = stockAlmacenPorVariante.get(v.id) ?? {};
      const stockAlmacenTotal = Object.values(porSedeAlmacen).reduce((a, b) => a + b, 0);
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
        stockAlmacenPorSede: porSedeAlmacen,
        stockAlmacenTotal,
        ultimaVenta: ultimaVentaPorVariante.get(v.id) ?? null,
        creadaEn: v.created_at,
      };
    });
}
