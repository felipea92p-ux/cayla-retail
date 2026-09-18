"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cuenta desde 0 hasta `valor` cuando `valor` cambia (KPI de Caja/Vender que
 * "carga" con una animación de conteo, a diferencia de `.anim-asentar` —que
 * asienta un número que YA cambió, no lo cuenta desde cero). Quien pidió
 * menos movimiento (`prefers-reduced-motion`) ve el número final de una,
 * igual que el resto de animaciones del sistema (ver `globals.css`).
 */
export function useCountUp(valor: number, duracionMs = 700): number {
  // Arranca en 0: el primer render (montaje) tiene que animar 0→valor, no
  // solo los cambios posteriores — si `mostrado` empezara en `valor`, la
  // carga inicial nunca contaría.
  const [mostrado, setMostrado] = useState(0);
  const anterior = useRef(0);

  useEffect(() => {
    const desde = anterior.current;
    const hasta = valor;
    anterior.current = valor;
    if (desde === hasta) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- salto directo al valor final, no hay cascada: es la única escritura de este efecto en esta rama.
      setMostrado(hasta);
      return;
    }

    let marco: number;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracionMs);
      // ease-out cúbico: arranca rápido, frena llegando — igual de espíritu
      // que `--ease-cayla`, sin depender de la curva CSS dentro de un rAF.
      const avance = 1 - Math.pow(1 - t, 3);
      setMostrado(desde + (hasta - desde) * avance);
      if (t < 1) marco = requestAnimationFrame(paso);
    };
    marco = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(marco);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return mostrado;
}
