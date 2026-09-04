import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

export type Sede = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  tienda_asociada_id: string | null;
  activo: boolean;
};

/**
 * Todas las sedes (~5 filas, casi no cambian), UNA vez por request. Antes se
 * pedían por separado en persona.ts (x2), el layout, cada página y mapaSedes()
 * — hasta 4 viajes redundantes a la misma tabla en una sola navegación. Mismo
 * patrón que requirePersonaActual() en persona.ts (cache() de React). Trae
 * todas las columnas de la vista (no solo id/codigo/tipo) para que cualquier
 * página pueda filtrar en JS sin volver a pedirle la tabla a Supabase — arreglo
 * de performance.
 */
export const getSedes = cache(async (): Promise<Sede[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sedes")
    .select("id, codigo, nombre, tipo, tienda_asociada_id, activo")
    .order("codigo");
  return data ?? [];
});

export async function mapaSedes(): Promise<Map<string, { codigo: string; tipo: string }>> {
  const sedes = await getSedes();
  return new Map(sedes.map((s) => [s.id, { codigo: s.codigo, tipo: s.tipo }]));
}
