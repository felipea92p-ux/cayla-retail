"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * FLIP para una lista que se reordena o se filtra (ADR-0122): las filas que ya estaban se DESLIZAN de
 * donde estaban a donde quedan, en vez de saltar. Es lo que hace que ordenar por «Saldo» se lea como
 * «las mismas filas se movieron» y no como «la tabla se redibujó».
 *
 * Cómo: cada fila se registra con `ref(id)`; cuando cambia `clave` (la lista de ids en su orden actual)
 * se compara el `offsetTop` de cada fila contra el que tenía la vez anterior y se anima la diferencia
 * con la Web Animations API (solo `transform`: no dispara layout por fotograma). Las filas nuevas no animan (no tienen de dónde venir): su
 * aviso es el destello de la fila. Con movimiento reducido no anima nada.
 *
 * `useLayoutEffect` (y no `useEffect`) para medir antes de que el navegador pinte: si no, se vería un
 * fotograma con las filas ya en su lugar nuevo antes de que empiecen a deslizarse.
 */
// Posición de la fila dentro de su contenedor, SIN transformaciones: `offsetTop` ignora `transform`, así que
// la entrada escalonada (que sube 8 px) o un deslizamiento en curso no contaminan la medida. Se resta la
// posición del contenedor cuando ambos cuelgan del mismo `offsetParent`, para que lo que cambie ARRIBA de la
// tabla (una cifra que ocupa otra línea) no parezca un movimiento de las filas.
function posicion(el: HTMLElement): number {
  const padre = el.parentElement;
  if (!padre || el.offsetParent === padre) return el.offsetTop;
  return el.offsetTop - padre.offsetTop;
}

export function useFlip(clave: string, ms = 460) {
  const elementos = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  const claveAnterior = useRef(clave);

  // Sin lista de dependencias a propósito: se MIDE en cada render para que `tops` nunca quede viejo (una
  // fuente que carga, un chip que aparece o un cambio de altura arriba de la tabla mueven las filas sin
  // que cambie el orden; si solo se midiera al reordenar, la siguiente animación arrancaría desde una
  // posición equivocada). Pero solo se ANIMA cuando cambió el orden o el filtro (`clave`).
  // La posición se mide relativa al contenedor de la fila y sin transformaciones (ver `posicion`).
  useLayoutEffect(() => {
    const ahora = new Map<string, number>();
    elementos.current.forEach((el, id) => ahora.set(id, posicion(el)));
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (claveAnterior.current !== clave && !reducido) {
      ahora.forEach((top, id) => {
        const antes = tops.current.get(id);
        if (antes == null || Math.abs(antes - top) < 1) return;
        elementos.current.get(id)?.animate([{ transform: `translateY(${antes - top}px)` }, { transform: "none" }], {
          duration: ms,
          easing: "cubic-bezier(0.32, 0.72, 0.24, 1)", // --ease-cayla
        });
      });
    }
    claveAnterior.current = clave;
    tops.current = ahora;
  });

  return useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) elementos.current.set(id, el);
    else elementos.current.delete(id);
  }, []);
}
