"use client";

import { useEffect } from "react";
import { bordesQueFaltan } from "@/lib/fila-desliza-reglas";

// Una fila de pestañas (`<Pestanas>`, `.pestanas-cayla`) o de píldoras (`.pildoras-desliza`) que se desliza de lado avisa que hay más con un
// degradado en el borde donde falta por ver (opción A de la maqueta `docs/maquetas/pestanas-que-se-deslizan-2026-10/`, Felipe 2026-10-23).
// Este componente solo MIDE y marca la fila con `data-mas-izq` / `data-mas-der`; el degradado lo dibuja `pestanas-y-segmentos.css`.
//
// Va montado UNA vez en `app/layout.tsx` (como `OndaBotones`): ninguna pantalla tiene que hacer nada, y una fila nueva con esas clases
// lo hereda. Escucha el scroll de cualquier fila (el evento no sube, pero se oye en la captura del documento), y vuelve a medir cuando la
// pantalla cambia de ancho, cambia el DOM (otra pantalla, otra pestaña, un conteo nuevo) o terminan de cargar las letras.
const FILAS = ".pestanas-cayla, .pildoras-desliza";

function marcar(fila: HTMLElement) {
  const { izquierda, derecha } = bordesQueFaltan(fila.scrollLeft, fila.clientWidth, fila.scrollWidth);
  fila.toggleAttribute("data-mas-izq", izquierda);
  fila.toggleAttribute("data-mas-der", derecha);
}

const marcarTodas = () => document.querySelectorAll<HTMLElement>(FILAS).forEach(marcar);

export function FilasQueSeDeslizan() {
  useEffect(() => {
    let cuadro = 0;
    // Varias mutaciones seguidas (React pinta una pantalla entera) piden UNA sola medida, en el siguiente cuadro.
    const pronto = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(marcarTodas);
    };
    const alDeslizar = (e: Event) => {
      const fila = e.target;
      if (fila instanceof HTMLElement && fila.matches(FILAS)) marcar(fila);
    };
    document.addEventListener("scroll", alDeslizar, { capture: true, passive: true });
    window.addEventListener("resize", pronto);
    // Solo `childList`: marcar una fila cambia atributos, no hijos, así que medir no vuelve a disparar la medida.
    const observador = new MutationObserver(pronto);
    observador.observe(document.body, { childList: true, subtree: true });
    void document.fonts?.ready.then(pronto);
    pronto();
    return () => {
      cancelAnimationFrame(cuadro);
      document.removeEventListener("scroll", alDeslizar, { capture: true });
      window.removeEventListener("resize", pronto);
      observador.disconnect();
    };
  }, []);
  return null;
}
