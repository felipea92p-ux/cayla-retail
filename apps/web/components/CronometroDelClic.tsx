"use client";

import { useEffect, useLayoutEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { CADA_MS_MANDAR, alOcultarse, anotarMarco, mandarTiempos, soltarMarco } from "@/lib/tiempos-de-pantalla-cliente";

/**
 * El cronómetro del clic (ADR-0654), montado una vez en el marco del ERP (`app/(app)/layout.tsx`). No dibuja nada.
 *
 * Le dice al cronómetro en qué ruta y en qué sede está la pestaña: con eso la medición sabe que la pantalla nueva ya es la que se ve y
 * guarda su PATRÓN (`useParams()` dice qué partes son un id). Va en un efecto de diseño, que corre en el mismo cuadro en que Next monta la
 * ruta nueva, antes de que el cronómetro mire. Y despacha lo medido cada 30 s y al ocultar o cerrar la pestaña.
 */
export function CronometroDelClic({ sedeId }: { sedeId: string }) {
  const pathname = usePathname();
  const params = useParams();

  useLayoutEffect(() => {
    anotarMarco(pathname, params ?? {}, sedeId);
  }, [pathname, params, sedeId]);

  useEffect(() => {
    const intervalo = window.setInterval(mandarTiempos, CADA_MS_MANDAR);
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "hidden") alOcultarse();
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("pagehide", mandarTiempos);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("pagehide", mandarTiempos);
      soltarMarco();
      mandarTiempos();
    };
  }, []);

  return null;
}
