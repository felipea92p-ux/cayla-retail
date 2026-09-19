"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Una cifra que CAMBIÓ cuenta hasta su valor nuevo (ADR-0122): el gesto «asentar» de la capa de
 * movimiento, pero con el número mismo — el ojo nota que cambió sin releerla. Arranca en el valor que
 * llega (no en 0): al abrir la pantalla la cifra ya está, no viaja (regla de globals.css: nada se anima
 * solo al entrar); cuenta solo cuando la persona hizo algo que la movió (registrar un proveedor, desactivar…).
 * Curva de salida de potencia 3,5: arranca rápido y frena largo, sin rebote. Con movimiento reducido salta.
 */
export function useContar(valor: number, ms = 800): number {
  const [mostrado, setMostrado] = useState(valor);
  const actual = useRef(valor);
  const cuadro = useRef(0);

  useEffect(() => {
    const desde = actual.current;
    if (desde === valor) return;
    actual.current = valor;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(cuadro.current);
    if (reducido) {
      cuadro.current = requestAnimationFrame(() => setMostrado(valor));
      return;
    }
    const t0 = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setMostrado(desde + (valor - desde) * (1 - Math.pow(1 - k, 3.5)));
      if (k < 1) cuadro.current = requestAnimationFrame(paso);
    };
    cuadro.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro.current);
  }, [valor, ms]);

  return mostrado;
}
