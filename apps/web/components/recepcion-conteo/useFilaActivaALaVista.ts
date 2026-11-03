"use client";

import { useEffect, useRef } from "react";

/**
 * Una lista con su propio scroll deja a la vista su fila activa (`data-activa`) cuando esta cambia: «Listo, sigue …» puede saltar a un modelo que
 * quedó abajo. Mueve solo el scroll de la lista, nunca el de la página (`scrollIntoView` podría llevarse la página entera).
 */
export function useFilaActivaALaVista<T extends HTMLElement>(clave: string | null) {
  const lista = useRef<T>(null);
  useEffect(() => {
    const caja = lista.current;
    const fila = caja?.querySelector<HTMLElement>("[data-activa]");
    if (!caja || !fila) return;
    const c = caja.getBoundingClientRect();
    const f = fila.getBoundingClientRect();
    if (f.top < c.top) caja.scrollTop -= c.top - f.top + 6;
    else if (f.bottom > c.bottom) caja.scrollTop += f.bottom - c.bottom + 6;
  }, [clave]);
  return lista;
}
