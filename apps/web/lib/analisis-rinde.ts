import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DIAS_RINDE, FALLA_RINDE, filaRindeDe, rindePorCategoria } from "@/lib/analisis-pedir";
import { hoyLima, sumarDias } from "@/lib/fechas-lima";
import { IGV_TASA } from "@/lib/registro-contable";

// Análisis v4 (ADR-0356): «Lo que más rinde» en «Qué pedir». Por tipo de prenda de MI tienda: cuánto se ganó en los últimos 90
// días por cada S/ 1 que hubo en ropa de ese tipo (al costo, en promedio). Es el GMROI dicho en palabras de tienda.
//
// La fuente es la que ya usan Desempeño y Comparar: `fn_resumen_comparacion` trae por prenda la venta neta del período (con IGV,
// menos devoluciones), el costo de lo vendido, el stock promedio del período reconstruido del libro de movimientos y el costo de
// cada una. La encargada la lee igual que el líder (exige operar la tienda y tener Análisis). Sin migración: la cuenta por tipo
// vive en `analisis-pedir.ts` (`rindePorCategoria`), con sus pruebas. Si la base no responde, vacío con su falla (principio 9).
// El IGV se quita de la venta con la tasa del ERP (18 %, la misma que `parametros_tributarios` tiene vigente desde 2011): el
// precio la incluye y el costo de compra no.

export async function getRindePorCategoria(ubicacionId: string): Promise<{ rinde: { categoria: string; porSol: number }[]; falla: string | null }> {
  if (!ubicacionId) return { rinde: [], falla: "Falta la tienda" };
  const hoy = hoyLima();
  const desde = sumarDias(hoy, -(DIAS_RINDE - 1));
  try {
    const supabase = await createClient();
    // Un solo período: A y B son los mismos 90 días (la función pide dos; el segundo no agrega trabajo al libro). Los
    // parámetros van escritos EN la llamada para que `pnpm datos:comparar` los contraste con la firma de producción.
    const { data, error } = await supabase.rpc("fn_resumen_comparacion_json", {
      p_ubicacion_id: ubicacionId,
      p_a_desde: desde,
      p_a_hasta: hoy,
      p_b_desde: desde,
      p_b_hasta: hoy,
    });
    if (error) {
      console.error(`fn_resumen_comparacion_json (lo que más rinde): ${error.message}`);
      return { rinde: [], falla: FALLA_RINDE };
    }
    const filas = Array.isArray(data) ? (data as unknown[]).map(filaRindeDe) : [];
    return { rinde: rindePorCategoria(filas, IGV_TASA), falla: null };
  } catch (e: unknown) {
    console.error(`lo que más rinde: ${e instanceof Error ? e.message : String(e)}`);
    return { rinde: [], falla: FALLA_RINDE };
  }
}
