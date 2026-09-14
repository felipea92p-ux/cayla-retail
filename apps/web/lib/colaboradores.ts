import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Lectura pura (principio del repo: lib/ nunca escribe). Agregar/quitar
// pasa por las RPC directo desde el componente cliente
// (agregar_colaborador / quitar_colaborador, 0013_colaboradores_autorizados.sql).
export type Colaborador = {
  persona_id: string;
  nombre: string;
  correo: string;
  sede: string | null;
  rol: "lider" | "colaborador";
  ubicacion_asignada: string | null;
  agregado_en: string;
};

export type DynamicDisponible = {
  persona_id: string;
  nombre: string;
  correo: string;
  sede: string | null;
};

export async function getColaboradores(): Promise<Colaborador[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_colaboradores");
  return exigir(res, "los colaboradores") as unknown as Colaborador[];
}

export async function getDynamicDisponibles(): Promise<DynamicDisponible[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_dynamic_disponibles");
  return exigir(res, "las cuentas de Dynamic disponibles") as unknown as DynamicDisponible[];
}
