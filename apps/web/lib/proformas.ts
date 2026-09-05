import { createClient } from "@/lib/supabase/server";
import { marcarPorVencer, type ProformaFila } from "@/lib/proformas-reglas";

export type { EstadoProforma, Proforma, ProformaFila } from "@/lib/proformas-reglas";
export { marcarPorVencer } from "@/lib/proformas-reglas";

// Lectura pura (lib/ nunca escribe — la escritura pasa por `crear_proforma` /
// `convertir_proforma_a_comprobante`, ver ADR-0007). Trae también las
// "convertida"/"anulada" recientes del mes: una proforma que ya se convirtió
// sigue siendo parte de la historia de facturación de ese mes, no desaparece.
export async function getProformasMes(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proformas")
    .select("id, sede_id, cliente_nombre, cliente_num_doc, total, estado, comprobante_id, created_at, vence_at")
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: false });

  return marcarPorVencer((data as ProformaFila[] | null) ?? []);
}
