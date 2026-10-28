"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * `true` desde la primera vez que el elemento entra en pantalla (y ya no vuelve a `false`). Con esto las cosas se «arman» cuando
 * la persona las ve, no cuando carga la página. Sin `IntersectionObserver` se da por visto en el siguiente cuadro.
 */
export function useAlVerse<T extends Element>(umbral = 0.15): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const cuadro = requestAnimationFrame(() => setVisto(true));
      return () => cancelAnimationFrame(cuadro);
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisto(true);
          io.disconnect();
        }
      },
      { threshold: umbral }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [umbral]);

  return [ref, visto];
}
