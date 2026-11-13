"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * La cuenta atrás de un aviso cuando las animaciones están apagadas (ADR-0625; 2026-11-13).
 *
 * EL PROBLEMA. El aviso de la esquina y el aviso destacado se cierran solos cuando termina la animación de su reloj (el anillo o la
 * barra que se vacía). Con las animaciones apagadas ese reloj duraba 0,01 ms y el aviso se iba al salir; el 2026-11-12 se le devolvió
 * su tiempo en `movimiento.css`, y entonces lo único que se movía en una pantalla quieta era ese anillo, repintándose 15 s DENTRO de un
 * vidrio desenfocado (`backdrop-filter`). En las Mac de las tiendas eso dejó toda la pantalla de Vender lavada y con el texto doble
 * mientras el aviso estaba a la vista.
 *
 * LA REGLA. Quieto es quieto: el anillo y la barra no se mueven (`movimiento.css` les quita la animación) y el tiempo lo cuenta este
 * temporizador, con la misma pausa que el CSS: con el mouse encima (si el aparato tiene mouse), con el foco adentro o mientras el dedo
 * lo toca. `ms` nulo (o 0) apaga la cuenta: con las animaciones encendidas manda el `animationend` de siempre.
 *
 * `zona` dice dónde mirar el mouse y el foco si no es el mismo elemento (la barra del destacado se pausa con la hoja entera).
 * `clave` reinicia la cuenta (un aviso que se transforma vuelve a contar desde el principio, como su anillo).
 */
export function useCuentaAtrasQuieta(
  ref: RefObject<HTMLElement | null>,
  ms: number | null,
  alTerminar: () => void,
  { zona, clave }: { zona?: (el: HTMLElement) => HTMLElement | null; clave?: string | number } = {},
) {
  const terminar = useRef(alTerminar);
  useEffect(() => {
    terminar.current = alTerminar;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !ms || ms <= 0) return;
    const area = zona?.(el) ?? el;
    let restante = ms;
    let inicio = 0;
    let reloj: number | undefined;
    const pausas = new Set<string>();

    const correr = () => {
      if (pausas.size > 0 || reloj !== undefined) return;
      inicio = Date.now();
      reloj = window.setTimeout(() => {
        reloj = undefined;
        terminar.current();
      }, restante);
    };
    const parar = () => {
      if (reloj === undefined) return;
      window.clearTimeout(reloj);
      reloj = undefined;
      restante = Math.max(0, restante - (Date.now() - inicio));
    };
    const pausar = (motivo: string, si: boolean) => {
      if (si) {
        pausas.add(motivo);
        parar();
      } else {
        pausas.delete(motivo);
        correr();
      }
    };

    const conMouse = window.matchMedia?.("(hover: hover)").matches ?? false;
    const entra = () => pausar("mouse", true);
    const sale = () => pausar("mouse", false);
    const enfoca = () => pausar("foco", true);
    const desenfoca = (e: FocusEvent) => pausar("foco", e.relatedTarget instanceof Node && area.contains(e.relatedTarget));
    const toca = () => pausar("dedo", true);
    const suelta = () => pausar("dedo", false);

    if (conMouse) {
      area.addEventListener("mouseenter", entra);
      area.addEventListener("mouseleave", sale);
      if (area.matches(":hover")) pausas.add("mouse");
    }
    area.addEventListener("focusin", enfoca);
    area.addEventListener("focusout", desenfoca);
    area.addEventListener("pointerdown", toca);
    area.addEventListener("pointerup", suelta);
    area.addEventListener("pointercancel", suelta);
    if (area.contains(document.activeElement)) pausas.add("foco");
    correr();

    return () => {
      window.clearTimeout(reloj);
      area.removeEventListener("mouseenter", entra);
      area.removeEventListener("mouseleave", sale);
      area.removeEventListener("focusin", enfoca);
      area.removeEventListener("focusout", desenfoca);
      area.removeEventListener("pointerdown", toca);
      area.removeEventListener("pointerup", suelta);
      area.removeEventListener("pointercancel", suelta);
    };
    // `zona` se lee una vez al montar: es la forma de la pieza, no un dato que cambie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ms, clave]);
}
