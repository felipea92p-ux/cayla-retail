import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Stock por ubicación para la pantalla de Inventario. `retail.stock` es un
// snapshot derivado de `movimientos` (nunca se edita a mano) — acá solo se
// LEE, junto a sububicaciones como información extra y opcional (nunca
// obligatoria: las 2 tiendas del seed no tienen ninguna).
export type FilaStock = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  referencia: string;
  cantidad: number;
  sububicacion: string | null;
};

export async function getStockPorUbicacion(ubicacionId: string): Promise<FilaStock[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("stock")
      .select(
        `variante_id, cantidad,
         variante:variantes ( sku, talla, color:colores ( nombre ), producto:productos ( referencia ) )`
      )
      .eq("ubicacion_id", ubicacionId)
      .gt("cantidad", 0)
      .order("variante_id"),
    "el inventario de esta ubicación"
  );

  return filas
    .map((f) => ({
      varianteId: f.variante_id,
      sku: f.variante?.sku ?? "",
      talla: f.variante?.talla ?? null,
      color: f.variante?.color?.nombre ?? null,
      referencia: f.variante?.producto?.referencia ?? "",
      cantidad: f.cantidad,
      // Fase 1 no tiene ubicación con sububicaciones sembradas — el campo
      // queda listo para cuando exista un almacén con racks, sin tocar esta
      // función: `movimientos`/`stock` ya llevan `sububicacion_id` opcional.
      sububicacion: null as string | null,
    }))
    .sort((a, b) => a.referencia.localeCompare(b.referencia, "es") || a.sku.localeCompare(b.sku, "es"));
}
