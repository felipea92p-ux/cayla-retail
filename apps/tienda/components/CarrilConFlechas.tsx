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

  // Cada flecha lleva el carril a una TARJETA exacta (un punto de anclaje), nunca a «80 % del ancho»: ese número casi nunca cae en el borde de
  // una tarjeta y, con el anclaje obligatorio (`scroll-snap-type: x mandatory`), Safari dejaba el carril a medias, con una tarjeta cortada a
  // cada lado (2026-10-19). Siguiente: la primera tarjeta que no cabe entera (la cortada del lado derecho) pasa a ser la primera. Anterior:
  // la tarjeta que queda tantas antes como caben a la vista.
  function mover(lado: 1 | -1) {
    const carril = caja.current?.firstElementChild;
    if (!(carril instanceof HTMLElement)) return;
    const tarjetas = Array.from(carril.children).filter((e): e is HTMLElement => e instanceof HTMLElement);
    if (tarjetas.length === 0) return;
    const estilo = getComputedStyle(carril);
    const margen = parseFloat(estilo.scrollPaddingLeft) || parseFloat(estilo.paddingLeft) || 0;
    const caja_ = carril.getBoundingClientRect();
    const izq = caja_.left + margen;
    const der = caja_.right - (parseFloat(estilo.paddingRight) || 0);
    const TOL = 4;
    const rects = tarjetas.map((t) => t.getBoundingClientRect());
    let objetivo: number;
    if (lado === 1) {
      const i = rects.findIndex((r) => r.right > der + TOL);
      if (i < 0) return;
      objetivo = i;
    } else {
      const primera = Math.max(0, rects.findIndex((r) => r.left >= izq - TOL));
      const caben = Math.max(1, rects.filter((r) => r.left >= izq - TOL && r.right <= der + TOL).length);
      objetivo = Math.max(0, primera - caben);
    }
    // Donde queda esa tarjeta al anclarla al borde izquierdo (con su margen de anclaje).
    const izquierda = carril.scrollLeft + (rects[objetivo].left - izq);
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    carril.scrollTo({ left: Math.max(0, izquierda), behavior: quieto ? "instant" : "smooth" });
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
