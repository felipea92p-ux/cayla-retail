import { createClient } from "@/lib/supabase/server";

/**
 * Cuántas ventas sin registrar siguen pendientes: la cifra del botón de Existencias que lleva a su lista (ADR-0330). Cuenta con
 * el MISMO alcance que esa lista (`getPorRegularizar` en /inventario/por-regularizar): el líder, todas sus sedes (`null`); los
 * demás, la suya. Un número que no coincide con la pantalla a la que lleva confunde más que no tener número (lo que le pasó al
 * botón de Apartados, tarea #7 de Existencias).
 *
 * Solo cuenta (`head: true`): la cola crece a decenas por día y Existencias no necesita traerla entera para dibujar un botón.
 * Nunca lanza: si no se puede leer devuelve `null` y el botón no se muestra; Existencias no se cae por una cifra secundaria.
 */
export async function contarPorRegularizar(ubicacionId: string | null): Promise<number | null> {
  const supabase = await createClient();
  let consulta = supabase.from("prendas_por_regularizar").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
  if (ubicacionId) consulta = consulta.eq("ubicacion_id", ubicacionId);
  const { count, error } = await consulta;
  return error ? null : (count ?? 0);
}
