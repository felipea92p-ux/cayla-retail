import { createClient } from "@/lib/supabase/server";
import { esFuncionAusente } from "@/lib/compras-reglas";
import { leerIgvEnEspera, RPC_IGV_EN_ESPERA, type IgvEnEspera } from "@/lib/igv-en-espera-reglas";

// El aviso del IGV (ADR-0362, fase 5b, actividad 4): la lectura de `fn_igv_en_espera` para el Inicio y el Observatorio. La base decide qué
// parte ve cada quien (Notas de crédito; ver lo que debe un proveedor) y manda nula la que no le toca.

/**
 * `undefined` si la base todavía no tiene la función (la web publicada antes que la migración): el aviso no existe. Si no responde o
 * contesta algo que no se entiende, lanza (quien la llama lo convierte en «no se pudo leer», nunca en «al día»).
 */
export async function getIgvEnEspera(): Promise<IgvEnEspera | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC_IGV_EN_ESPERA as never);
  if (error) {
    if (esFuncionAusente(error)) return undefined;
    throw new Error(`No se pudo leer el IGV en espera: ${error.message}`);
  }
  const leido = leerIgvEnEspera(data);
  if (!leido) throw new Error("La base contestó algo que no se entiende sobre el IGV en espera");
  return leido;
}
