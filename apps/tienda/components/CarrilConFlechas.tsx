"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icono } from "./Icono";

/**
 * Un carril que se desliza de lado (su primer hijo), con dos flechas para el mouse. En la computadora el carril no muestra su barra de
 * desplazamiento: sin flechas, lo que no cabía no se podía ver con un mouse (el primer día, 27 categorías en los círculos del Inicio).
 * Cada flecha sale solo si hay algo más hacia su lado y mueve el carril casi un ancho. Con el dedo no salen: el carril se desliza solo
 * (estilos: `.t-carril-flecha`, inicio.css). Con el teclado tampoco hacen falta: al pasar con Tab, el navegador trae a la vista el enlace
 * que recibe el foco; por eso no son una parada más del Tab y el lector no las anuncia.
 *
 * Las flechas se muestran y se esconden tocando el DOM, sin estado de React: medir en cada dibujo y guardar lo medido en un estado hacía
 * que el componente se volviera a dibujar sin fin en el celular («Maximum update depth exceeded», 2026-10-15).
 */
export function CarrilConFlechas({ children, className = "" }: { children: ReactNode; className?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const antes = useRef<HTMLButtonElement>(null);
  const despues = useRef<HTMLButtonElement>(null);

  // Se mide al llegar, al deslizar, al cambiar el ancho y al cambiar lo de adentro (otra tienda elegida: otras categorías).
  useEffect(() => {
    const carril = caja.current?.firstElementChild;
    if (!(carril instanceof HTMLElement)) return;
    const medir = () => {
      const max = carril.scrollWidth - carril.clientWidth;
      if (antes.current) antes.current.hidden = carril.scrollLeft <= 4;
      if (despues.current) despues.current.hidden = carril.scrollLeft >= max - 4;
    };
    medir();
    carril.addEventListener("scroll", medir, { passive: true });
    const ancho = new ResizeObserver(medir);
    ancho.observe(carril);
    const contenido = new MutationObserver(medir);
    contenido.observe(carril, { childList: true });
    return () => {
      carril.removeEventListener("scroll", medir);
      ancho.disconnect();
      contenido.disconnect();
    };
  }, []);

  function mover(lado: 1 | -1) {
    const carril = caja.current?.firstElementChild;
    if (!(carril instanceof HTMLElement)) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    carril.scrollBy({ left: lado * carril.clientWidth * 0.8, behavior: quieto ? "instant" : "smooth" });
  }

  return (
    <div ref={caja} className={`t-carril-envol ${className}`.trim()}>
      {children}
      <button ref={antes} type="button" className="t-carril-flecha antes" tabIndex={-1} aria-hidden="true" hidden onClick={() => mover(-1)}>
        <Icono nombre="flecha" />
      </button>
      <button ref={despues} type="button" className="t-carril-flecha despues" tabIndex={-1} aria-hidden="true" hidden onClick={() => mover(1)}>
        <Icono nombre="flecha" />
      </button>
    </div>
  );
}
