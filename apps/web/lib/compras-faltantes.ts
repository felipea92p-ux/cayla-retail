import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Lectura del libro de faltantes (D2, ADR-0106): las notas de crédito del proveedor y los cierres
// de línea de UN comprobante. Son tablas de solo lectura (RLS) y append-only: se agregan filas,
// nunca se editan ni se borran. Las escrituras pasan por `cerrar_linea_compra` y
// `registrar_nota_credito_compra` desde los componentes cliente.

export type MotivoCierre = "no_llego" | "danada" | "error_proveedor";

export const ETIQUETA_MOTIVO_CIERRE: Record<MotivoCierre, string> = {
  no_llego: "No llegaron",
  danada: "Llegaron dañadas",
  error_proveedor: "Error del proveedor",
};

export type NotaCreditoCompra = {
  id: string;
  serieNumero: string;
  fecha: string;
  monto: number;
  igv: number;
  motivo: string;
  nota: string | null;
  cierreId: string | null;
};

export type CierreLinea = {
  id: string;
  compraItemId: string;
  cantidad: number;
  motivo: string;
  nota: string | null;
  creadoEn: string;
};

export async function getNotasCreditoCompra(compraId: string): Promise<NotaCreditoCompra[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.from("compra_notas_credito").select("id, serie_numero, fecha, monto, igv, motivo, nota, cierre_id").eq("compra_id", compraId).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
    "las notas de crédito del comprobante"
  );
  return filas.map((f) => ({ id: f.id, serieNumero: f.serie_numero, fecha: f.fecha, monto: Number(f.monto), igv: Number(f.igv), motivo: f.motivo, nota: f.nota, cierreId: f.cierre_id }));
}

/** Cierres de las líneas de un comprobante (la relación con la compra pasa por `compra_items`). */
export async function getCierresCompra(compraId: string): Promise<CierreLinea[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("compra_item_cierres")
      .select("id, compra_item_id, cantidad, motivo, nota, created_at, compra_item:compra_items!inner ( compra_id )")
      .eq("compra_item.compra_id", compraId)
      .order("created_at", { ascending: false }),
    "los cierres por faltante del comprobante"
  );
  return filas.map((f) => ({ id: f.id, compraItemId: f.compra_item_id, cantidad: f.cantidad, motivo: f.motivo, nota: f.nota, creadoEn: f.created_at }));
}
