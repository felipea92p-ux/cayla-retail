import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { rangoMes } from "@/lib/gastos-reglas";
import { leerProvision, MESES_POR_SEPARADO, mesesDelRango, provisionDelRango, type FilaProvision } from "@/lib/planilla-provision-reglas";
import { unstable_rethrow } from "next/navigation";

// La planilla estimada por sede (ADR-0453; contrato en 20261018040000_planilla_provision_por_sede.sql). Solo LEE: la cifra sale de la
// boleta en vivo de Dynamic, agregada por sede en la base, y la base ya acota a lo que la cuenta ve (el líder, todas las sedes; con
// «Reportes financieros», la suya; sin ser admin o líder en Dynamic, nada).
//
// Principio 9: es un AGREGADO a lo que ya se ve, nunca una condición para verlo. Si la base no responde, o la función todavía no está
// pegada en producción, la pantalla sigue como antes (el mes sin sueldos estimados) y el motivo queda en el log del servidor.
//
// Una lectura por mes y por carga de pantalla (2026-11-09): ver «UNA LECTURA POR MES» en `planilla-provision-reglas.ts`.

/** `fn_planilla_provision` tal cual. `null` = la lectura falló (anotado); `[]` = no hay nada que sumar. */
async function leer(desde: string, hasta: string, ubicacionId: string | null): Promise<FilaProvision[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_planilla_provision" as never, { p_desde: desde, p_hasta: hasta, p_ubicacion_id: ubicacionId } as never);
    if (error) {
      // La función aún no existe (PGRST202 / 42883: antes de pegar la migración) o la cuenta no ve los números financieros
      // (42501): no es una falla, es «no hay nada que sumar». Cualquier otra sí se anota.
      if (error.code === "PGRST202" || error.code === "42883" || error.code === "42501") return [];
      console.error(`fn_planilla_provision: ${error.message}`);
      return null;
    }
    return leerProvision(data);
  } catch (e) {
    unstable_rethrow(e);
    console.error(`fn_planilla_provision: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Un mes entero («2026-11»), de todas las sedes que la cuenta ve. `cache` de React: dura lo que dura UNA carga de pantalla, nunca entre visitas. */
const delMesEntero = cache((mes: string): Promise<FilaProvision[] | null> => {
  const { desde, hasta } = rangoMes(mes);
  return leer(desde, hasta, null);
});

/** Los períodos de Dynamic sin pagar que terminan entre `desde` y `hasta`, por sede, con lo que corresponde pagar hasta hoy. */
export async function getProvisionPlanilla(desde: string, hasta: string, ubicacionId: string | null = null): Promise<FilaProvision[]> {
  const meses = mesesDelRango(desde, hasta);
  if (meses.length === 0 || meses.length > MESES_POR_SEPARADO) return (await leer(desde, hasta, ubicacionId)) ?? [];
  // `(mes) => …` y no `meses.map(delMesEntero)`: `map` le pasaría también la posición y la lista, y `cache` usa TODOS los argumentos como llave
  // (nunca coincidiría). Medido el 2026-11-09: así, una carga de Resumen pide 2 meses en vez de 5 rangos.
  const porMes = await Promise.all(meses.map((mes) => delMesEntero(mes)));
  // Todo o nada, como la lectura de un solo rango: medio rango con sueldos y medio sin ellos diría una ganancia que no es.
  if (porMes.some((filas) => filas === null)) return [];
  return provisionDelRango(porMes.flat() as FilaProvision[], desde, hasta, ubicacionId);
}
