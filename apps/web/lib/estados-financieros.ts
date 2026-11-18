import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { leerPatrimonio, type PatrimonioCambios } from "@/lib/estados-financieros-reglas";

// Finanzas ▸ Estados financieros (ADR-0585). Solo LEE: cada cifra la calcula Postgres y la base decide quién ve qué
// (`fn_ve_estados_financieros_de_todo`). Si una lectura falla, su tarjeta lo dice y las demás se dibujan igual (principio 9).
// Las lecturas van con `cache`: la cabecera y el estado de abajo piden lo mismo en la misma petición y la base responde una vez.

type Lectura<T> = { datos: T; falla: string | null };

/** Lo mismo que `getPatrimonioCambios`, para unas fechas que no son un mes entero (`fn_patrimonio_en_fechas`, migración 20261105230000). Sin serie: esa va por meses. */
export const getPatrimonioEnFechas = cache(async function getPatrimonioEnFechas(desde: string, hasta: string): Promise<Lectura<PatrimonioCambios | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_patrimonio_en_fechas" as never, { p_desde: desde, p_hasta: hasta } as never);
  if (error) return { datos: null, falla: `No se pudo leer lo tuyo de esas fechas: ${error.message}` };
  return { datos: leerPatrimonio(data), falla: null };
});

/** Lo tuyo al empezar y al cerrar el mes, y lo que lo movió (`fn_patrimonio_cambios`, migración 20261030235100). */
export const getPatrimonioCambios = cache(async function getPatrimonioCambios(mes: string, meses = 6): Promise<Lectura<PatrimonioCambios | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_patrimonio_cambios" as never, { p_mes: `${mes}-01`, p_meses: meses } as never);
  if (error) return { datos: null, falla: `No se pudo leer lo tuyo: ${error.message}` };
  return { datos: leerPatrimonio(data), falla: null };
});
