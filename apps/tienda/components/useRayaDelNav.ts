"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

// «La raya que viaja» (ADR-0524, Felipe 2026-10-26; la maqueta, `moverRaya`): la cabecera tiene UNA raya bajo la pestaña de la sección donde se está. Al tocar otra
// pestaña (la cabecera ya la marca mientras llega la página: `useCamino`), la raya corre de la palabra de antes a la nueva —`left` y `width` con su transición
// de `cabecera.css`— y, a la vez, la página entra de lado (`vistas.css`). La primera vez que se dibuja (o al cambiar el ancho de la ventana o llegar las letras) se coloca
// de una vez, sin recorrido. Sin pestaña marcada (una ficha, la bolsa) no se ve.

/** El nombre de la sección activa o null; solo sirve para saber CUÁNDO volver a colocar la raya. */
export function useRayaDelNav(nav: RefObject<HTMLElement | null>, activa: string | null | undefined): void {
  const colocada = useRef(false);

  const colocar = (animado: boolean) => {
    const el = nav.current;
    const raya = el?.querySelector<HTMLElement>(":scope > .t-raya");
    if (!el || !raya) return;
    const marcada = el.querySelector<HTMLElement>('.t-nav-b[aria-current="page"]');
    if (!marcada) {
      raya.dataset.oculta = "";
      return;
    }
    delete raya.dataset.oculta;
    if (!animado) raya.style.transition = "none";
    raya.style.setProperty("--x", `${marcada.offsetLeft}px`);
    raya.style.setProperty("--w", `${marcada.offsetWidth}px`);
    if (!animado) {
      // Un cuadro después vuelve la transición: la próxima vez sí corre.
      requestAnimationFrame(() => {
        raya.style.transition = "";
      });
    }
  };

  // Al cambiar la pestaña marcada: recorrido (salvo la primera vez, que se coloca de una vez).
  useLayoutEffect(() => {
    colocar(colocada.current);
    colocada.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `colocar` solo lee el DOM de la cabecera; lo que la hace volver a correr es la pestaña activa.
  }, [activa]);

  // Si cambia el ancho de la ventana o llegan las letras (los enlaces cambian de ancho), se vuelve a colocar sin recorrido.
  useEffect(() => {
    const otra = () => colocar(false);
    window.addEventListener("resize", otra);
    void document.fonts?.ready.then(otra);
    return () => window.removeEventListener("resize", otra);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ídem.
  }, []);
}

/**
 * Hacia dónde va el recorrido al tocar una pestaña (ADR-0524): 1 si la nueva está a la derecha de la de antes (o si no había una marcada), -1 si está a la izquierda. La página
 * de antes sale hacia el lado contrario y la nueva entra desde este (`vistas.css`). Lo guarda en la página (`--dir` y `data-viaja`) hasta que empieza la transición de vista.
 */
export function marcarViaje(nav: HTMLElement | null, tocada: Element | null): void {
  if (!nav || !tocada) return;
  const pestanas = [...nav.querySelectorAll<HTMLElement>(".t-nav-b")];
  const de = pestanas.findIndex((p) => p.getAttribute("aria-current") === "page");
  const a = pestanas.indexOf(tocada as HTMLElement);
  if (a < 0 || a === de) return;
  viajaHacia(de < 0 || a > de ? 1 : -1);
}

/** Pone en la página la dirección del viaje; `Marca` (`Vistas.tsx`) la quita cuando la transición ya empezó. */
export function viajaHacia(dir: 1 | -1): void {
  const raiz = document.documentElement;
  raiz.style.setProperty("--dir", String(dir));
  raiz.dataset.viaja = "";
}

/** Quita la dirección del viaje de la página. */
export function terminaElViaje(): void {
  const raiz = document.documentElement;
  delete raiz.dataset.viaja;
  raiz.style.removeProperty("--dir");
}
