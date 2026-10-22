"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  decidirGesto,
  destinoAlSoltar,
  duracionHacia,
  posicionAlArrastrar,
  progresoDeCierre,
  velocidad,
  type Muestra,
} from "@/lib/hoja-gesto";

/** Debe coincidir con la regla «HOJA DEL CELULAR» de globals.css: solo bajo 640 px la hoja va pegada abajo. */
const CELULAR = "(max-width: 639.98px)";

/** Lo que no arrastra la hoja aunque el dedo baje encima: escribir, elegir en una lista abierta, mover un deslizador. */
const NO_ARRASTRA = 'input, textarea, select, [contenteditable="true"], [role="slider"], [data-capa-flotante] > *, [data-sin-arrastre]';

type Opciones = {
  /** La hoja tiene cara (no la cámara, que es pantalla completa). */
  activo: boolean;
  /** Guardando sin token: la hoja oye el dedo pero no se va, igual que Escape, el velo y la ✕. */
  bloqueado: boolean;
  /** El velo de la hoja: se aclara en la misma proporción en que baja la hoja. */
  velo: RefObject<HTMLElement | null>;
  /** Soltada para cerrar: decide (pregunta «¿Salir sin guardar?» o no) y, si se cierra, llama a `salir`, ahora o después. */
  alSoltarParaCerrar: (salir: () => void) => void;
  /** La hoja ya va saliendo con el dedo y llega abajo en `ms`: quien la abrió la desmonta sin su animación de salida. */
  alSalir: (ms: number) => void;
  /** Cada vez que la hoja se mueve: cuánto de ella se fue (0 abierta, 1 cerrada) y en cuántos ms llega. Lo usa lo de atrás. */
  alMoverse?: (progreso: number, ms: number) => void;
};

type Gesto = { x0: number; y0: number; eje: "hoja" | null; muestras: Muestra[]; corredores: HTMLElement[]; y: number };

/**
 * La hoja del celular sigue al dedo (ADR-0479). Devuelve un ref de callback ESTABLE para el `Dialog.Content`: los
 * listeners se ponen una vez por hoja y un nuevo render no corta un arrastre a la mitad (la hoja de Registrar gasto
 * se redibuja ~100 veces por segundo). Las reglas de cuándo y a dónde viven puras en `lib/hoja-gesto.ts`.
 *
 * Mueve la hoja y el velo escribiendo el estilo directo (sin estado de React: un dedo dispara un evento por cuadro) y
 * con `!important`, porque una animación CSS en curso (la entrada de la hoja, el velo con `both`) le gana a un estilo en
 * línea normal pero no a uno importante. Al volver a su lugar suelta todo y la hoja queda con sus clases de siempre.
 *
 * Solo con el dedo y bajo 640 px: en escritorio y en tablet, donde la hoja va arriba y al centro, no hace nada.
 */
