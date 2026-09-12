import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Prioridad 1 (2026-09-12) — historial mínimo de ventas, necesario para que
// la pantalla de Cambios pueda encontrar QUÉ línea de QUÉ venta se está
// cambiando. No es la pantalla de "historial de ventas" completa (esa sigue
// diferida) — solo lo suficiente para elegir una línea.
export type LineaVentaReciente = {
  ventaItemId: string;
  ventaId: string;
  creadoEn: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
  precioUnitario: number;
  yaCambiado: number;
};

export async function getLineasVentaRecientes(ubicacionId: string, limite = 30): Promise<LineaVentaReciente[]> {
  const supabase = await createClient();
  // Sin `.order()`/`.limit()` de PostgREST sobre la columna de la relación
  // embebida (venta.created_at): no vale la pena apostar a que esa sintaxis
  // se comporte igual en todas las versiones cuando el volumen acá es de
  // decenas de filas, no miles — se ordena y se recorta en JS, simple y
  // correcto siempre.
  const todas = exigir(
    await supabase
      .from("venta_items")
      .select(
        `id, venta_id, cantidad, precio_unitario,
         venta:ventas!inner ( ubicacion_id, created_at ),
         variante:variantes ( sku, talla, color:colores ( nombre ), producto:productos ( referencia ) )`
      )
      .eq("venta.ubicacion_id", ubicacionId),
    "las ventas recientes"
  );
  const filas = todas
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
    creadoEn: f.venta?.created_at ?? "",
    sku: f.variante?.sku ?? "",
    referencia: f.variante?.producto?.referencia ?? "",
    talla: f.variante?.talla ?? null,
    color: f.variante?.color?.nombre ?? null,
    cantidad: f.cantidad,
    precioUnitario: Number(f.precio_unitario),
    yaCambiado: yaCambiadoPorItem.get(f.id) ?? 0,
  }));
}
