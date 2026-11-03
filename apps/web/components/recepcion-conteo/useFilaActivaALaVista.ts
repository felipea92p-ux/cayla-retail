"use client";

import { useEffect, useRef } from "react";

/** La cabeza de la categoría abierta va pegada arriba: una fila bajo ella no se vería. */
const ALTO_CABEZA = 72;
/** Lo que tarda en abrirse una categoría: recién ahí se sabe dónde quedó la fila. */
const ABRE_MS = 430;

/**
 * Una lista con su propio scroll deja a la vista su fila activa (`data-activa`) cuando esta cambia: «Listo, siguiente» puede saltar a un modelo que quedó abajo, o abrir otra categoría.
 * Mueve solo el scroll de la lista, nunca el de la página (`scrollIntoView` podría llevarse la página entera).
 */
export function useFilaActivaALaVista<T extends HTMLElement>(...claves: readonly (string | null)[]) {
  const lista = useRef<T>(null);
  const clave = claves.join("|");
  useEffect(() => {
    const mover = () => {
      const caja = lista.current;
      const fila = caja?.querySelector<HTMLElement>("[data-activa]");
      if (!caja || !fila || fila.closest("[inert]")) return;
      const c = caja.getBoundingClientRect();
      const f = fila.getBoundingClientRect();
      if (f.top < c.top + ALTO_CABEZA) caja.scrollTop -= c.top + ALTO_CABEZA - f.top;
      else if (f.bottom > c.bottom) caja.scrollTop += f.bottom - c.bottom + 8;
    };
    const cuadro = requestAnimationFrame(mover);
    const reloj = window.setTimeout(mover, ABRE_MS);
    return () => {
      cancelAnimationFrame(cuadro);
      window.clearTimeout(reloj);
    };
  }, [clave]);
  return lista;
}
