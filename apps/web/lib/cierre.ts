import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerPanelCierre, type PanelCierre } from "@/lib/cierre-reglas";

// Finanzas ▸ Cierre de mes (ADR-0195 F9, 20260925180000). Una sola lectura: `fn_cierre_panel` trae cada unidad del mes con
// su estado, su último cierre y sus chequeos, el consolidado, la historia del mes y los 12 meses que se pueden cerrar. Pide
// `fn_es_lider()`: el módulo no se delega. Si falla, la pantalla se dibuja igual y lo dice (principio 9).

type Lectura<T> = { datos: T; falla: string | null };

/** `mes` = «2026-08». Sin él (o con el mes en curso), la base mira el mes anterior. */
export async function getPanelCierre(mes?: string): Promise<Lectura<PanelCierre | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cierre_panel" as never, { p_mes: mes ? `${mes}-01` : null } as never);
  if (error) return { datos: null, falla: `No se pudo leer el cierre de mes: ${error.message}` };
  const panel = leerPanelCierre(data);
  return panel ? { datos: panel, falla: null } : { datos: null, falla: "La base respondió algo que la pantalla no entiende." };
}
