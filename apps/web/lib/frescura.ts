import { createClient } from "@/lib/supabase/server";
import { getUbicaciones } from "@/lib/ubicaciones";
import { armarFrescuraLider, type FrescuraLider, type LlamarRpcFrescura } from "@/lib/frescura-reglas";

// La parte que LEE de Postgres para Frescura del piso (ADR-0208, paso 3 del 3c): solo dice a quién preguntar. Qué se
// pide, en qué orden, cómo falla cada bloque y qué significan los datos vive en `frescura-reglas.ts` (`armarFrescuraLider`,
// puro, probado con la salida real de la base en `frescura-contrato.test.ts`).
//
// Las dos lecturas (`retail.fn_frescura_sede` por tienda y `retail.fn_confianza_registro` para todas) exigen líder y
// operar la sede (`fn_es_lider()` + `fn_puede_operar_ubicacion`); el módulo `frescura` nace con la pantalla (paso 4).

export type { FrescuraDeSede, FrescuraLider } from "@/lib/frescura-reglas";

/** Los días de historia que lee cada sede: la ventana más larga de la vara (`VENTANAS_VARA_DIAS`). */
export const FRESCURA_DIAS_LECTURA = 120;

/**
 * Frescura del piso para el líder: sus tiendas, el registro al colgar y la referencia de CAYLA, en una vuelta. Las
 * lecturas que fallan vuelven con su aviso; ninguna tumba la pantalla.
 */
export async function getFrescuraLider(dias: number = FRESCURA_DIAS_LECTURA): Promise<FrescuraLider> {
  const tiendas = (await getUbicaciones()).filter((u) => u.tipo === "tienda");
  const supabase = await createClient();
  const rpc: LlamarRpcFrescura = (fn, args) => supabase.rpc(fn, args);
  return armarFrescuraLider(tiendas, rpc, dias);
}
