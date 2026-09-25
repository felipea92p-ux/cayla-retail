import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerCampana, leerFilaER, type CampanaFila, type FilaER } from "@/lib/resultados-reglas";

// Finanzas ▸ Reportes (ADR-0195 F5; contrato en 20260925130000_finanzas_diario_y_estado_de_resultados.sql). Solo LEE: toda
// la plata se calcula en Postgres, sobre el diario `fn_asientos`, y la base ya filtra por cuenta (el líder, todo y el
// consolidado; con «Reportes financieros», su tienda). Si una lectura falla, la pantalla se dibuja igual y lo dice
// (principio 9): nunca muestra ceros como si fueran datos.

type Lectura<T> = { datos: T; falla: string | null };
const falla = (que: string, e: { message: string }) => `No se pudo leer ${que}: ${e.message}`;

/** Una fila por ubicación que la cuenta ve; para el líder, además «De la empresa» y CAYLA. */
export async function getEstadoResultados(desde: string, hasta: string): Promise<Lectura<FilaER[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estado_resultados" as never, { p_desde: desde, p_hasta: hasta } as never);
  if (error) return { datos: [], falla: falla("el estado de resultados", error) };
  return {
    datos: ((data ?? []) as Record<string, unknown>[]).map(leerFilaER),
    falla: null,
  };
}

/** Las campañas pasadas, en curso y por venir de las tiendas que la cuenta ve. */
export async function getCampanas(): Promise<Lectura<CampanaFila[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_campanas_reporte" as never);
  if (error) return { datos: [], falla: falla("las campañas", error) };
  return {
    datos: ((data ?? []) as Record<string, unknown>[]).map(leerCampana),
    falla: null,
  };
}
