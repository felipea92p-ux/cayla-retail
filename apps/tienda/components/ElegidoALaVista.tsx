"use client";

import { useEffect } from "react";

/**
 * En el celular, las filas de píldoras del catálogo se deslizan de lado: al llegar, la elegida queda a la vista (sin esto, con «Abajo»
 * elegido, la fila empezaba en «Todo» y lo elegido quedaba escondido a la derecha). Solo mueve la fila, nunca la página.
 */
export function ElegidoALaVista({ selector }: { selector: string }) {
  useEffect(() => {
    for (const fila of document.querySelectorAll<HTMLElement>(selector)) {
      const elegido = fila.querySelector<HTMLElement>('[aria-current="true"]');
      if (!elegido || fila.scrollWidth <= fila.clientWidth) continue;
      const dentro = elegido.getBoundingClientRect().left - fila.getBoundingClientRect().left + fila.scrollLeft;
      fila.scrollLeft = Math.max(0, dentro - (fila.clientWidth - elegido.offsetWidth) / 2);
    }
  });
  return null;
}
