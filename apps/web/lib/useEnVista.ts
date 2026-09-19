"use client";

import { useEffect, useRef, useState } from "react";

/**
 * `true` mientras el elemento esté a la vista. Entra al 40 % visible y solo se apaga cuando sale
 * entera: un scroll que lo roza no lo reinicia, pero volver a verlo repite la entrada. Lo usan las
 * tarjetas de Caja que se animan al aparecer (la dona de métodos de pago, el ritmo del día).
 * Sin `IntersectionObserver` (navegador viejo) queda en `true`, para no dejar nada oculto.
 */
export function useEnVista<T extends Element>() {
  const ref = useRef<T>(null);
  const [enVista, setEnVista] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setEnVista(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entradas) => {
        const e = entradas[entradas.length - 1];
        if (!e) return;
        if (e.intersectionRatio >= 0.4) setEnVista(true);
        else if (e.intersectionRatio === 0) setEnVista(false);
      },
      { threshold: [0, 0.4] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, enVista };
}
