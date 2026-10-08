"use client";

import { useEffect, type RefObject } from "react";

/** Menos que esto no es un teclado (la barra de Safari que aparece o se esconde mueve el alto unos 50–80 px). Igual que en `useHojaSobreElTeclado`. */
const MIN_TECLADO = 120;
/** El aire que pide la lista debajo del campo: unas cinco opciones. */
const AIRE_LISTA = 220;
/** Sin `scroll-margin-top` en el campo, lo que se deja arriba de él: su título. */
const MARGEN_POR_DEFECTO = 48;

/**
 * Con el teclado del celular abierto, sube el campo de un combo hasta arriba de la hoja para que su lista tenga lugar
 * debajo (2026-10-08, Vender ▸ Prenda sin registrar).
 *
 * Con el teclado arriba, lo visible de una hoja son unos 400 px. Si el campo quedaba a media hoja, la lista tenía aire
 * para una opción y media (o se abría hacia arriba tapando lo que la persona acababa de leer). Aquí, mientras la lista
 * está abierta y hay teclado, la caja que se desplaza (la hoja) corre lo justo para dejar el campo arriba, con su título
 * a la vista: lo que se deja arriba lo dice el `scroll-margin-top` del campo (una hoja con algo pegado arriba lo agranda).
 *
 * Solo actúa con teclado en pantalla: en escritorio no mueve nada (ADR-0185, la vista no se mueve sola bajo el mouse).
 * Solo desplaza una caja con scroll propio, nunca la página. Se ajusta al abrir y cada vez que el área visible cambia de
 * alto (el teclado sube después del foco); si la persona desplaza la hoja con la lista abierta, no se la devuelve.
 */
export function useAireParaLaLista(campo: RefObject<HTMLElement | null>, abierto: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!abierto || !vv) return;

    const ajustar = () => {
      const el = campo.current;
      if (!el || vv.scale > 1.01 || window.innerHeight - vv.height < MIN_TECLADO) return;
      const caja = cajaQueSeDesplaza(el);
      if (!caja) return;
      const r = el.getBoundingClientRect();
      const c = caja.getBoundingClientRect();
      const piso = Math.min(c.bottom, vv.offsetTop + vv.height);
      if (piso - r.bottom >= AIRE_LISTA) return;
      const margen = parseFloat(getComputedStyle(el).scrollMarginTop) || MARGEN_POR_DEFECTO;
      const delta = r.top - (Math.max(c.top, vv.offsetTop) + margen);
      if (delta > 1) caja.scrollTop += delta;
    };

    const cuadro = requestAnimationFrame(ajustar);
    vv.addEventListener("resize", ajustar);
    return () => {
      cancelAnimationFrame(cuadro);
      vv.removeEventListener("resize", ajustar);
    };
  }, [abierto, campo]);
}

/** El ancestro más cercano con scroll vertical propio (la hoja de un modal); `null` si el que se desplaza es la página. */
function cajaQueSeDesplaza(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}
