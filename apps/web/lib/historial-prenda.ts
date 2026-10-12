import { createClient } from "@/lib/supabase/server";
import { armarEventos, type FilaHistorial, type LecturaHistorial } from "@/lib/historial-prenda-reglas";

// El historial de una prenda para la página /productos/[id]/historial (ADR-0354). La misma lectura que hace la vista rápida desde el
// navegador (`useHistorialPrenda`), aquí en el servidor. Tolerante (principio 9): si la base no responde, la página lo dice; no se cae.

export type PrendaDelHistorial = { id: string; referencia: string; codigo: string | null; categoria: string | null; variantes: number };

/** Lo mínimo para el encabezado y para decir «en las 5 variantes». `null` si la prenda no existe o no se ve. */
export async function getPrendaDelHistorial(productoId: string): Promise<PrendaDelHistorial | null> {
  const supabase = await createClient();
  const [{ data: filas, error }, { count }] = await Promise.all([
    supabase.from("productos").select("id, referencia, codigo, categoria:categorias ( nombre )").eq("id", productoId).limit(1),
    supabase.from("variantes").select("id", { count: "exact", head: true }).eq("producto_id", productoId).eq("activo", true),
  ]);
  const fila = error ? null : filas?.[0];
  if (!fila) return null;
  return { id: fila.id, referencia: fila.referencia, codigo: fila.codigo ?? null, categoria: fila.categoria?.nombre ?? null, variantes: count ?? 0 };
}

export async function getHistorialPrenda(productoId: string): Promise<LecturaHistorial> {
  const supabase = await createClient();
  // Los tipos de la base son generados y todavía no traen esta función: la llamada va con `as never`, como otras.
  const { data, error } = await supabase.rpc("fn_historial_prenda" as never, { p_producto_id: productoId } as never);
  if (error || !Array.isArray(data)) return { estado: "error" };
  return { estado: "ok", eventos: armarEventos(data as FilaHistorial[]) };
}
