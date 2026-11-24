import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerListas, leerReglas, type ListasDePrecio, type ReglasDePrecio } from "@/lib/margen-por-rasgos";

// Las lecturas de las reglas del precio sugerido (ADR-0700) para Configuración ▸ Precios. La cuenta vive en `lib/margen-por-rasgos.ts`.

/** La regla vigente y quién la puso. Si la lectura falla, la pantalla lo dice: no muestra la de fábrica como si fuera la guardada. */
export type ReglasLeidas = { reglas: ReglasDePrecio; registradoPor: string | null; registradoEn: string | null };

export async function getReglasDePrecio(): Promise<{ datos: ReglasLeidas | null; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reglas_de_precio" as never);
  if (error) return { datos: null, falla: `No se pudieron leer las reglas del precio: ${error.message}` };
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    datos: {
      reglas: leerReglas(data),
      registradoPor: typeof d.registrado_por === "string" ? d.registrado_por : null,
      registradoEn: typeof d.registrado_en === "string" ? d.registrado_en : null,
    },
    falla: null,
  };
}

export async function getListasDePrecio(): Promise<{ datos: ListasDePrecio | null; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listas_de_precio" as never);
  if (error) return { datos: null, falla: `No se pudieron leer los tejidos y las marcas: ${error.message}` };
  return { datos: leerListas(data), falla: null };
}
