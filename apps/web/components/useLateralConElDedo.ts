"use client";

import { useEffect, useRef, type RefObject } from "react";
import { CELULAR } from "@/components/ui/useEnCelular";
import { alejarFondo, devolverFondo, moverFondo } from "@/components/ui/fondoDeLaHoja";
import { cierraElLateral, decidirLado, posicionDelLateral, velocidad, type Muestra } from "@/lib/hoja-gesto";
import { prefiereQuieto } from "@/lib/movimiento-cliente";

/** Lo que no se arrastra aunque el dedo vaya de lado: escribir o mover un deslizador. */
const NO_ARRASTRA = 'input, textarea, select, [contenteditable="true"], [role="slider"]';

/** Lo que tarda el cajón en llegar y en irse (`.cajon-lateral`, globals.css): lo de atrás se aleja y vuelve con él. */
const MS_ENTRADA = 420;
const MS_SALIDA = 260;

/**
 * El menú lateral del celular se cierra deslizándolo hacia la izquierda (ADR-0479, actividad 11), como el cajón de cualquier
 * app: el menú sigue al dedo, el velo se aclara en la misma proporción y, al soltar, se va (pasado un tercio o de un tirón) o
 * vuelve a su lugar. Un dedo que va de arriba abajo sigue desplazando el menú. Al soltar, los estilos en línea se quitan y la
 * transición de siempre (`.cajon-lateral`, globals.css) lo lleva desde donde quedó: 260 ms al irse, 420 ms al volver.
 *
 * Abierto, aleja lo de atrás de costado («A · Hoja con profundidad», Felipe 2026-11-01; `alejarFondo(…, "lado")`, el mismo
 * mecanismo de las hojas del celular), y mientras el dedo lo lleva, el velo y el alejamiento siguen la MISMA proporción que el
 * menú: con el menú al 60 % fuera, el velo y el alejamiento van al 40 %. Con «reducir movimiento», lo de atrás no se mueve.
 */
export function useLateralConElDedo(aside: RefObject<HTMLElement | null>, velo: RefObject<HTMLElement | null>, abierto: boolean, cerrar: () => void) {
  const alCerrar = useRef(cerrar);
  useEffect(() => {
    alCerrar.current = cerrar;
  });
  useEffect(() => {
    const el = aside.current;
    if (!el || !abierto) return;
    const mover = window.matchMedia(CELULAR).matches && !prefiereQuieto();
    const fondo = mover ? alejarFondo(MS_ENTRADA, "lado") : null;
    let gesto: { x0: number; y0: number; deLado: boolean; muestras: Muestra[] } | null = null;

    const pintar = (x: number) => {
      el.style.transition = "none";
      el.style.transform = `translate3d(${x}px, 0, 0)`;
      // Cuánto del menú se fue (0 abierto, 1 cerrado): el velo y lo de atrás lo siguen en la misma proporción.
      const fuera = Math.min(1, Math.max(0, -x / el.offsetWidth));
      const v = velo.current;
      if (v) {
        v.style.transition = "none";
        v.style.opacity = String(1 - fuera);
      }
      moverFondo(fondo, fuera, 0);
    };
    const soltarEstilos = () => {
      el.style.transition = "";
      el.style.transform = "";
      const v = velo.current;
      if (v) {
        v.style.transition = "";
        v.style.opacity = "";
      }
    };

    const alTocar = (e: TouchEvent) => {
      gesto = null;
      if (e.touches.length !== 1 || !window.matchMedia(CELULAR).matches) return;
      const objetivo = e.target instanceof Element ? e.target : null;
      if (!objetivo || objetivo.closest(NO_ARRASTRA)) return;
      // Bajo el dedo hay algo que corre de lado: el gesto es suyo.
      for (let n: Element | null = objetivo; n && el.contains(n); n = n.parentElement) {
        if (n instanceof HTMLElement && n.scrollWidth > n.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return;
      }
      const t = e.touches[0];
      gesto = { x0: t.clientX, y0: t.clientY, deLado: false, muestras: [{ t: performance.now(), y: t.clientX }] };
    };
    const alMover = (e: TouchEvent) => {
      if (!gesto || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - gesto.x0;
      if (!gesto.deLado) {
        const d = decidirLado(dx, t.clientY - gesto.y0);
        if (d === null) return;
        if (d === "otro") {
          gesto = null;
          return;
        }
        gesto.deLado = true;
      }
      if (e.cancelable) e.preventDefault();
      gesto.muestras.push({ t: performance.now(), y: t.clientX });
      if (gesto.muestras.length > 12) gesto.muestras.shift();
      pintar(posicionDelLateral(dx));
    };
    const alSoltar = (e: TouchEvent) => {
      const g = gesto;
      gesto = null;
      if (!g?.deLado) return;
      const dx = g.muestras[g.muestras.length - 1].y - g.x0;
      const vx = e.type === "touchcancel" ? 0 : velocidad(g.muestras);
      soltarEstilos();
      if (e.type !== "touchcancel" && cierraElLateral(dx, vx, el.offsetWidth)) alCerrar.current();
      // Si se queda, lo de atrás vuelve a alejarse del todo con el menú; si se va, lo devuelve la limpieza de abajo.
      else moverFondo(fondo, 0, MS_ENTRADA);
    };

    el.addEventListener("touchstart", alTocar, { passive: true });
    el.addEventListener("touchmove", alMover, { passive: false });
    el.addEventListener("touchend", alSoltar);
    el.addEventListener("touchcancel", alSoltar);
    return () => {
      el.removeEventListener("touchstart", alTocar);
      el.removeEventListener("touchmove", alMover);
      el.removeEventListener("touchend", alSoltar);
      el.removeEventListener("touchcancel", alSoltar);
      soltarEstilos();
      // El menú se va (cerrado, un destino, «atrás», Escape): lo de atrás vuelve con él, en su tiempo y con su curva.
      devolverFondo(fondo, MS_SALIDA, "var(--ease-salida)");
    };
  }, [aside, velo, abierto]);
}
