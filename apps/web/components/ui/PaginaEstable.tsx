"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { VENTANA_TRAS_CLIC_MS, puedeSoltar, reservaNecesaria, type Medida } from "@/lib/pagina-estable-reglas";

/* ====================================================================
   PaginaEstable · la página no se encoge bajo el mouse (ADR-0185)

   Montado UNA vez en `app/layout.tsx`, como el loader general. Ninguna pantalla tiene que hacer nada: después de
   cada clic (o `change` de un select/casilla) vigila el contenedor que se desplaza —la página o la ventana
   (`<Modal>`) donde ocurrió— y, si el navegador tuvo que recortar el scroll porque el contenido se acortó, reserva
   ese alto como aire al fondo y devuelve la vista adonde estaba. Todo ocurre en el `ResizeObserver`, que corre
   después del cálculo del diseño y ANTES de pintar: la persona no llega a ver el salto.

   La reserva se suelta sola apenas queda fuera de la vista. La regla (qué es un recorte y qué es un scroll que
   pidió el código) vive en `lib/pagina-estable-reglas.ts`, pura y probada.

   Lo que esto no reemplaza: un bloque que cambia de alto con cada opción (los datos de cada medio de pago) sigue
   reservando su propio lugar (`LineasPago`, `PagoPiezas`), para que ni siquiera aparezca aire.
   ==================================================================== */

type Reserva = { contenedor: Element; destino: HTMLElement; px: number; paddingInline: string };

function esPagina(el: Element) {
  return el === document.scrollingElement || el === document.documentElement || el === document.body;
}

/** El contenedor que se desplaza y contiene al elemento tocado: una ventana con scroll propio, o la página. */
function contenedorDe(el: Element | null): Element {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const estilo = getComputedStyle(n);
    // Una lista flotante (`fixed`: la de un combo) tiene scroll propio, pero lo que se acorta es lo de detrás.
    if (estilo.position === "fixed") continue;
    const oy = estilo.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return document.scrollingElement ?? document.documentElement;
}

function medir(c: Element): Medida {
  return esPagina(c)
    ? { arriba: window.scrollY, alto: document.documentElement.scrollHeight, visible: window.innerHeight }
    : { arriba: c.scrollTop, alto: c.scrollHeight, visible: c.clientHeight };
}

function llevarA(c: Element, arriba: number) {
  if (esPagina(c)) window.scrollTo({ top: arriba, behavior: "instant" });
  else c.scrollTop = arriba;
}

export function PaginaEstable() {
  const pathname = usePathname();
  const alNavegar = useRef<() => void>(() => {});

  useEffect(() => {
    let reserva: Reserva | null = null;
    let vigilancia: { contenedor: Element; alClic: Medida; url: string; ro: ResizeObserver; fin: number; inicio: number } | null = null;

    function soltar() {
      if (!reserva) return;
      reserva.destino.style.paddingBottom = reserva.paddingInline;
      reserva.contenedor.removeEventListener("scroll", alDesplazar);
      if (esPagina(reserva.contenedor)) window.removeEventListener("scroll", alDesplazar);
      reserva = null;
    }

    function alDesplazar() {
      if (reserva && puedeSoltar(medir(reserva.contenedor), reserva.px)) soltar();
    }

    function revisar() {
      if (!vigilancia) return;
      const { contenedor, alClic, url } = vigilancia;
      if (!contenedor.isConnected) return terminarVigilancia();
      // El clic fue un enlace: la pantalla nueva es otra cosa, no un bloque que se acortó.
      if (location.href !== url) return alNavegar.current();
      const ahora = medir(contenedor);
      if (reserva && reserva.contenedor === contenedor && puedeSoltar(ahora, reserva.px)) soltar();
      const falta = reservaNecesaria(alClic, ahora);
      if (falta <= 0) return;

      if (!reserva || reserva.contenedor !== contenedor) {
        soltar();
        const destino = (esPagina(contenedor) ? document.body : contenedor) as HTMLElement;
        reserva = { contenedor, destino, px: 0, paddingInline: destino.style.paddingBottom };
        (esPagina(contenedor) ? window : contenedor).addEventListener("scroll", alDesplazar, { passive: true });
      }
      reserva.px += falta;
      const base = parseFloat(getComputedStyle(reserva.destino).paddingBottom) || 0;
      reserva.destino.style.paddingBottom = `${base + falta}px`;
      llevarA(contenedor, alClic.arriba);
    }

    function terminarVigilancia() {
      if (!vigilancia) return;
      vigilancia.ro.disconnect();
      window.clearTimeout(vigilancia.fin);
      vigilancia = null;
    }

    function alInteractuar(e: Event) {
      // Un clic en una casilla dispara después su `change`, cuando React ya repintó: medir ahí tomaría la foto de
      // DESPUÉS del recorte. El `change` solo abre vigilancia propia si no viene pegado a un clic (un select con teclado).
      if (e.type === "change" && vigilancia && performance.now() - vigilancia.inicio < 300) return;
      const contenedor = contenedorDe(e.target instanceof Element ? e.target : null);
      terminarVigilancia();
      const ro = new ResizeObserver(revisar);
      // La página: el `body` cambia de alto con todo lo que hay dentro. Una ventana: ella y sus hijos directos
      // (su propio alto no cambia mientras el contenido pase del tope; el de sus hijos sí).
      if (esPagina(contenedor)) ro.observe(document.body);
      else [contenedor, ...Array.from(contenedor.children)].forEach((n) => ro.observe(n));
      vigilancia = { contenedor, alClic: medir(contenedor), url: location.href, ro, fin: window.setTimeout(terminarVigilancia, VENTANA_TRAS_CLIC_MS), inicio: performance.now() };
    }

    // Una navegación empieza arriba y sin reserva.
    alNavegar.current = () => {
      terminarVigilancia();
      soltar();
    };
    const alVolver = () => alNavegar.current();

    document.addEventListener("click", alInteractuar, true);
    document.addEventListener("change", alInteractuar, true);
    window.addEventListener("popstate", alVolver);
    return () => {
      document.removeEventListener("click", alInteractuar, true);
      document.removeEventListener("change", alInteractuar, true);
      window.removeEventListener("popstate", alVolver);
      terminarVigilancia();
      soltar();
    };
  }, []);

  useEffect(() => alNavegar.current(), [pathname]);

  return null;
}
