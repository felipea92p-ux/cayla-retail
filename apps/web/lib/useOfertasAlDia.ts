"use client";

import { useEffect, useRef } from "react";
import { firmaReleida } from "@/lib/apartar-ofertas-al-dia";
import { leerCampanas, leerOfertas } from "@/lib/usePreciosEnVivo";

/**
 * Relee cada `cadaMs` las campañas y las ofertas de hoy de la tienda y llama a `alCambiar` cuando, para las prendas de la pantalla, ya no
 * son las que la pantalla tiene (`firmaActual`). Es lo que la caja ya hace con `usePreciosEnVivo`, para Apartar (ADR-0655, casuística
 * 2026-11-16). Nunca con la pestaña oculta; una lectura que falla no llama a nada. Avisa una sola vez por cada cambio: la pantalla se rehace
 * con `router.refresh()` y la firma nueva llega con ella.
 */
export function useOfertasAlDia(ubicacionId: string, activo: boolean, varianteIds: readonly string[], firmaActual: string, alCambiar: () => void, cadaMs = 10_000) {
  const idsRef = useRef(varianteIds);
  const firmaRef = useRef(firmaActual);
  const alCambiarRef = useRef(alCambiar);
  const avisadaRef = useRef<string | null>(null);
  useEffect(() => {
    idsRef.current = varianteIds;
    firmaRef.current = firmaActual;
    alCambiarRef.current = alCambiar;
  });

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    let enCurso = false;
    const sondear = async () => {
      if (enCurso || document.visibilityState !== "visible") return;
      enCurso = true;
      try {
        const [campanas, ofertas] = await Promise.all([leerCampanas(ubicacionId), leerOfertas(ubicacionId)]);
        if (cancelado || !campanas || !ofertas) return;
        const firma = firmaReleida(idsRef.current, campanas, ofertas.grupo, ofertas.monto);
        if (firma === firmaRef.current || firma === avisadaRef.current) return;
        avisadaRef.current = firma;
        alCambiarRef.current();
      } finally {
        enCurso = false;
      }
    };
    const id = window.setInterval(sondear, cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") void sondear();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      cancelado = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo, cadaMs, ubicacionId]);
}
