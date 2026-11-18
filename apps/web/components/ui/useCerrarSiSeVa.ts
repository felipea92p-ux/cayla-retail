"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Cierra un globo cuando su botón deja de verse (2026-11-18, maqueta `docs/maquetas/mejoras-componentes-2026-11/`).
 *
 *  El globo cuelga de la capa flotante (`position: fixed`) y se recoloca en cada scroll: si la persona baja una lista o una hoja con el
 *  globo abierto, el «?» se va de la vista y el globo quedaba flotando sobre otra cosa. Un `IntersectionObserver` sobre el botón (que ya
 *  descuenta lo que recortan la hoja o el panel que se desplazan) avisa cuando sale del todo, y se cierra igual que al tocar afuera: sin
 *  mover el foco. No cambia cómo se ve ni dónde se pone el globo. */
export function useCerrarSiSeVa(boton: RefObject<HTMLElement | null>, abierto: boolean, cerrar: () => void) {
  const cerrarVivo = useRef(cerrar);
  useEffect(() => {
    cerrarVivo.current = cerrar;
  });
  useEffect(() => {
    const el = boton.current;
    if (!abierto || !el || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([e]) => {
      if (e && !e.isIntersecting) cerrarVivo.current();
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [abierto, boton]);
}
