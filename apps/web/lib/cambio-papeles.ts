// Los papeles de un cambio recién guardado (ADR-0672), para la hoja «Cambio registrado»: la boleta nueva lista para imprimir y la
// línea que la enlaza con la compra y su nota de crédito. Lo lee el navegador justo después de guardar. Si algo no se puede leer,
// la hoja sigue con el resumen del cambio de siempre: el papel también está en Comprobantes.

import { createClient } from "@/lib/supabase/client";
import { reciboDeCambio, textoReferenciaCambio, type BoletaDelCambio, type NombrePrenda } from "@/lib/recibo-cambio-reglas";
import type { ReciboVenta } from "@/lib/recibo-reglas";

export type PapelesDelCambio = { recibo: ReciboVenta; referencia: string };

export async function leerPapelesDelCambio(e: {
  cambioId: string;
  sede: string;
  atendio: string | null;
  /** «Boleta B001-000012»: la compra que se cambió, para el pie del papel. */
  compra: string | null;
}): Promise<PapelesDelCambio | null> {
  const sb = createClient();
  const { data: papeles, error } = await sb
    .from("comprobantes")
    .select("tipo, serie, numero, created_at, cliente_tipo_doc, cliente_num_doc, cliente_nombre, items")
    .eq("cambio_id" as never, e.cambioId as never);
  if (error || !papeles) return null;
  const boleta = papeles.find((p) => p.tipo === "boleta" || p.tipo === "factura") as BoletaDelCambio | undefined;
  if (!boleta) return null; // Sin boleta del ERP en la compra: el cambio no emitió papeles (ADR-0672, decisión 2).
  const nota = papeles.find((p) => p.tipo === "nota_credito") ?? null;

  const ids = Array.isArray(boleta.items)
    ? (boleta.items as { variante_id?: unknown }[]).flatMap((it) => (typeof it?.variante_id === "string" ? [it.variante_id] : []))
    : [];
  const { data: variantes, error: errVariantes } = await sb.from("variantes").select("id, sku, codigo, producto:productos(referencia)").in("id", ids);
  if (errVariantes) return null;
  const nombres = new Map<string, NombrePrenda>();
  for (const v of variantes ?? []) {
    const referencia = (v.producto as { referencia?: string } | null)?.referencia;
    if (referencia) nombres.set(v.id, { referencia, codigo: v.codigo ?? v.sku ?? null });
  }

  const recibo = reciboDeCambio(boleta, nombres, e.sede, e.atendio);
  return recibo ? { recibo, referencia: textoReferenciaCambio(e.compra, nota) } : null;
}
