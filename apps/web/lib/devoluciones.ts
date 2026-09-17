import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { parsearComprobante } from "@/lib/comprobantes-reglas";
import { buscarVentaIdsPorComprobante } from "@/lib/ventas-v2";

// Devoluciones (Felipe, 2026-09-14): el backend (crear_devolucion,
// aprobar_devolucion, rechazar_devolucion) ya existía y sigue probado
// intacto — este archivo solo trae lecturas. Mismo patrón que
// `getLineasVentaRecientes` en ventas-v2.ts (el módulo de Cambios), pero
// contando "cuánto ya se devolvió" en vez de "cuánto ya se cambió".

export type LineaVentaParaDevolucion = {
  ventaItemId: string;
  ventaId: string;
  creadoEn: string;
  sku: string;
  /** Código de etiqueta (`variantes.codigo`); se muestra con `codigoPrenda` — las prendas
   *  del censo nacen sin sku y `sku` llega "". */
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
  precioUnitario: number;
  yaDevuelto: number;
};

export async function getLineasVentaParaDevolucion(
  ubicacionId: string,
  opts: { busqueda?: string; limite?: number; todasLasSedes?: boolean } = {}
): Promise<LineaVentaParaDevolucion[]> {
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

  let query = supabase
    .from("venta_items")
    .select(
      `id, venta_id, cantidad, precio_unitario,
       venta:ventas!inner ( ubicacion_id, created_at ),
       variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) )`
    );
  // "Todas las sedes" solo tiene sentido junto a una búsqueda puntual — el
  // listado de ventas recientes sin buscar sigue siendo el de esta sede.
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
  // Solo cuenta contra devoluciones que no fueron rechazadas — mismo filtro
  // exacto que usa crear_devolucion() para calcular v_ya_devuelto, para que
  // la pantalla nunca muestre "disponible" algo que la base va a rechazar.
  const devolucionesRes =
    ids.length === 0
      ? []
      : exigir(
          await supabase
            .from("devolucion_items")
            .select("venta_item_id, cantidad, devolucion:devoluciones!inner ( estado )")
            .in("venta_item_id", ids)
            .neq("devolucion.estado", "rechazada"),
          "las devoluciones ya hechas"
        );
  const yaDevueltoPorItem = new Map<string, number>();
  devolucionesRes.forEach((d) =>
    yaDevueltoPorItem.set(d.venta_item_id, (yaDevueltoPorItem.get(d.venta_item_id) ?? 0) + d.cantidad)
  );

  return filas.map((f) => ({
    ventaItemId: f.id,
    ventaId: f.venta_id,
    creadoEn: f.venta?.created_at ?? "",
    sku: f.variante?.sku ?? "",
    codigo: f.variante?.codigo ?? null,
    referencia: f.variante?.producto?.referencia ?? "",
    talla: f.variante?.talla?.valor ?? null,
    color: f.variante?.color?.nombre ?? null,
    cantidad: f.cantidad,
    precioUnitario: Number(f.precio_unitario),
    yaDevuelto: yaDevueltoPorItem.get(f.id) ?? 0,
  }));
}

export type ItemDevolucionPendiente = {
  sku: string;
  /** Mismo criterio que en `LineaVentaParaDevolucion`. */
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
  condicion: string;
};

export type DevolucionPendiente = {
  id: string;
  ventaId: string;
  motivo: string;
  creadoEn: string;
  solicitadoPorNombre: string;
  items: ItemDevolucionPendiente[];
};

export async function getDevolucionesPendientes(ubicacionId: string): Promise<DevolucionPendiente[]> {
  const supabase = await createClient();
  const devoluciones = exigir(
    await supabase
      .from("devoluciones")
      .select("id, venta_id, motivo, created_at, solicitado_por")
      .eq("ubicacion_id", ubicacionId)
      .eq("estado", "pendiente")
      .order("created_at", { ascending: false }),
    "las devoluciones pendientes"
  );
  if (devoluciones.length === 0) return [];

  const ids = devoluciones.map((d) => d.id);
  const [itemsRes, nombresRes] = await Promise.all([
    supabase
      .from("devolucion_items")
      .select(
        `devolucion_id, cantidad, condicion,
         venta_item:venta_items ( variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) ) )`
      )
      .in("devolucion_id", ids),
    supabase.rpc("fn_nombres_personas", {
      p_ids: [...new Set(devoluciones.map((d) => d.solicitado_por).filter((id): id is string => !!id))],
    }),
  ]);
  const items = exigir(itemsRes, "los ítems de las devoluciones pendientes");
  const nombres = exigir(nombresRes, "los nombres de quienes solicitaron");
  const nombrePorId = new Map(nombres.map((n) => [n.id, n.nombre]));

  return devoluciones.map((d) => ({
    id: d.id,
    ventaId: d.venta_id,
    motivo: d.motivo,
    creadoEn: d.created_at,
    solicitadoPorNombre: (d.solicitado_por && nombrePorId.get(d.solicitado_por)) || "—",
    items: items
      .filter((i) => i.devolucion_id === d.id)
      .map((i) => ({
        sku: i.venta_item?.variante?.sku ?? "",
        codigo: i.venta_item?.variante?.codigo ?? null,
        referencia: i.venta_item?.variante?.producto?.referencia ?? "",
        talla: i.venta_item?.variante?.talla?.valor ?? null,
        color: i.venta_item?.variante?.color?.nombre ?? null,
        cantidad: i.cantidad,
        condicion: i.condicion,
      })),
  }));
}
