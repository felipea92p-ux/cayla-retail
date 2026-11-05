"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

// El indicador de un grupo de filtros (ADR-0524, la maqueta: `indicador`): en vez de que cada opción dibuje su propia raya, hay UNA raya de 1 px bajo la opción
// elegida que se desliza hasta la nueva (`transform` y `width`, .6 s, en `catalogo.css`). Promete tres cosas: la primera vez que se dibuja, o si cambió el
// conjunto de opciones (otro grupo trae otras categorías), se coloca de una vez, sin recorrido; si lo tocado todavía está llegando (`.t-pendiente`) la raya ya
// va hacia ahí; y sin JavaScript queda la raya propia de cada opción (`.t-subcat::after`). Gemelo de `useRayaDelNav` (la raya de la cabecera), que mide desde
// la fila de la cabecera: aquí el contenedor mismo es lo posicionado.

/** La opción hacia la que va la raya: la que está llegando si hay una y, si no, la elegida. */
function objetivoDe(grupo: HTMLElement): HTMLElement | null {
  const llegando = grupo.querySelector<HTMLElement>(":scope > :has(> .t-pendiente[data-pendiente])");
  return llegando ?? grupo.querySelector<HTMLElement>(':scope > [aria-current="true"]');
}

/** Lo que identifica al conjunto de opciones (su nombre y cuántas son): si cambia, la raya no recorre porque es otra fila. */
function firma(grupo: HTMLElement): string {
  return `${grupo.getAttribute("aria-label") ?? ""}|${grupo.children.length}`;
}

/** Pone la raya bajo su opción. `memoria` guarda la firma de la última vez para saber si hay recorrido. Fuera del hook: solo toca el DOM que recibe. */
function colocarRaya(el: HTMLElement, memoria: { firma: string | null }): void {
  const raya = el.querySelector<HTMLElement>(":scope > .t-indicador");
  if (!raya) return;
  el.dataset.indicador = "";
  const marcada = objetivoDe(el);
  if (!marcada) {
    raya.dataset.oculta = "";
    return;
  }
  delete raya.dataset.oculta;
  const f = firma(el);
  const sinRecorrido = memoria.firma !== f;
  memoria.firma = f;
  if (sinRecorrido) raya.style.transition = "none";
  raya.style.setProperty("--x", `${marcada.offsetLeft}px`);
  raya.style.setProperty("--w", `${marcada.offsetWidth}px`);
  raya.style.setProperty("--y", `${marcada.offsetTop + marcada.offsetHeight - 1}px`);
  if (sinRecorrido) {
    // Un cuadro después vuelve la transición: la próxima vez sí corre.
    requestAnimationFrame(() => {
      raya.style.transition = "";
    });
  }
}

export function useIndicador(grupo: RefObject<HTMLElement | null>): void {
  const memoria = useRef<{ firma: string | null }>({ firma: null });

  // Al montar, y cada vez que cambia lo elegido, lo que está llegando o las opciones mismas.
  useLayoutEffect(() => {
    const el = grupo.current;
    if (!el) return;
    const recuerdo = memoria.current;
    colocarRaya(el, recuerdo);
    const vigia = new MutationObserver(() => colocarRaya(el, recuerdo));
    vigia.observe(el, { attributes: true, attributeFilter: ["aria-current", "data-pendiente"], childList: true, subtree: true });
    return () => vigia.disconnect();
  }, [grupo]);

  // Si cambia el ancho de la ventana o llegan las letras (las opciones cambian de ancho), se vuelve a colocar sin recorrido.
  useEffect(() => {
    const el = grupo.current;
    if (!el) return;
    const recuerdo = memoria.current;
    const otra = () => {
      recuerdo.firma = null;
      colocarRaya(el, recuerdo);
    };
    window.addEventListener("resize", otra);
    void document.fonts?.ready.then(otra);
    return () => window.removeEventListener("resize", otra);
  }, [grupo]);
}
