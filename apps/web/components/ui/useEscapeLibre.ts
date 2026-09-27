"use client";

import { useCallback, useEffect, useEffectEvent, useRef } from "react";

/* ====================================================================
   useEscapeLibre · Escape cierra la hoja solo si nadie de adentro lo usó
   (2026-09-26, ADR-0136 «Actualización 2026-09-26»)

   El problema: con la lista de un combo abierta dentro de un <Modal>,
   Escape cerraba el MODAL entero y se perdía lo escrito. Radix escucha
   Escape en la fase de CAPTURA del `document`, que corre antes de que el
   evento llegue al combo enfocado: el `stopPropagation()` con que cada
   combo se quedaba con su Escape llegaba tarde, y la hoja ya se había
   cerrado. El buscador de «Registrar nota de crédito» tenía el mismo
   problema: su Escape debía borrar primero lo escrito, y cerraba todo.

   El arreglo: la hoja no decide en la captura. Le pide a Radix que no
   cierre (`preventDefault`) y espera al final del recorrido del evento, en
   `window`. Si el Escape llegó hasta arriba, nadie lo usó y la hoja se
   cierra. Si un control lo usó —el combo cerró su lista, el buscador borró
   su texto— y cortó su propagación, la hoja se queda; el Escape siguiente
   ya no tiene dueño y la cierra.

   Por qué `window` sirve de meta: Next hidrata React sobre `document`, así
   que el `onKeyDown` de cada control corre en el `document`, y su
   `stopPropagation()` impide que el evento siga hasta `window`.

   La regla para un control nuevo que viva en una hoja: si usa el Escape
   (cierra algo suyo, limpia algo suyo), `e.stopPropagation()`. Si no lo
   usa, lo deja pasar. Toda hoja de Radix pasa por aquí: `<Modal>` y los
   cajones que arman su propio `Dialog.Content` (lo vigila
   lib/hojas-escape.test.ts).
   ==================================================================== */
export function useEscapeLibre(cerrar: () => void): (e: KeyboardEvent) => void {
  // El Escape que Radix vio en la captura y que todavía no se sabe si alguien usó.
  const pendiente = useRef<KeyboardEvent | null>(null);
  const alCerrar = useEffectEvent(cerrar);

  useEffect(() => {
    const alLlegarArriba = (e: KeyboardEvent) => {
      // Solo ESE Escape: si alguien lo usó, `pendiente` queda con un evento viejo que ninguna tecla futura iguala.
      if (e !== pendiente.current) return;
      pendiente.current = null;
      alCerrar();
    };
    window.addEventListener("keydown", alLlegarArriba);
    return () => window.removeEventListener("keydown", alLlegarArriba);
  }, []);

  // Para `onEscapeKeyDown` del `Dialog.Content`: Radix lo llama solo en la hoja de más arriba, así que con dos hojas
  // apiladas solo la de encima queda esperando su Escape.
  return useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    pendiente.current = e;
  }, []);
}
