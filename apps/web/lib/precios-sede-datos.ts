// Los precios propios de una o varias tiendas (Felipe 2026-10-09; base: `fn_precios_en_sede`), para las pantallas que arman sus
// precios desde el catálogo (Apartados, Cambios, Proformas, Ventas sin registrar). Vender lee los suyos aparte, con su sondeo.
//
// CONTRATO
//   PROMETE: `ubicacion_id → (variante_id → precio de esa tienda)`. Solo las excepciones: una prenda que no está en el mapa se
//            vende al general (`variantes.precio`). Una tienda cuya lectura falló NO aparece.
//   SE DEGRADA: nunca lanza. Sin la lectura, la pantalla muestra el general, y la base —que calcula con `fn_precio_en_sede`— cobra
//            o rechaza igual: el precio que vale lo decide la base, no esta lectura.
import { createClient } from "./supabase/server";
import { leerPreciosEnSede } from "./precio-sede-reglas";

export async function getPreciosPorSede(ubicacionIds: readonly string[]): Promise<Record<string, Record<string, number>>> {
  const sedes = [...new Set(ubicacionIds.filter(Boolean))];
  if (sedes.length === 0) return {};
  const supabase = await createClient();
  const lecturas = await Promise.all(
    sedes.map(async (sede) => {
      try {
        const { data, error } = await supabase.rpc("fn_precios_en_sede", { p_ubicacion_id: sede });
        if (error) return null;
        return [sede, Object.fromEntries(leerPreciosEnSede(data))] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(lecturas.filter((l): l is NonNullable<typeof l> => l !== null));
}

/** Las tiendas abiertas y sus precios propios, para las pantallas que miran todas las sedes (Catálogo ▸ Productos). */
export async function getPreciosDeLasTiendas(): Promise<{ nombres: Map<string, string>; porSede: Record<string, Record<string, number>> }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ubicaciones").select("id, nombre").eq("tipo", "tienda").eq("activo", true);
    if (error || !data) return { nombres: new Map(), porSede: {} };
    return { nombres: new Map(data.map((u) => [u.id, u.nombre])), porSede: await getPreciosPorSede(data.map((u) => u.id)) };
  } catch {
    return { nombres: new Map(), porSede: {} };
  }
}
