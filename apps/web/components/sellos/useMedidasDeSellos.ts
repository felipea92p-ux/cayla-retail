"use client";

import { useLayoutEffect, useState } from "react";
import { columnasQueCaben } from "@/lib/sellos-pases";

/**
 * Una medida de la pantalla que depende de su ancho y que el CSS ya decide —así nunca hay dos cuentas distintas—: se vuelve a leer
 * cada vez que el elemento cambia de ancho. `inicial` es lo que se supone antes de medir (en el servidor no hay ancho).
 */
function useMedida<T extends HTMLElement>(leer: (el: T) => number, inicial: number) {
  const [elemento, setElemento] = useState<T | null>(null);
  const [valor, setValor] = useState(inicial);
  useLayoutEffect(() => {
    if (!elemento) return;
    const medir = () => {
      const v = leer(elemento);
      if (Number.isFinite(v) && v > 0) setValor(v);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [elemento, leer]);
  return [setElemento, valor] as const;
}

// Las dos se leen de variables del CSS (sellos.css), que cambian con la consulta de contenedor `sellos`: la regla vive en un solo lugar.
const columnasDeLaBilletera = (el: HTMLElement) => Number(getComputedStyle(el).getPropertyValue("--sl-columnas"));
const cupoDelLookbook = (el: HTMLElement) => {
  const estilo = getComputedStyle(el);
  return columnasQueCaben(el.clientWidth, parseFloat(estilo.getPropertyValue("--sl-min")), parseFloat(estilo.getPropertyValue("--sl-hueco")));
};

/** 2 si la pila y el pase en grande van lado a lado; 1 si el ancho no alcanza y el pase en grande va bajo el pase abierto. */
export const useColumnasDeLaBilletera = () => useMedida<HTMLDivElement>(columnasDeLaBilletera, 2);

/** Cuántas prendas entran por fila en el lookbook (su grilla es `auto-fill` con `--sl-min` y `--sl-hueco`). */
export const useCupoDelLookbook = () => useMedida<HTMLDivElement>(cupoDelLookbook, 5);
