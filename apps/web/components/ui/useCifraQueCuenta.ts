"use client";

import { useEffect, useRef, useState } from "react";
import { valorDeLaCuenta } from "@/lib/vuelo-reglas";

/**
 * Una cifra que, al cambiar, cuenta del valor que mostraba al nuevo (el total de «Tu compra» cuando aterriza una prenda). La primera vez
 * no cuenta: muestra el valor tal cual. Con `prefers-reduced-motion`, salta directo. Una sola vez por cambio, sin rebote.
 */
export function useCifraQueCuenta(valor: number, ms = 520): number {
  const [mostrado, setMostrado] = useState(valor);
  const actual = useRef(valor);
  const sinMovimiento = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    const de = actual.current;
    if (de === valor) return;
    if (sinMovimiento) {
      actual.current = valor;
      return;
    }
    const t0 = performance.now();
    let cuadro = 0;
    const paso = (ahora: number) => {
      const x = Math.min(1, (ahora - t0) / ms);
      actual.current = valorDeLaCuenta(de, valor, x);
      setMostrado(actual.current);
      if (x < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor, ms, sinMovimiento]);
  return sinMovimiento ? valor : mostrado;
}
