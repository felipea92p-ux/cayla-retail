import { createClient } from "@/lib/supabase/server";
import type { EmpresasAqui } from "@/lib/empresas-de-sede-reglas";

/**
 * Las empresas que se ven aquí (ADR-0505): las que operan en la sede elegida (`fn_empresas_de_sede`, la misma regla del alta,
 * de la tienda online y del disparador de `movimientos`) o, sin sede (vista CAYLA Global), todas (`fn_empresas`). `null` si la
 * base no respondió o todavía no tiene empresas: la pantalla muestra todo, como antes (se degrada, nunca esconde de más).
 */
export async function getEmpresasAqui(sedeId: string | null): Promise<EmpresasAqui> {
  const supabase = await createClient();
  const { data, error } = await (sedeId ? supabase.rpc("fn_empresas_de_sede", { p_sede_id: sedeId }) : supabase.rpc("fn_empresas"));
  if (error || !data || data.length === 0) return null;
  return data.map((e) => ({ id: e.id, clave: e.clave, nombre: e.nombre }));
}
