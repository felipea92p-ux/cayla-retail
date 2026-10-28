import { createClient } from "@/lib/supabase/server";
import type { EmpresasAqui } from "@/lib/empresas-de-sede-reglas";

/**
 * Las empresas que se ven aquí (ADR-0505): las que operan en la sede elegida (`fn_empresas_de_sede`, la misma regla del alta,
 * de la tienda online y del disparador de `movimientos`) o, sin sede (vista CAYLA Global), todas (`fn_empresas`). `null` si la
 * base no respondió o todavía no tiene empresas: la pantalla muestra todo, como antes (se degrada, nunca esconde de más).
 */
export async function getEmpresasAqui(sedeId: string | null): Promise<EmpresasAqui> {
  const supabase = await createClient();
  const [{ data, error }, marcas] = await Promise.all([
    sedeId ? supabase.rpc("fn_empresas_de_sede", { p_sede_id: sedeId }) : supabase.rpc("fn_empresas"),
    getMarcasDeEmpresas(),
  ]);
  if (error || !data || data.length === 0) return null;
  return data.map((e) => ({ id: e.id, clave: e.clave, nombre: e.nombre, marcaId: marcas?.get(e.id) ?? null }));
}

/**
 * La marca de cada empresa (ADR-0532: la marca CAYLA es de CAYLA), con la que en Lima se decide de quién es una prenda
 * (`empresaPorMarca`). `null` si la base aún no la tiene o no respondió: sin ella, la regla no se aplica y manda el dato de la prenda.
 */
export async function getMarcasDeEmpresas(): Promise<Map<string, string | null> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_marcas_de_empresas");
  if (error || !data) return null;
  return new Map(data.map((f) => [f.empresa_id, f.marca_id]));
}
