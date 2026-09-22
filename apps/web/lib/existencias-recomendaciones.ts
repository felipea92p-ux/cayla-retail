import { calcularCobertura, calcularVelocidad, planDeReposicion, type FilaResumen, type PlanReposicion } from "@/lib/resumen-reglas";
import type { Ubicacion } from "@/lib/ubicaciones";

/* ====================================================================
   existencias-recomendaciones · «Ver recomendaciones» (2026-09-22)

   El motor de reposición (`planDeReposicion`, `resumen-reglas.ts`) ya existía —lo usa
   «Nueva orden» de Producción para sumar demanda de la red— pero NINGUNA pantalla lo
   corría todavía por variante para decir «esto es lo que harías hoy» (confirmado con
   `grep`: cero llamadores). Acá se reutiliza tal cual, sin reescribir una sola regla:
   por cada variante de la sede se arma su `Velocidad`/`Cobertura` (las mismas
   funciones que ya arma `getCoberturaPorVariante`) y se le pregunta al plan qué paso
   sigue. Solo se listan las que de verdad piden algo (`principal.accionable`).
   ==================================================================== */

export type Recomendacion = {
  fila: FilaResumen;
  plan: PlanReposicion;
};

const ORDEN_URGENCIA: Record<PlanReposicion["urgencia"], number> = { alta: 0, media: 1, baja: 2, ninguna: 3 };

/** `filas`: el mismo `getFilasRecientesDeSede` (30 días) que ya usa la cobertura de Existencias —
 *  el plan necesita el ritmo RECIENTE, no el de 7 días de la tabla. */
export function recomendacionesDeSede(filas: FilaResumen[], destino: Ubicacion, ahora: Date = new Date()): Recomendacion[] {
  return filas
    .map((f): Recomendacion => {
      const velocidad = calcularVelocidad(f);
      const cobertura = calcularCobertura(f.utilizable, velocidad);
      const plan = planDeReposicion({ f, velocidad, cobertura, destino, ahora, motivo: "demanda" });
      return { fila: f, plan };
    })
    .filter((r) => r.plan.principal?.accionable)
    .sort((a, b) => ORDEN_URGENCIA[a.plan.urgencia] - ORDEN_URGENCIA[b.plan.urgencia]);
}
