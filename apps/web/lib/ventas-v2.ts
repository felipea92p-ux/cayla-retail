import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { parsearComprobante } from "@/lib/comprobantes-reglas";

// Prioridad 1 (2026-09-12) — historial mínimo de ventas, necesario para que
// la pantalla de Cambios pueda encontrar QUÉ línea de QUÉ venta se está
// cambiando. No es la pantalla de "historial de ventas" completa (esa sigue
// diferida) — solo lo suficiente para elegir una línea.

/**
 * Encuentra la(s) venta(s) de una boleta o factura escrita a mano (2026-09-15) — lo que
 * Devoluciones y Cambios necesitan cuando la venta ya no está entre las últimas 30 de la
 * sede. Sin `serie`, el número puede calzar con boleta, factura o nota — cada tipo tiene
 * su propio correlativo (`series_comprobantes`, único por `ubicacion_id, tipo`), así que
 * se devuelven TODAS las que calcen: rara vez es más de una, y si lo es, la Encargada ve
 * las prendas de cada una y elige.
 *
 * `todasLasSedes` (2026-09-17): el candado de negocio no existe — `registrar_cambio` y
 * `crear_devolucion` nunca comparan contra la sede de la venta original, solo contra la
 * sede DONDE se está parada la Encargada. El filtro de acá era el único bloqueo real,
 * sin que nadie lo hubiera decidido como regla: una clienta que compró en Lima no
 * aparecía al buscar su boleta desde Trujillo. Opt-in, no default: la mayoría de
 * búsquedas sí son de la sede propia, y ampliar sin pedirlo mostraría boletas de otras
 * ventas ambiguas (mismo número, sede distinta) sin que la Encargada lo pidiera.
 */
export async function buscarVentaIdsPorComprobante(
  ubicacionId: string,
  serie: string | null,
  numero: number,
  todasLasSedes = false
): Promise<string[]> {
  const supabase = await createClient();
  let query = supabase.from("comprobantes").select("venta_id").eq("numero", numero).not("venta_id", "is", null);
  if (!todasLasSedes) query = query.eq("ubicacion_id", ubicacionId);
  if (serie) query = query.eq("serie", serie);
  const filas = exigir(await query, "el comprobante buscado");
  return [...new Set(filas.map((f) => f.venta_id as string))];
}

export type LineaVentaReciente = {
  ventaItemId: string;
  ventaId: string;
  /** La identidad de la prenda vendida — nunca el sku: las prendas del censo nacen sin
   *  él y "" calzaba con cualquier otra sin sku (ver `cambios-reglas.ts`). */
  varianteId: string;
  creadoEn: string;
  sku: string;
  /** Código de etiqueta (`variantes.codigo`); se muestra con `codigoPrenda`. */
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
  precioUnitario: number;
  yaCambiado: number;
};

export async function getLineasVentaRecientes(
  ubicacionId: string,
  opts: { busqueda?: string; limite?: number; todasLasSedes?: boolean } = {}
): Promise<LineaVentaReciente[]> {
  const { busqueda, limite = 30, todasLasSedes = false } = opts;
  const supabase = await createClient();

  // Con búsqueda: no importa la fecha, solo la(s) venta(s) de esa boleta — puede ser de
  // hace meses. Sin ella: las últimas `limite`, el comportamiento de siempre.
  let ventaIdsBuscados: string[] | null = null;
  if (busqueda && busqueda.trim()) {
    const { serie, numero } = parsearComprobante(busqueda);
    if (numero === null) return [];
    ventaIdsBuscados = await buscarVentaIdsPorComprobante(ubicacionId, serie, numero, todasLasSedes);
    if (ventaIdsBuscados.length === 0) return [];
  }

  // Sin `.order()`/`.limit()` de PostgREST sobre la columna de la relación
  // embebida (venta.created_at): no vale la pena apostar a que esa sintaxis
  // se comporte igual en todas las versiones cuando el volumen acá es de
  // decenas de filas, no miles — se ordena y se recorta en JS, simple y
  // correcto siempre.
  let query = supabase
    .from("venta_items")
    .select(
      `id, venta_id, variante_id, cantidad, precio_unitario,
       venta:ventas!inner ( ubicacion_id, created_at ),
       variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) )`
    );
  // "Todas las sedes" solo tiene sentido junto a una búsqueda puntual (ver
  // buscarVentaIdsPorComprobante) — el listado de "ventas recientes" sin
  // buscar sigue siendo siempre el de esta sede, nunca de todas.
  if (!(ventaIdsBuscados && todasLasSedes)) query = query.eq("venta.ubicacion_id", ubicacionId);
  if (ventaIdsBuscados) query = query.in("venta_id", ventaIdsBuscados);
  const todas = exigir(await query, "las ventas recientes");
  const filas = ventaIdsBuscados
    ? todas.slice().sort((a, b) => (b.venta?.created_at ?? "").localeCompare(a.venta?.created_at ?? ""))
    : todas
        .slice()
        .sort((a, b) => (b.venta?.created_at ?? "").localeCompare(a.venta?.created_at ?? ""))
        .slice(0, limite);

  const ids = filas.map((f) => f.id);
  const cambiosRes =
    ids.length === 0
      ? []
      : exigir(
          await supabase.from("cambios").select("venta_item_id, cantidad").in("venta_item_id", ids),
          "los cambios ya hechos"
        );
  const yaCambiadoPorItem = new Map<string, number>();
  cambiosRes.forEach((c) => yaCambiadoPorItem.set(c.venta_item_id, (yaCambiadoPorItem.get(c.venta_item_id) ?? 0) + c.cantidad));

  return filas.map((f) => ({
    ventaItemId: f.id,
    ventaId: f.venta_id,
    varianteId: f.variante_id,
    creadoEn: f.venta?.created_at ?? "",
    sku: f.variante?.sku ?? "",
    codigo: f.variante?.codigo ?? null,
    referencia: f.variante?.producto?.referencia ?? "",
    talla: f.variante?.talla?.valor ?? null,
    color: f.variante?.color?.nombre ?? null,
    cantidad: f.cantidad,
    precioUnitario: Number(f.precio_unitario),
    yaCambiado: yaCambiadoPorItem.get(f.id) ?? 0,
  }));
}
