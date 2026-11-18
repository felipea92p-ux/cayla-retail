"use client";

import { useEffect, type RefObject } from "react";

/**
 * Pasar por una persona en cualquier pieza la enciende en todas (ADR-0610): su barra en el gráfico, su fila en la tabla. Es solo una marca en el DOM (no
 * cambia ningún dato), para que recorrer la lista con el mouse no vuelva a dibujar la pantalla. Lo que se ve lo decide el CSS (`[data-foco]`).
 */
export function useFocoPersona(raiz: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    let actual: string | null = null;
    const poner = (id: string | null) => {
      if (id === actual) return;
      actual = id;
      for (const zona of el.querySelectorAll<HTMLElement>(".mesa-lienzo, .tv-tabla")) zona.toggleAttribute("data-foco", id !== null);
      for (const b of el.querySelectorAll<HTMLElement>("[data-persona-barra]")) b.toggleAttribute("data-foco", id !== null && b.dataset.personaBarra === id);
      for (const f of el.querySelectorAll<HTMLElement>(".tv-fila[data-fila]")) f.toggleAttribute("data-foco", id !== null && f.dataset.fila === id);
    };
    const sobre = (e: PointerEvent) => {
      const t = e.target as Element | null;
      const fila = t?.closest?.<HTMLElement>(".tv-fila[data-fila]");
      const persona = t?.closest?.<HTMLElement>("[data-persona]");
      poner(fila?.dataset.fila ?? persona?.dataset.persona ?? null);
    };
    const fuera = () => poner(null);
    el.addEventListener("pointerover", sobre, { passive: true });
    el.addEventListener("pointerleave", fuera, { passive: true });
    return () => {
      el.removeEventListener("pointerover", sobre);
      el.removeEventListener("pointerleave", fuera);
    };
  }, [raiz]);
}
