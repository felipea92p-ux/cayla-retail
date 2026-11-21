import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EmpresasAqui } from "@/lib/empresas-de-sede-reglas";
import { agruparPorDueno, type DuenoDeStock } from "@/lib/stock-por-dueno-reglas";
import { cantidadesDeEmpresa } from "@/lib/existencias-empresa-reglas";
import { empresaDeUrl, empresasParaElegir, type EmpresaDeReporte } from "@/lib/reportes-empresa-reglas";
import type { Cantidades } from "@/lib/inventario-reglas";

/**
 * De quién son las unidades de cada prenda en esta sede (ADR-0542), para que Existencias lo diga. Solo donde conviven dos empresas
 * (Lima): en las demás no hay nada que repartir y no se pregunta. `fn_stock_por_dueno` devuelve únicamente las prendas con unidades de
 * alguien que no es la casa, así que la lista es corta y PostgREST no la corta.
 *
 * Dato SECUNDARIO: si la base no responde, devuelve `null` y Existencias sigue en pie sin la línea «De quién es». Nunca lanza.
 */
export async function getStockPorDueno(sedeId: string, empresas: EmpresasAqui): Promise<Map<string, DuenoDeStock[]> | null> {
  if (!empresas || empresas.length < 2) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_stock_por_dueno", { p_ubicacion_id: sedeId });
    if (error || !data) return null;
    const nombres = new Map(empresas.map((e) => [e.id, e.nombre]));
    return agruparPorDueno(
      data.map((f) => ({ varianteId: f.variante_id, empresaId: f.empresa_id, clave: f.clave, cantidad: f.cantidad, cantidadApartada: f.cantidad_apartada })),
      nombres,
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("Existencias: no se pudo leer de quién son las unidades", error);
    return null;
  }
}

/**
 * Existencias ▸ el filtro «Empresa» (ADR-0683, actividad 7): qué empresas se ofrecen (solo donde conviven dos o más), cuál pide la URL (`?emp=<clave>`) y,
 * si se eligió una, SUS unidades por talla (`fn_stock_de_empresa`). Si la base no responde, sin filtro: la lista sale entera, como antes. Nunca lanza.
 */
export async function getFiltroEmpresa(
  sedeId: string,
  empresas: EmpresasAqui,
  enUrl: string | undefined,
): Promise<{ ofrecidas: EmpresaDeReporte[] | null; elegida: EmpresaDeReporte | null; cantidades: Map<string, Cantidades> | null }> {
  const ofrecidas = empresasParaElegir(empresas);
  const elegida = empresaDeUrl(enUrl, ofrecidas);
  if (!elegida) return { ofrecidas, elegida: null, cantidades: null };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_stock_de_empresa" as never, { p_ubicacion_id: sedeId, p_empresa_id: elegida.id } as never);
    if (error) return { ofrecidas, elegida: null, cantidades: null };
    return { ofrecidas, elegida, cantidades: cantidadesDeEmpresa(((data ?? []) as unknown as Record<string, unknown>[])) };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Existencias: no se pudo leer lo de esa empresa", error);
    return { ofrecidas, elegida: null, cantidades: null };
  }
}
