import { createClient } from "@/lib/supabase/server";

export type EstadoProforma = "vigente" | "convertida" | "vencida" | "anulada";

export type Proforma = {
  id: string;
  sede_id: string;
  cliente_nombre: string | null;
  cliente_num_doc: string | null;
  total: number;
  estado: EstadoProforma;
  comprobante_id: string | null;
  created_at: string;
  vence_at: string | null;
};

// Lectura pura (lib/ nunca escribe — la escritura pasa por `crear_proforma` /
// `convertir_proforma_a_comprobante`, ver ADR-0007). Trae también las
// "convertida"/"anulada" recientes del mes: una proforma que ya se convirtió
// sigue siendo parte de la historia de facturación de ese mes, no desaparece.
export async function getProformasMes(desde: string, hasta: string): Promise<Proforma[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proformas")
    .select("id, sede_id, cliente_nombre, cliente_num_doc, total, estado, comprobante_id, created_at, vence_at")
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: false });
  return (data as Proforma[] | null) ?? [];
}
