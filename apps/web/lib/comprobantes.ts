import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { Comprobante, SerieComprobante, VentaDelDia } from "@/lib/comprobantes-reglas";

// Tipos y reglas puras (lo que un componente cliente puede necesitar como
// VALOR: constantes, `tipoDocumentoDeCliente`) viven en comprobantes-reglas.ts,
// no acá — ver ese archivo para el porqué. Este archivo es solo lectura de
// servidor (principio del repo: lib/ nunca escribe; la emisión pasa por RPC
// desde el componente cliente).
export type { TipoComprobante, EstadoComprobante, EntornoTransmision, Comprobante, SerieComprobante, ItemVentaDelDia, VentaDelDia } from "@/lib/comprobantes-reglas";

export async function getComprobantesMes(desde: string, hasta: string): Promise<Comprobante[]> {
  const supabase = await createClient();
  // Un comprobante que no se ve es un comprobante que se vuelve a emitir. Si esta
  // consulta falla y la pantalla dibuja "sin comprobantes", alguien re-emite una boleta
  // que ya existe —y eso ya es un problema con SUNAT, no de pantalla. Falla en duro.
  const res = await supabase
    .from("comprobantes")
    .select(
      "id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre, total, estado, entorno_transmision, motivo_rechazo, motivo_anulacion, motivo_no_emitido, anulacion_solicitada_at, created_at, ubicacion_id"
    )
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: false });
  return exigir(res, "los comprobantes del mes") as Comprobante[];
}

export async function getSeriesComprobantes(): Promise<SerieComprobante[]> {
  const supabase = await createClient();
  // Sin series, la pantalla avisa "esta ubicación no tiene serie configurada" y nadie
  // puede emitir. Si eso sale de una consulta fallida en vez de la realidad, se manda a
  // Felipe a configurar algo que ya estaba configurado.
  const resSeries = await supabase
    .from("series_comprobantes")
    .select("id, ubicacion_id, tipo, serie, siguiente_numero")
    .order("tipo");
  return exigir(resSeries, "las series de comprobantes") as SerieComprobante[];
}

/** Todo lo vendido hoy (hora Lima), con su comprobante si ya tiene uno. La
 *  RPC (`fn_ventas_del_dia`, security definer) ya filtra por rol: un líder ve
 *  todas las ubicaciones o una sola si se lo pides; un integrante solo ve la
 *  suya sin importar qué `ubicacionId` se mande — no hay nada que este lib
 *  necesite reforzar acá. */
export async function getVentasDeHoy(ubicacionId?: string): Promise<VentaDelDia[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: ubicacionId });
  return exigir(res, "las ventas de hoy") as unknown as VentaDelDia[];
}
