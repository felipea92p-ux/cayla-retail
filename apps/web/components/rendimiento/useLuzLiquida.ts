"use client";

import { useEffect, type RefObject } from "react";

/**
 * La luz de las placas de Rendimiento (ADR-0610): el brillo y el filo de «Mi perfil» siguen al mouse en la placa `.liquido` que tiene debajo.
 * Nunca se mueven solos. Un solo escuchador para toda la pantalla, a un cambio por cuadro; sin mouse o con «reducir movimiento», no hace nada.
 */
export function useLuzLiquida(raiz: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !window.matchMedia?.("(hover: hover)").matches) return;
    let cuadro = 0;
    let ultimo: PointerEvent | null = null;
    const pintar = () => {
      cuadro = 0;
      const e = ultimo;
      if (!e) return;
      const placa = (e.target as Element | null)?.closest?.<HTMLElement>(".liquido");
      if (!placa) return;
      const r = placa.getBoundingClientRect();
      const x = (e.clientX - r.left) / Math.max(1, r.width);
      const y = (e.clientY - r.top) / Math.max(1, r.height);
      placa.style.setProperty("--vidrio-x", `${x * 100}%`);
      placa.style.setProperty("--vidrio-y", `${y * 100}%`);
      placa.style.setProperty("--vidrio-angulo", `${(Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI + 30}deg`);
    };
    const mover = (e: PointerEvent) => {
      ultimo = e;
      if (!cuadro) cuadro = requestAnimationFrame(pintar);
    };
    el.addEventListener("pointermove", mover, { passive: true });
    return () => {
      el.removeEventListener("pointermove", mover);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, [raiz]);
}
