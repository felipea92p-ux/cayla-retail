"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  VENTANA_TRAS_CLIC_MS,
  esChangeInmediatoAlClic,
  esContinuacionDeTecleo,
  puedeSoltar,
  reservaNecesaria,
  type Medida,
} from "@/lib/pagina-estable-reglas";

/* ====================================================================
   PaginaEstable · la página no se encoge bajo el mouse (ADR-0185)

   Montado UNA vez en `app/layout.tsx`, como el loader general. Ninguna pantalla tiene que hacer nada: después de
   cada clic, `change` (un select, una casilla) o tecla escrita en un buscador, vigila el contenedor que se
   desplaza —la página o la ventana (`<Modal>`) donde ocurrió— y, si el navegador tuvo que recortar el scroll
   porque el contenido se acortó, reserva ese alto como aire al fondo y devuelve la vista adonde estaba.

   Dos redes, no una (2026-09-25). La primera revisión ocurre en un `queueMicrotask` disparado en el mismo tick
   del evento: cubre el caso más común —React ya repintó de forma síncrona (cerrar un panel, quitar una fila)— y
   se adelanta al `ResizeObserver`, que entrega sus avisos alineados a un cuadro de render y, medido, puede tardar
   varios cuadros más de lo que su nombre promete. El `ResizeObserver` sigue de guardia como red de seguridad para
   lo que tarda más que un tick (una animación de salida, un `fetch`, el filtrado con demora de un buscador).

   La reserva se suelta sola apenas queda fuera de la vista. La regla (qué es un recorte, qué es un scroll que
   pidió el código, y cuándo un evento continúa una vigilancia en vez de abrir otra) vive en
   `lib/pagina-estable-reglas.ts`, pura y probada.

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
      if (esChangeInmediatoAlClic(e.type, vigilancia ? performance.now() - vigilancia.inicio : null)) return;
      const contenedor = contenedorDe(e.target instanceof Element ? e.target : null);
      // Ráfaga de tecleo (buscador con filtrado en vivo): no reabrir vigilancia con cada letra —se perdería la
      // foto de «antes de escribir»— solo estirar el plazo. La vigilancia ya abierta (por la primera letra) sigue
      // corriendo su propio ResizeObserver y su propio microtask ya disparado; no hace falta otro por tecla.
      if (vigilancia && esContinuacionDeTecleo(e.type, true, vigilancia.contenedor === contenedor)) {
        window.clearTimeout(vigilancia.fin);
        vigilancia.fin = window.setTimeout(terminarVigilancia, VENTANA_TRAS_CLIC_MS);
        return;
      }
      terminarVigilancia();
      const ro = new ResizeObserver(revisar);
      // La página: el `body` cambia de alto con todo lo que hay dentro. Una ventana: ella y sus hijos directos
      // (su propio alto no cambia mientras el contenido pase del tope; el de sus hijos sí).
      if (esPagina(contenedor)) ro.observe(document.body);
      else [contenedor, ...Array.from(contenedor.children)].forEach((n) => ro.observe(n));
      vigilancia = { contenedor, alClic: medir(contenedor), url: location.href, ro, fin: window.setTimeout(terminarVigilancia, VENTANA_TRAS_CLIC_MS), inicio: performance.now() };
      // Primera red (ver comentario de arriba del archivo): si React ya repintó de forma síncrona en este mismo
      // tick, este microtask lo detecta y corrige ANTES de que el navegador llegue a pintar la posición recortada
      // — medido: el ResizeObserver por sí solo puede tardar varios cuadros más. `revisar` no hace nada si
      // `reservaNecesaria` da 0 (nada se acortó todavía, o no hacía falta reservar), así que no cuesta de más
      // cuando la interacción no toca el alto de nada — el caso de casi todos los clics del sistema.
      queueMicrotask(revisar);
    }

    // Una navegación empieza arriba y sin reserva.
    alNavegar.current = () => {
      terminarVigilancia();
      soltar();
    };
    const alVolver = () => alNavegar.current();

    document.addEventListener("click", alInteractuar, true);
    document.addEventListener("change", alInteractuar, true);
    document.addEventListener("input", alInteractuar, true);
    window.addEventListener("popstate", alVolver);
    return () => {
      document.removeEventListener("click", alInteractuar, true);
      document.removeEventListener("change", alInteractuar, true);
      document.removeEventListener("input", alInteractuar, true);
      window.removeEventListener("popstate", alVolver);
      terminarVigilancia();
      soltar();
    };
  }, []);

  useEffect(() => alNavegar.current(), [pathname]);

  return null;
}
