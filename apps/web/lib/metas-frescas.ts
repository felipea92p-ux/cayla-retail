import { createClient } from "@/lib/supabase/client";
import { leerConfiguracion, leerConfiguracionMetas, leerParametrosFinanzas, type ParametrosFinanzas, type TiendaConfig } from "@/lib/configuracion-reglas";

// Lo último que hay en la base, justo antes de guardar (ver `metas-frescas-reglas.ts`). `null` si no se pudo leer: entonces no se guarda, porque mandar lo que hay en
// memoria es justo lo que borraba datos.

/** Las metas de la semana tipo y el fondo de una tienda. */
export async function tiendaFresca(id: string): Promise<TiendaConfig | null> {
  const { data, error } = await createClient().rpc("fn_configuracion_tiendas" as never);
  if (error) return null;
  return leerConfiguracion(data).tiendas.find((t) => t.id === id) ?? null;
}

/** La semana de un mes de una tienda. */
export async function semanaDelMesFresca(id: string, mes: string): Promise<(number | null)[] | null> {
  const { data, error } = await createClient().rpc("fn_configuracion_metas" as never, { p_meses: 6 } as never);
  if (error) return null;
  return leerConfiguracionMetas(data)?.tiendas.find((t) => t.id === id)?.meses.find((m) => m.mes === mes)?.metas ?? null;
}

/** El mínimo de caja y los dos avisos: `guardar_parametros_finanzas` reemplaza los tres, y cada uno tiene ahora su propia casilla. */
export async function parametrosFinanzasFrescos(): Promise<ParametrosFinanzas | null> {
  const { data, error } = await createClient().rpc("fn_parametros_finanzas" as never);
  if (error) return null;
  return leerParametrosFinanzas(data);
}

/** El aviso cuando no se pudo leer: nada se guardó y la casilla vuelve a lo de antes. */
export const NO_SE_PUDO_LEER = "No se pudo leer lo último de la base, así que no se guardó. Revisa la conexión y vuelve a intentar.";
