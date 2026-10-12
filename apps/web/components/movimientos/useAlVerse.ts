"use client";

import { useEffect, type RefObject } from "react";

// Un solo observador para todo lo animado de Movimientos (sellos y trayectos): cada pieza arranca su movimiento —le pone
// `data-go`, que el CSS espera— la primera vez que se ve, y no vuelve a hacerlo hasta que se dibuja de nuevo.
let observador: IntersectionObserver | null = null;

function observar(el: Element) {
  if (typeof IntersectionObserver === "undefined") {
    el.setAttribute("data-go", "");
    return;
  }
  observador ??= new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.setAttribute("data-go", "");
        observador?.unobserve(e.target);
      }
    },
    { threshold: 0.4 }
  );
  observador.observe(el);
}

export function useAlVerse(ref: RefObject<Element | null>) {
  useEffect(() => {
    if (ref.current) observar(ref.current);
  }, [ref]);
}
