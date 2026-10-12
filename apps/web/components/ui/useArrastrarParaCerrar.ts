"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Cuánto hay que bajar la hoja (px) para que al soltarla se cierre; menos que esto vuelve a su lugar. */
const UMBRAL = 110;
/** O un tirón rápido (px/ms) aunque sea corto. */
const VELOCIDAD = 0.6;
/** Lo que se mueve el dedo antes de decidir si es arrastrar la hoja o desplazar su contenido. */
const ARRANQUE = 8;
const MS_SALIDA = 220;

type Opciones = {
  activo: boolean;
  /** Al soltar pasado el umbral. `true`: la hoja sale y después llega `alSalir`. `false`: vuelve a su lugar (p. ej. hay algo sin
   *  guardar y se pregunta primero). */
  alSoltar: () => boolean;
  /** Cuando la hoja ya terminó de salir por abajo. */
  alSalir: () => void;
};

/**
 * Bajar con el dedo una hoja que sube desde abajo la cierra, como en el iPhone (2026-10-08, Existencias en el celular): la hoja
 * tenía su asa pero no se podía arrastrar, y el gesto desplazaba la pantalla de atrás.
 *
 * Solo bajo `sm` (en escritorio la misma pieza es un cajón lateral). Si el dedo empieza dentro de una lista que ya se bajó, primero
 * sube la lista: la hoja se arrastra solo cuando lo de adentro está arriba del todo. Mueve la hoja con `translate` y no con
 * `transform`, porque la animación de entrada deja su `transform` fijado (`both`) y le ganaría a un estilo en línea.
 */
export function useArrastrarParaCerrar<T extends HTMLElement>(hoja: RefObject<T | null>, opciones: Opciones) {
  const actual = useRef(opciones);
  useEffect(() => {
    actual.current = opciones;
  });

  useEffect(() => {
    if (!opciones.activo) return;

    // La hoja se lee al tocar, no al montar: el portal de Radix la monta un render después de este efecto.
    let el: T | null = null;
    let inicioY = 0;
    let inicioT = 0;
    let dy = 0;
    let estado: "nada" | "decidiendo" | "arrastrando" | "contenido" = "nada";
    let scroller: HTMLElement | null = null;

    const mover = (px: number, conTransicion: boolean) => {
      if (!el) return;
      el.style.transition = conTransicion ? `translate ${MS_SALIDA}ms var(--ease-cayla)` : "none";
      el.style.translate = px === 0 ? "" : `0 ${px}px`;
    };

    const alTocar = (e: TouchEvent) => {
      el = hoja.current;
      if (!el || !el.contains(e.target as Node) || e.touches.length !== 1 || !window.matchMedia("(max-width: 639.98px)").matches) return;
      inicioY = e.touches[0].clientY;
      inicioT = e.timeStamp;
      dy = 0;
      estado = "decidiendo";
      // La lista desplazable más cercana al dedo (dentro de la hoja): si ya se bajó, el gesto es suyo.
      scroller = null;
      for (let n = e.target as HTMLElement | null; n && n !== el; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) {
          scroller = n;
          break;
        }
      }
    };

    const alMover = (e: TouchEvent) => {
      if (estado === "nada" || estado === "contenido") return;
      const d = e.touches[0].clientY - inicioY;
      if (estado === "decidiendo") {
        if (Math.abs(d) < ARRANQUE) return;
        if (d > 0 && (!scroller || scroller.scrollTop <= 0)) estado = "arrastrando";
        else return void (estado = "contenido");
      }
      // Arrastrando: la página no se mueve (ni rebota) y la hoja sigue al dedo, sin subir más allá de su lugar.
      e.preventDefault();
      dy = Math.max(0, d - ARRANQUE);
      mover(dy, false);
    };

    const alSoltarDedo = (e: TouchEvent) => {
      if (estado !== "arrastrando") return void (estado = "nada");
      estado = "nada";
      const h = el;
      if (!h) return;
      const rapido = dy / Math.max(1, e.timeStamp - inicioT) > VELOCIDAD && dy > 40;
      if ((dy > UMBRAL || rapido) && actual.current.alSoltar()) {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return actual.current.alSalir();
        h.style.transition = `translate ${MS_SALIDA}ms var(--ease-salida), opacity ${MS_SALIDA}ms var(--ease-salida)`;
        h.style.translate = "0 100%";
        h.style.opacity = "0";
        window.setTimeout(() => actual.current.alSalir(), MS_SALIDA);
        return;
      }
      mover(0, true);
    };

    document.addEventListener("touchstart", alTocar, { passive: true });
    document.addEventListener("touchmove", alMover, { passive: false });
    document.addEventListener("touchend", alSoltarDedo);
    document.addEventListener("touchcancel", alSoltarDedo);
    return () => {
      document.removeEventListener("touchstart", alTocar);
      document.removeEventListener("touchmove", alMover);
      document.removeEventListener("touchend", alSoltarDedo);
      document.removeEventListener("touchcancel", alSoltarDedo);
    };
  }, [hoja, opciones.activo]);
}
