import { createClient } from "@/lib/supabase/server";
import { esFuncionAusente } from "@/lib/compras-reglas";
import { detalleMiParteDeJson, parteDeFila, type DetalleMiParte, type FilaParteDeCompra, type ParteDeCompra } from "@/lib/compras-mi-parte-reglas";

// ADR-0179 (F3-b): lecturas de «mi parte» en comprobantes que gestiona otra tienda. Solo para quien no es líder (el líder los
// ve enteros). Si la base todavía no tiene las funciones (web publicada antes de pegar 20260923180400) no se rompe nada: no hay
// partes que mostrar (principio 9).

export async function getMisPartesDeCompras(): Promise<ParteDeCompra[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mis_partes_de_compras");
  if (error) {
    if (esFuncionAusente(error)) return [];
    throw new Error(`No se pudieron leer tus partes de comprobantes: ${error.message}`);
  }
  return ((data ?? []) as FilaParteDeCompra[]).map(parteDeFila);
}

/** `null` si ninguna tienda de quien consulta tiene parte (o la base aún no tiene la función). */
export async function getMiParteDeCompra(compraId: string): Promise<DetalleMiParte | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mi_parte_de_compra", { p_compra_id: compraId });
  if (error) {
    if (esFuncionAusente(error) || error.code === "42501" || error.code === "22P02") return null;
    throw new Error(`No se pudo leer tu parte del comprobante: ${error.message}`);
  }
  return data ? detalleMiParteDeJson(data as Parameters<typeof detalleMiParteDeJson>[0]) : null;
}
