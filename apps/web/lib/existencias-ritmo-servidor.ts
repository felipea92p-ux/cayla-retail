import { createClient } from "@/lib/supabase/server";
import { exigir, type Tolerado } from "@/lib/resultado";
import {
  calcularCoberturaPiso,
  calcularRitmoReciente,
  diasExposicionComercial,
  leerEventosPiso,
  VENTANA_RITMO_RECIENTE_DIAS,
  type CoberturaPiso,
  type RitmoReciente,
} from "@/lib/existencias-ritmo";
import { politicaDe } from "@/lib/politica-operativa-inventario";

// La parte que LEE de Postgres para «Ritmo reciente»/«Cobertura piso» de Existencias
// (2026-09-25). Todo lo que decide qué significan los eventos vive en `existencias-ritmo.ts`
// (puro, sin este archivo). Fuente: `retail.fn_ritmo_reciente_json`, delgada sobre
// `retail.fn_ledger_puntos` (ADR-0202) — mismo ledger único que ya usa Análisis, sin sumar
// una cuarta reconstrucción independiente (ver el encabezado de la migración).

export type RitmoRecientePorVariante = {
  ritmo: Map<string, RitmoReciente>;
  cobertura: Map<string, CoberturaPiso>;
};

/**
 * Dato SECUNDARIO de Existencias (mismo criterio que `getCoberturaPorVariante`, hoy en
 * `resumen-inventario.ts`): si falla, la pantalla sigue viva con «N/D» y un aviso, en vez de
 * tumbar el inventario que la encargada usa en el mostrador.
 */
export async function getRitmoRecientePorVariante(
  ubicacionId: string,
  varianteIds: readonly string[],
  pisoPorVariante: ReadonlyMap<string, number>,
  ahora: Date = new Date()
): Promise<Tolerado<RitmoRecientePorVariante>> {
  if (varianteIds.length === 0) return { datos: { ritmo: new Map(), cobertura: new Map() }, fallo: null };
  try {
    const supabase = await createClient();
    const desde = new Date(ahora.getTime() - VENTANA_RITMO_RECIENTE_DIAS * 24 * 60 * 60 * 1000);
    const { minDiasExposicionRitmo } = politicaDe(ubicacionId);
    const crudo = exigir(
      await supabase.rpc("fn_ritmo_reciente_json", {
        p_ubicacion_id: ubicacionId,
        p_desde: desde.toISOString(),
        p_variante_ids: [...varianteIds],
      }),
      "el ritmo reciente de esta ubicación"
    ) as unknown as Record<string, unknown>;

    const ritmo = new Map<string, RitmoReciente>();
    const cobertura = new Map<string, CoberturaPiso>();
    for (const varianteId of varianteIds) {
      const eventos = leerEventosPiso(crudo[varianteId] ?? []);
      const dias = diasExposicionComercial(eventos, desde, ahora);
      const r = calcularRitmoReciente(dias, minDiasExposicionRitmo);
      ritmo.set(varianteId, r);
      cobertura.set(varianteId, calcularCoberturaPiso(pisoPorVariante.get(varianteId) ?? 0, r));
    }
    return { datos: { ritmo, cobertura }, fallo: null };
  } catch {
    return { datos: null, fallo: "No se pudo calcular el ritmo reciente. Lo demás de esta pantalla sí está al día." };
  }
}
