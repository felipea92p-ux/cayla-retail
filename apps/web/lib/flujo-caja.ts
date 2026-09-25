import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerFlujoReal, leerProyeccion, type FlujoReal, type Proyeccion } from "@/lib/flujo-caja-reglas";

// Finanzas ▸ Reportes ▸ Flujo de caja y Escenarios (ADR-0195 F6; contrato en 20260925160000_finanzas_flujo_de_caja.sql).
// Solo LEE: toda la cuenta la hace Postgres y la base pide el líder (el flujo es de CAYLA entera). Si una lectura falla, la
// pantalla se dibuja igual y lo dice (principio 9): nunca muestra «S/ 0» como si no hubiera plata.

type Lectura<T> = { datos: T; falla: string | null };
const falla = (que: string, e: { message: string }) => `No se pudo leer ${que}: ${e.message}`;

/** Lo que entró y salió de la plata de CAYLA entre dos días (hasta hoy), por categoría y por semana. */
export async function getFlujoReal(desde: string, hasta: string): Promise<Lectura<FlujoReal | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_flujo_caja_real" as never, { p_desde: desde, p_hasta: hasta } as never);
  if (error) return { datos: null, falla: falla("lo que entró y salió", error) };
  return { datos: leerFlujoReal(data), falla: null };
}

/** Lo que viene: `semanas` bloques de 7 días desde mañana, con sus piezas (para Escenarios). */
export async function getProyeccion(semanas: number): Promise<Lectura<Proyeccion | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_flujo_caja_proyeccion" as never, { p_semanas: semanas } as never);
  if (error) return { datos: null, falla: falla("lo que viene", error) };
  return { datos: leerProyeccion(data), falla: null };
}
