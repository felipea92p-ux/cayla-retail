"use client";

import { useEffect, useMemo, useState } from "react";
import { aplicarRitmo, type FilaConRitmo, type RitmoAplicado, type RitmoDelPanel } from "@/lib/existencias-ritmo-panel";

type Recibido = { promesa: PromiseLike<RitmoDelPanel | null>; ritmo: RitmoDelPanel | null; n: number };

/**
 * El Ritmo reciente que llega DESPUÉS que la lista (2026-11-13, `lib/existencias-ritmo-panel.ts`).
 *
 * Igual que `usePlanDelPiso`: espera la promesa SIN suspender (con `use()` o un `<Suspense>` el panel quedaría detrás del ritmo, o se
 * rehacería al llegar y perdería lo escrito en el buscador y la prenda abierta). El panel se dibuja una vez; el ritmo solo cambia sus datos.
 * Cada respuesta de la página (la primera y cada `router.refresh`) trae su promesa; un ritmo que llega tarde no pisa a uno más nuevo.
 */
export function useRitmoReciente<F extends FilaConRitmo>(promesa: PromiseLike<RitmoDelPanel | null> | null, stock: readonly F[]): RitmoAplicado<F> {
  const [entrega, setEntrega] = useState({ promesa, n: 0 });
  // Una respuesta nueva de la página (otra promesa): se ajusta en el mismo render, sin efecto (patrón de React para estado derivado).
  if (entrega.promesa !== promesa) setEntrega({ promesa, n: entrega.n + 1 });

  const [recibido, setRecibido] = useState<Recibido | null>(null);
  useEffect(() => {
    const { promesa: p, n } = entrega;
    if (!p) return;
    const guardar = (ritmo: RitmoDelPanel | null) => setRecibido((previo) => (previo && previo.n > n ? previo : { promesa: p, ritmo, n }));
    // Si la promesa falla (no debería: la página ya convierte la caída en `null`), cuenta como ritmo caído: N/D, nunca «calculando» eterno.
    Promise.resolve(p).then(guardar, () => guardar(null));
  }, [entrega]);

  return useMemo(
    () => aplicarRitmo(stock, { pedido: promesa !== null, recibido: recibido && { ritmo: recibido.ritmo, vigente: recibido.promesa === promesa } }),
    [stock, promesa, recibido]
  );
}
