import { createClient } from "@/lib/supabase/server";
import { hoyEnLima, restarDias } from "@/lib/movimientos-reglas";
import {
  DIAS_VENTANA_REPETICION,
  avisoPerdidas,
  leerResumenPerdidas,
  perdidasQueSeRepiten,
  type AvisoPerdidas,
  type ResumenPerdidas,
} from "@/lib/perdidas-reglas";

// Pérdidas (ADR-0328, actividad 14): las dos lecturas del servidor sobre `retail.fn_perdidas_resumen`.
//
// CONTRATO — PROMETEN: `null` cuando la base no respondió o negó el permiso (la pantalla dice «no se pudo leer», nunca
// dibuja un 0); nunca escriben ni bloquean nada. ASUMEN: quien llama ya pasó la puerta del módulo Movimientos (la base lo
// vuelve a comprobar con `fn_ve_modulo` y `fn_puede_operar_ubicacion`).
//
// Nada optimista: es solo lectura, y la pantalla espera a la base como el resto de Movimientos.

export async function getResumenPerdidas(
  ubicacionId: string,
  desde: string,
  hasta: string,
  filtros: { varianteId?: string | null; sububicacionId?: string | null } = {}
): Promise<ResumenPerdidas | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_perdidas_resumen" as never,
    {
      p_ubicacion_id: ubicacionId,
      p_desde: desde,
      p_hasta: hasta,
      p_variante_id: filtros.varianteId ?? null,
      p_sububicacion_id: filtros.sububicacionId ?? null,
    } as never
  );
  if (error) {
    console.error("Pérdidas:", error.message);
    return null;
  }
  return leerResumenPerdidas(data);
}

/** El aviso «se repite» del Inicio del líder: los últimos 30 días de la sede pasados por la regla pura. `null` = no se
 *  pudo leer (el aviso lo dice; no es «al día»). */
export async function getAvisoPerdidas(ubicacionId: string): Promise<AvisoPerdidas | null> {
  const hoy = hoyEnLima();
  const resumen = await getResumenPerdidas(ubicacionId, restarDias(hoy, DIAS_VENTANA_REPETICION - 1), hoy);
  if (!resumen) return null;
  return avisoPerdidas(perdidasQueSeRepiten(resumen.hechos, hoy));
}