export function useHojaArrastre(opciones: Opciones) {
  const op = useRef(opciones);
  useEffect(() => {
    op.current = opciones;
  });
  const quitar = useRef<(() => void) | null>(null);

  return useCallback((hoja: HTMLElement | null) => {
    quitar.current?.();
    quitar.current = null;
    if (!hoja) return;

    let g: Gesto | null = null;
    let alto = 0;
    let yAhora = 0;
    let vSoltada = 0;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const sinMovimiento = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const pintar = (y: number, ms = 0) => {
      yAhora = y;
      const transicion = ms ? `${ms}ms var(--ease-cayla)` : "";
      hoja.style.setProperty("transition", transicion ? `transform ${transicion}` : "none", "important");
      hoja.style.setProperty("transform", `translate3d(0, ${y}px, 0)`, "important");
      const progreso = progresoDeCierre(y, alto);
      const velo = op.current.velo.current;
      if (velo) {
        velo.style.setProperty("transition", transicion ? `opacity ${transicion}` : "none", "important");
        velo.style.setProperty("opacity", String(1 - progreso), "important");
      }
      op.current.alMoverse?.(progreso, ms);
    };
    const soltarEstilos = () => {
      for (const el of [hoja, op.current.velo.current]) {
        el?.style.removeProperty("transition");
        el?.style.removeProperty("transform");
        el?.style.removeProperty("opacity");
      }
      yAhora = 0;
    };
    const volver = (vy: number) => {
      const ms = sinMovimiento() ? 0 : duracionHacia(yAhora, vy);
      pintar(0, ms);
      reloj = setTimeout(soltarEstilos, ms + 20);
    };
    // Puede llegar tarde: después de «¿Salir sin guardar?» → «Salir», con la hoja ya de vuelta en su lugar.
    const salir = () => {
      clearTimeout(reloj);
      alto = alto || hoja.offsetHeight;
      const ms = sinMovimiento() ? 0 : duracionHacia(alto - yAhora, vSoltada);
      vSoltada = 0;
      pintar(alto, ms);
      op.current.alSalir(ms);
    };

    const alTocar = (e: TouchEvent) => {
      g = null;
      if (!op.current.activo || e.touches.length !== 1 || !window.matchMedia?.(CELULAR).matches) return;
      const objetivo = e.target instanceof Element ? e.target : null;
      if (!objetivo || objetivo.closest(NO_ARRASTRA)) return;
      // Lo que corre bajo el dedo, de adentro hacia la hoja: si algo no está arriba del todo, bajar el dedo es desplazarlo.
      const corredores: HTMLElement[] = [];
      for (let el: Element | null = objetivo; el && hoja.contains(el); el = el.parentElement) {
        if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) corredores.push(el);
      }
      const t = e.touches[0];
      alto = hoja.offsetHeight;
      g = { x0: t.clientX, y0: t.clientY, eje: null, muestras: [{ t: performance.now(), y: t.clientY }], corredores, y: yAhora };
    };

    const alMover = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (g.eje === null) {
        const arriba = g.corredores.every((c) => c.scrollTop <= 0);
        // Mientras se decide, un dedo que baja con todo arriba no se le entrega al navegador: si empieza su gesto, no lo suelta.
        if (dy > 0 && arriba && e.cancelable) e.preventDefault();
        const eje = decidirGesto(dx, dy, arriba);
        if (eje === null) return;
        if (eje === "contenido") {
          g = null;
          return;
        }
        g.eje = "hoja";
        // Si venía volviendo a su lugar, el dedo la toma donde va; los estilos se sueltan al terminar este gesto.
        clearTimeout(reloj);
        hoja.setAttribute("data-arrastrando", "");
      }
      if (e.cancelable) e.preventDefault();
      g.muestras.push({ t: performance.now(), y: t.clientY });
      if (g.muestras.length > 12) g.muestras.shift();
      pintar(posicionAlArrastrar(g.y, dy, op.current.bloqueado));
    };

    const alSoltar = (e: TouchEvent) => {
      const gesto = g;
      g = null;
      if (!gesto || gesto.eje !== "hoja") return;
      hoja.removeAttribute("data-arrastrando");
      const vy = e.type === "touchcancel" ? 0 : velocidad(gesto.muestras);
      const destino = op.current.bloqueado ? 0 : destinoAlSoltar(yAhora, gesto.y, [0, alto], vy);
      if (destino >= alto) {
        vSoltada = vy;
        let salio = false;
        op.current.alSoltarParaCerrar(() => {
          salio = true;
          salir();
        });
        if (salio) return;
      }
      volver(vy);
    };

    hoja.addEventListener("touchstart", alTocar, { passive: true });
    hoja.addEventListener("touchmove", alMover, { passive: false });
    hoja.addEventListener("touchend", alSoltar);
    hoja.addEventListener("touchcancel", alSoltar);
    quitar.current = () => {
      clearTimeout(reloj);
      hoja.removeEventListener("touchstart", alTocar);
      hoja.removeEventListener("touchmove", alMover);
      hoja.removeEventListener("touchend", alSoltar);
      hoja.removeEventListener("touchcancel", alSoltar);
    };
  }, []);
}
