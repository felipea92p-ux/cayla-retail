import { createClient } from "@/lib/supabase/server";
import { lecturaDesdeJson, planDelPiso, type LecturaDelPiso, type OpcionesPlan, type PlanDelPiso } from "@/lib/piso-plan";

/* ====================================================================
   piso-plan-servidor · la ÚNICA puerta de la web al motor del piso (ADR-0328 act. 7)

   CONTRATO. `leerPlanDelPiso(sede)` hace UNA llamada a `retail.fn_piso_plan_lectura` (migración 20261004213000) y le pasa la
   respuesta al motor puro (`lib/piso-plan.ts`). Devuelve el plan, o `null` si la base no respondió, respondió NULL (sin la
   puerta) o algo que no se entiende. Nunca lanza: quien llama muestra «no se pudo leer» en lo que depende del plan y el resto
   de su pantalla sigue en pie (principio 9). Nunca devuelve un plan vacío en lugar de un error: un plan vacío diría «el piso
   está al día» sin saberlo.
   ==================================================================== */

/** La lectura cruda de una sede, o `null` si no se pudo leer (ver contrato). */
export async function leerLecturaDelPiso(ubicacionId: string): Promise<LecturaDelPiso | null> {
  try {
    const supabase = await createClient();
    // La función es de la migración 20261004213000: su tipo todavía no está en los tipos generados de la base.
    const res = await supabase.rpc("fn_piso_plan_lectura" as never, { p_ubicacion_id: ubicacionId } as never);
    if (res.error) {
      console.error("Motor del piso: no se pudo leer fn_piso_plan_lectura:", res.error.message);
      return null;
    }
    const lectura = lecturaDesdeJson(res.data);
    if (!lectura) console.error("Motor del piso: fn_piso_plan_lectura respondió vacío o con una forma que no se entiende.");
    return lectura;
  } catch (e) {
    console.error("Motor del piso: la lectura falló.", e);
    return null;
  }
}

/** El plan del piso de una sede (decisión por talla, lista del día y «se vendió rápido y falta»), o `null` si no se pudo leer. */
export async function leerPlanDelPiso(ubicacionId: string, opciones: OpcionesPlan = {}): Promise<PlanDelPiso | null> {
  const lectura = await leerLecturaDelPiso(ubicacionId);
  return lectura ? planDelPiso(lectura, opciones) : null;
}
