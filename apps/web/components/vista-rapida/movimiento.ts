"use client";

import { useEffect, useState } from "react";
import { useContar } from "@/lib/useContar";

/** ¿Hay un mouse de verdad y la persona no pidió menos movimiento? Los efectos que siguen al puntero (paralaje, brillo, onda) solo existen con esto: en un
 *  celular no hay puntero que seguir, y con «reducir movimiento» (prefers-reduced-motion) no se mueve nada que no sea una respuesta directa. */
export function hayPunteroFino(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Una cifra que cuenta desde 0 hasta su valor, pero ESPERA `retrasoMs` antes de empezar: las celdas de la matriz entran en ola (cada una
 * a su hora) y su número tiene que empezar a contar cuando la celda aparece, no antes. Con `valor` nulo (todavía no se lee) dice «—»,
 * nunca un 0 que no es cierto. Con movimiento reducido, `useContar` salta al valor.
 */
export function useCifraConRetraso(valor: number | null, retrasoMs: number, ms = 600): string {
  const [lista, setLista] = useState(retrasoMs === 0);
  useEffect(() => {
    if (retrasoMs === 0) return;
    const t = setTimeout(() => setLista(true), retrasoMs);
    return () => clearTimeout(t);
  }, [retrasoMs]);
  const mostrada = useContar(lista && valor !== null ? valor : 0, ms, retrasoMs === 0);
  return valor === null ? "—" : Math.round(mostrada).toLocaleString("es-PE");
}
