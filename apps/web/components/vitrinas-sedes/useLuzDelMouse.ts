"use client";

import { useEffect, type RefObject } from "react";
import { prefiereQuieto } from "@/lib/movimiento-cliente";

/** El filo de luz, el brillo y una inclinación de menos de 1,5° siguen al mouse sin moverse solos (ADR-0136). Sin mouse, o con «reducir movimiento», el vidrio se queda quieto. Solo se inclina `.vs-vitrina`. */
export function useLuzDelMouse(raiz: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches || prefiereQuieto()) return;
    let pendiente = 0;
    const alMover = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse" || pendiente) return;
      pendiente = window.requestAnimationFrame(() => {
        pendiente = 0;
        raiz.current?.querySelectorAll<HTMLElement>("[data-luz]").forEach((el) => {
          const r = el.getBoundingClientRect();
          el.style.setProperty("--mx", `${ev.clientX - r.left}px`);
          el.style.setProperty("--my", `${ev.clientY - r.top}px`);
          if (!el.classList.contains("vs-vitrina")) return;
          const dentro = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom && !el.querySelector(".edita");
          el.style.setProperty("--rx", dentro ? `${((ev.clientY - r.top) / r.height - 0.5) * -2.4}deg` : "0deg");
          el.style.setProperty("--ry", dentro ? `${((ev.clientX - r.left) / r.width - 0.5) * 2.4}deg` : "0deg");
        });
      });
    };
    window.addEventListener("pointermove", alMover, { passive: true });
    return () => {
      window.removeEventListener("pointermove", alMover);
      window.cancelAnimationFrame(pendiente);
    };
  }, [raiz]);
}
