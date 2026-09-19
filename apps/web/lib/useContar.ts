"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Una cifra que CAMBIÓ cuenta hasta su valor nuevo (ADR-0128): el gesto «asentar» de la capa de
 * movimiento, pero con el número mismo — el ojo nota que cambió sin releerla. Por defecto arranca en el
 * valor que llega y cuenta solo cuando algo lo mueve (registrar un proveedor, desactivar…).
 * `alMontar`: además se «arma» una vez al llegar a la pantalla, contando desde 0 (entrada escalonada de la
 * regla de globals.css, revisada el 2026-09-19). Curva de salida de potencia 3,5: arranca rápido y frena
 * largo, sin rebote. Con movimiento reducido salta al valor.
 */
export function useContar(valor: number, ms = 800, alMontar = false): number {
  const inicial = alMontar ? 0 : valor;
  const [mostrado, setMostrado] = useState(inicial);
  // Lo que REALMENTE se está mostrando (no el destino): así, si React repite el efecto (StrictMode en
  // desarrollo, o un valor que cambia a mitad de camino), el conteo arranca de donde está la cifra y no
  // cree que ya llegó. Guardar el destino aquí dejaba la cifra clavada en 0 en desarrollo.
  const enPantalla = useRef(inicial);

  useEffect(() => {
    const desde = enPantalla.current;
    if (desde === valor) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let cuadro = 0;
    if (reducido) {
      cuadro = requestAnimationFrame(() => {
        enPantalla.current = valor;
        setMostrado(valor);
      });
      return () => cancelAnimationFrame(cuadro);
    }
    const t0 = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = k === 1 ? valor : desde + (valor - desde) * (1 - Math.pow(1 - k, 3.5));
      enPantalla.current = v;
      setMostrado(v);
      if (k < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor, ms]);

  return mostrado;
}
