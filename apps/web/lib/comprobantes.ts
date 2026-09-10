import { createClient } from "@/lib/supabase/server";

export type TipoComprobante = "boleta" | "factura" | "nota_credito";
export type EstadoComprobante = "pendiente" | "enviado" | "aceptado" | "rechazado" | "anulado";

/** Lo que Lucode devolvió al transmitir, tal como lo guardó
 *  `actualizar_transmision_comprobante` (es el objeto `ResultadoLucode` de
 *  `lib/lucode.ts` serializado). Todo opcional a propósito: es jsonb de un
 *  proveedor externo — si Lucode cambia una clave mañana, la pantalla se queda
 *  sin el link, no se cae (principio 9). */
export type RespuestaSunat = {
  estado?: string | null;
  hash?: string | null;
  xmlUrl?: string | null;
  cdrUrl?: string | null;
  pdfUrl?: string | null;
  mensaje?: string | null;
} | null;

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
  motivo_rechazo: string | null;
  created_at: string;
  sede_id: string;
  respuesta_sunat: RespuestaSunat;
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
    // `respuesta_sunat` trae el PDF y el CDR que Lucode devolvió. Sin pedirlo
    // acá, la ruta de transmisión los recibía y la pantalla los descartaba:
    // la clienta se quedaba sin su boleta y CAYLA sin la constancia de SUNAT.
    .select(
      "id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre, total, estado, motivo_rechazo, created_at, sede_id, respuesta_sunat"
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
