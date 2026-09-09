import { createClient } from "@/lib/supabase/server";

export type TipoComprobante = "boleta" | "factura" | "nota_credito";
export type EstadoComprobante = "pendiente" | "enviado" | "aceptado" | "rechazado" | "anulado";
/** `null` = todavía no se transmitió. `sandbox` = se transmitió, pero a la
 *  plataforma de pruebas: SUNAT no lo vio y el comprobante NO es válido. */
export type EntornoTransmision = "sandbox" | "produccion" | null;

export type Comprobante = {
  id: string;
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  cliente_tipo_doc: "dni" | "ruc" | "sin_documento";
  cliente_num_doc: string | null;
  cliente_nombre: string | null;
  total: number;
  estado: EstadoComprobante;
  entorno_transmision: EntornoTransmision;
  motivo_rechazo: string | null;
  created_at: string;
  sede_id: string;
};

export type SerieComprobante = {
  id: string;
  sede_id: string;
  tipo: TipoComprobante;
  serie: string;
  siguiente_numero: number;
};

// Lectura pura (principio de arquitectura del repo: lib/ nunca escribe).
// La emisión pasa por la RPC `emitir_comprobante` desde el componente cliente.
export async function getComprobantesMes(desde: string, hasta: string): Promise<Comprobante[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comprobantes")
    .select(
      "id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre, total, estado, entorno_transmision, motivo_rechazo, created_at, sede_id"
    )
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: false });
  return (data as Comprobante[] | null) ?? [];
}

export async function getSeriesComprobantes(): Promise<SerieComprobante[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("series_comprobantes")
    .select("id, sede_id, tipo, serie, siguiente_numero")
    .order("tipo");
  return (data as SerieComprobante[] | null) ?? [];
}
