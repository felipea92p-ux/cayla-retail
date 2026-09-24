import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerConfiguracion, leerParametrosCaja, type ConfiguracionTiendas, type ParametrosCaja } from "@/lib/configuracion-reglas";

export type { CampanaConfig, ConfiguracionTiendas, EfectoCampana, TiendaConfig } from "@/lib/configuracion-reglas";

// Configuración ▸ Tiendas y caja (ADR-0195 F1, 20260924210000). Todo sale de `fn_configuracion_tiendas` (solo líder)
// y de `fn_parametros_caja` (la única regla de qué meta y qué fondo rigen un día; la lee también Caja).

export async function getConfiguracionTiendas(): Promise<ConfiguracionTiendas> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_configuracion_tiendas" as never);
  if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`);
  return leerConfiguracion(data);
}

/** Lo que rige hoy (o en `fecha`) en una sede: meta del día, fondo y campañas. `null` si la base todavía no tiene la
 *  función (web publicada antes de pegar 20260924210000): Caja cae a la meta de antes y el cierre no pide fondo. */
export async function getParametrosCaja(ubicacionId: string, fecha: string): Promise<ParametrosCaja | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_parametros_caja" as never, { p_ubicacion_id: ubicacionId, p_fecha: fecha } as never);
  if (error) return null;
  const fila = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null);
  return leerParametrosCaja(fila);
}
