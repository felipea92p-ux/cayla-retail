"use client";

import { useEffect, useMemo, useState } from "react";
import { aplicarPlan, type FilaConPlan, type PlanAplicado, type PlanDelPanel } from "@/lib/existencias-plan-panel";

type Entrega<F> = { promesa: PromiseLike<PlanDelPanel | null> | null; stock: readonly F[]; n: number };
type Recibido<F> = { promesa: PromiseLike<PlanDelPanel | null>; plan: PlanDelPanel | null; stock: readonly F[]; n: number };

/**
 * El plan del piso que llega DESPUÉS que la lista (Existencias en dos tiempos, 2026-11-13).
 *
 * La página le pasa al panel la promesa del plan (React la manda por el mismo hilo de la respuesta). Este hook la espera SIN suspender:
 * con `use()` el panel entero quedaría detrás del plan —justo lo que se quiere evitar— y con un `<Suspense>` alrededor, al llegar el plan
 * React cambiaría el panel de reserva por el de verdad y se perdería lo escrito en el buscador, el foco y la prenda abierta. Aquí el panel
 * se dibuja una vez y el plan solo cambia sus datos.
 *
 * La promesa y el stock llegan juntos en cada respuesta (la primera y cada `router.refresh`): se guardan juntos, numerados, para saber
 * contra qué stock se calculó cada plan (`aplicarPlan` lo usa tras un refresco). Un plan que llega tarde no se tira aunque ya haya otra
 * respuesta en camino: sirve para las tallas que no cambiaron. Solo no pisa a uno más nuevo.
 */
export function usePlanDelPiso<F extends FilaConPlan>(promesa: PromiseLike<PlanDelPanel | null> | null, stock: readonly F[]): PlanAplicado<F> {
  const [entrega, setEntrega] = useState<Entrega<F>>({ promesa, stock, n: 0 });
  // Una respuesta nueva de la página (otra promesa): se ajusta en el mismo render, sin efecto (patrón de React para estado derivado).
  if (entrega.promesa !== promesa) setEntrega({ promesa, stock, n: entrega.n + 1 });

  const [recibido, setRecibido] = useState<Recibido<F> | null>(null);
  useEffect(() => {
    const { promesa: p, stock: s, n } = entrega;
    if (!p) return;
    const guardar = (plan: PlanDelPanel | null) => setRecibido((previo) => (previo && previo.n > n ? previo : { promesa: p, plan, stock: s, n }));
    // Si la promesa falla (no debería: la página ya convierte la caída en `null`), cuenta como plan caído: N/D, nunca «calculando» eterno.
    Promise.resolve(p).then(guardar, () => guardar(null));
  }, [entrega]);

  return useMemo(
    () => aplicarPlan(stock, { pedido: promesa !== null, recibido, vigente: recibido !== null && recibido.promesa === promesa }),
    [stock, promesa, recibido]
  );
}
