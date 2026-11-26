import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerReparto, leerRepartoAliadas, type RepartoDeAliada } from "@/lib/reparto-claure-reglas";

/**
 * Configuración ▸ Gastos con las empresas aliadas (ADR-0560, actividad 17; ADR-0683): qué parte de cada categoría de gasto es de cada aliada
 * (`fn_reparto_aliadas`, solo el líder con el módulo Configuración). Sin esa función (base sin 20261121171000), el de CLAURE con la de antes
 * (`fn_reparto_claure`), como un solo grupo. `null` si ninguna responde: la pestaña lo dice en vez de caerse (principio 9).
 */
export async function getRepartoAliadas(): Promise<RepartoDeAliada[] | null> {
  const supabase = await createClient();
  const nuevo = await supabase.rpc("fn_reparto_aliadas" as never);
  if (!nuevo.error) return leerRepartoAliadas(nuevo.data);
  const viejo = await supabase.rpc("fn_reparto_claure" as never);
  return viejo.error ? null : [{ empresaId: null, clave: "claure", nombre: "CLAURE", filas: leerReparto(viejo.data) }];
}
