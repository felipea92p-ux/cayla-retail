import { createClient } from "@/lib/supabase/server";
import { exigir, type Tolerado } from "@/lib/resultado";
import {
  calcularRitmoReciente,
  diasExposicionComercial,
  leerEventosPiso,
  VENTANA_RITMO_RECIENTE_DIAS,
  type RitmoReciente,
} from "@/lib/existencias-ritmo";
import { TEXTO_RITMO_FALLO } from "@/lib/existencias-ritmo-panel";
import { politicaDe } from "@/lib/politica-operativa-inventario";
import { unstable_rethrow } from "next/navigation";
import { SIN_CRONOMETRO, type Cronometro } from "@/lib/medir-tramos";

// La parte que LEE de Postgres para «Ritmo reciente»/«Cobertura piso» de Existencias
// (2026-09-25). Todo lo que decide qué significan los eventos vive en `existencias-ritmo.ts`
// (puro, sin este archivo). Fuente: `retail.fn_ritmo_reciente_json`, delgada sobre
// `retail.fn_ledger_puntos` (ADR-0202) — mismo ledger único que ya usa Análisis, sin sumar
// una cuarta reconstrucción independiente (ver el encabezado de la migración).

/**
 * Dato SECUNDARIO de Existencias: si falla, la pantalla sigue viva con «N/D» y un aviso, en vez de
 * tumbar el inventario que la encargada usa en el mostrador. Llega DESPUÉS que la lista (2026-11-13): la
 * cobertura de cada talla ya no se calcula aquí sino en el panel, con el piso que la pantalla tiene ahora
 * (`lib/existencias-ritmo-panel.ts`).
 */
export async function getRitmoRecientePorVariante(
  ubicacionId: string,
  varianteIds: readonly string[],
  ahora: Date = new Date(),
  // Quién mide sus dos pedazos (Existencias, `existencias_tramos`): `ritmo_rpc` (la base, el viaje y el JSON) y `ritmo_calculo` (las
  // jornadas de cada talla, en el servidor). Sin él, no se anota nada.
  cronometro: Cronometro = SIN_CRONOMETRO
): Promise<Tolerado<Map<string, RitmoReciente>>> {
  if (varianteIds.length === 0) return { datos: new Map(), fallo: null };
  try {
    const supabase = await createClient();
    const desde = new Date(ahora.getTime() - VENTANA_RITMO_RECIENTE_DIAS * 24 * 60 * 60 * 1000);
    const { minDiasExposicionRitmo } = politicaDe(ubicacionId);
    const crudo = exigir(
      await cronometro.medir(
        "ritmo_rpc",
        supabase.rpc("fn_ritmo_reciente_json", {
          p_ubicacion_id: ubicacionId,
          p_desde: desde.toISOString(),
          p_variante_ids: [...varianteIds],
        })
      ),
      "el ritmo reciente de esta ubicación"
    ) as unknown as Record<string, unknown>;
    cronometro.pesar("ritmo_rpc", crudo);

    return cronometro.medirAhora("ritmo_calculo", () => {
      const ritmo = new Map<string, RitmoReciente>();
      for (const varianteId of varianteIds) {
        const eventos = leerEventosPiso(crudo[varianteId] ?? []);
        const dias = diasExposicionComercial(eventos, desde, ahora);
        ritmo.set(varianteId, calcularRitmoReciente(dias, minDiasExposicionRitmo));
      }
      return { datos: ritmo, fallo: null };
    });
  } catch (e) {
    unstable_rethrow(e);
    return { datos: null, fallo: TEXTO_RITMO_FALLO };
  }
}
