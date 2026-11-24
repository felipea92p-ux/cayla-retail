import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerListas, leerReglas, REGLAS_DE_FABRICA, type ListasDePrecio, type ReglasDePrecio } from "@/lib/margen-por-rasgos";

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

/**
 * Para el layout de la app (`ReglasDePrecioProveedor`): la regla vigente, o la de fábrica si no se puede leer. Nunca lanza: el layout no
 * tiene `error.tsx` propio, y una excepción aquí dejaría sin pantalla a toda la app por un margen.
 */
export async function getReglasParaLasHojas(): Promise<ReglasDePrecio> {
  // relleno-a-proposito: sin la regla, las hojas miden contra la de fábrica (36 % y +3); el motivo queda en el registro del servidor.
  const leida = await getReglasDePrecio().catch((e: unknown) => ({ datos: null, falla: e instanceof Error ? e.message : String(e) }));
  if (leida.falla) console.error(`Reglas de precio: ${leida.falla}`);
  return leida.datos?.reglas ?? REGLAS_DE_FABRICA;
}

export async function getListasDePrecio(): Promise<{ datos: ListasDePrecio | null; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_listas_de_precio" as never);
  if (error) return { datos: null, falla: `No se pudieron leer los tejidos y las marcas: ${error.message}` };
  return { datos: leerListas(data), falla: null };
}
