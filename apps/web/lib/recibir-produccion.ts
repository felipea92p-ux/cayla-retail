import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import type { UnidadInsumo } from "@/lib/insumos-reglas";
import type { LineaPorRecibir } from "@/lib/recibir-produccion-reglas";

// Líneas por recibir del Taller (ADR-0133, F4d). Solo lectura: se recibe con `recibir_comprobante_produccion`. Lo que devuelve
// `fn_lineas_comprobantes_produccion` son CANTIDADES —facturado, recibido, cerrado, pendiente—; ningún importe: quien recibe en el
// Taller no ve dinero (D-G). La puede leer el líder y quien trabaja en el Taller.

export async function getLineasPorRecibir(tallerId: string): Promise<LineaPorRecibir[]> {
  const supabase = await createClient();
  // PostgREST corta también las RPC en 1.000 filas sin avisar: por páginas, en serie (casi siempre cabe en una), con
  // el orden de la función más `item_id`, que es único (ADR-0192).
  const filas = exigir(
    await leerTodas(
      (desde, hasta) =>
        supabase
          .rpc("fn_lineas_comprobantes_produccion", { p_ubicacion_id: tallerId })
          .order("fecha_emision")
          .order("serie")
          .order("numero")
          .order("insumo")
          .order("item_id")
          .range(desde, hasta),
      { enParalelo: 1 },
    ),
    "las líneas por recibir",
  );
  return filas.map((f) => ({
    comprobanteId: f.comprobante_id,
    proveedor: f.proveedor,
    tipo: f.tipo,
    serie: f.serie,
    numero: f.numero,
    fechaEmision: f.fecha_emision,
    itemId: f.item_id,
    insumoId: f.insumo_id,
    insumo: f.insumo,
    unidad: f.unidad as UnidadInsumo,
    facturado: Number(f.facturado),
    recibido: Number(f.recibido),
    cerrado: Number(f.cerrado),
    pendiente: Number(f.pendiente),
  }));
}
