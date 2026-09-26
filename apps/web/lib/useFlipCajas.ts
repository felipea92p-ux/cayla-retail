"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * FLIP en dos dimensiones para un tablero (ADR-0133, F2): cuando una tarjeta cambia de columna DESLIZA de
 * donde estaba a donde queda, en vez de saltar. `useFlip` (ADR-0128) solo mueve filas en vertical dentro
 * de una lista; acá las tarjetas también cambian de columna, así que hay que medir x e y.
 *
 * Cómo: cada tarjeta se registra con `ref(id)`; el contenedor va con `contenedor` y tiene que ser
 * `position: relative` (así es el `offsetParent` de las tarjetas y `offsetLeft/Top` es «dentro del
 * tablero»). Se mide en cada render y se anima solo cuando cambió `clave` (la firma «id:columna» de todas
 * las tarjetas): un cambio de tamaño de ventana o un dato que llega no debe mover nada. `offsetLeft/Top`
 * ignoran `transform`, así que la entrada escalonada de las tarjetas no contamina la medida. Las tarjetas
 * nuevas no animan (no tienen de dónde venir). Con movimiento reducido no anima nada.
 */
export function useFlipCajas(clave: string, ms = 560) {
  const elementos = useRef(new Map<string, HTMLElement>());
  const posiciones = useRef(new Map<string, { x: number; y: number }>());
  const claveAnterior = useRef(clave);
  const contenedor = useRef<HTMLElement | null>(null);

  // Sin lista de dependencias a propósito (igual que `useFlip`): se mide en CADA render para que las
  // posiciones guardadas nunca queden viejas; solo se anima cuando cambió `clave`.
  useLayoutEffect(() => {
    const ahora = new Map<string, { x: number; y: number }>();
    elementos.current.forEach((el, id) => {
      // El contenedor es el offsetParent de las tarjetas; si no lo fuera, se sube por la cadena.
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== contenedor.current) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      ahora.set(id, { x, y });
    });
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (claveAnterior.current !== clave && !reducido) {
      ahora.forEach((pos, id) => {
        const antes = posiciones.current.get(id);
        if (!antes) return;
        const dx = antes.x - pos.x;
        const dy = antes.y - pos.y;
        if (Math.abs(dx) + Math.abs(dy) < 2) return;
        elementos.current.get(id)?.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: ms,
          easing: "cubic-bezier(0.32, 0.72, 0.24, 1)", // --ease-cayla
        });
      });
    }
    claveAnterior.current = clave;
    posiciones.current = ahora;
  });

  const ref = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) elementos.current.set(id, el);
      else elementos.current.delete(id);
    },
    []
  );

  const refContenedor = useCallback((el: HTMLElement | null) => {
    contenedor.current = el;
  }, []);

  return { ref, contenedor: refContenedor };
}
