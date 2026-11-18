import { createClient } from "@/lib/supabase/server";
import type { CanalVenta } from "@/lib/canales-venta-reglas";

// Los canales de venta que opera la cuenta de esta sesión (ADR-0607): los activos de `canales_venta` que su rol opera
// (`fn_canales_de_la_cuenta`; el Líder, todos). Tolerado: si la base todavía no tiene la migración, solo existe la tienda y la
// pantalla queda como siempre. La base es la que decide de verdad (`separar_prendas_online`, `buscar_separaciones`).
export async function getCanalesDeLaCuenta(): Promise<CanalVenta[]> {
  const supabase = await createClient();
  const [catalogo, mios] = await Promise.all([supabase.rpc("fn_canales_venta"), supabase.rpc("fn_canales_de_la_cuenta")]);
  if (catalogo.error || mios.error) return [{ clave: "tienda", nombre: "Tienda", esFisico: true }];
  const operables = new Set((mios.data as string[] | null) ?? []);
  return (catalogo.data ?? []).filter((c) => operables.has(c.clave)).map((c) => ({ clave: c.clave, nombre: c.nombre, esFisico: c.es_fisico }));
}
