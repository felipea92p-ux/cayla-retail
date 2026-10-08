"use client";

import { useEffect, useRef } from "react";

/** Menos que esto no es un teclado: la barra de Safari que se esconde o aparece mueve el alto unos 50–80 px. */
const MIN_TECLADO = 120;

/**
 * Una hoja pegada abajo en el celular queda SOBRE el teclado, no debajo (2026-10-08, Vender ▸ Registrar cliente).
 *
 * En el iPhone (y en Chrome de Android desde la v108) abrir el teclado no achica la página: solo achica lo que se ve
 * (`visualViewport`). Un `fixed inset-0` con la hoja abajo sigue midiendo la pantalla entera, así que el teclado tapaba
 * el botón «Registrar» y el propio campo donde se escribía. Aquí el contenedor que posiciona la hoja se ajusta al trozo
 * visible: su borde de abajo pasa a ser el borde de arriba del teclado, y el campo con el foco se deja a la vista.
 *
 * Escribe el estilo directo en el elemento (sin estado de React): el teclado dispara decenas de eventos mientras sube y
 * redibujar la hoja en cada uno haría saltar la cascada. Con zoom de pellizco no hace nada (ahí el área visible chica no es
 * el teclado). Sin teclado, deja el elemento como estaba. Devuelve el ref que va en el contenedor que posiciona la hoja.
 */
export function useHojaSobreElTeclado<T extends HTMLElement>(activo: boolean) {
  const contenedor = useRef<T>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!activo || !vv) return;

    // El elemento se lee en cada ajuste: Radix monta el portal un render después, y al correr este efecto puede no estar.
    let conTeclado = false;
    let tocado: HTMLElement | null = null;
    const soltar = () => {
      tocado?.style.removeProperty("top");
      tocado?.style.removeProperty("bottom");
      tocado?.style.removeProperty("height");
      tocado = null;
    };
    const ajustar = () => {
      const el = contenedor.current;
      if (!el) return;
      const teclado = window.innerHeight - vv.height;
      if (vv.scale > 1.01 || teclado < MIN_TECLADO) {
        if (conTeclado) soltar();
        conTeclado = false;
        return;
      }
      tocado = el;
      el.style.top = `${vv.offsetTop}px`;
      el.style.bottom = "auto";
      el.style.height = `${vv.height}px`;
      // Solo al subir el teclado: después, quien escribe puede desplazar la hoja sin que se la devuelvan al campo.
      if (!conTeclado) {
        const foco = document.activeElement;
        if (foco instanceof HTMLElement && el.contains(foco)) requestAnimationFrame(() => foco.scrollIntoView({ block: "nearest" }));
      }
      conTeclado = true;
    };

    ajustar();
    vv.addEventListener("resize", ajustar);
    vv.addEventListener("scroll", ajustar);
    return () => {
      vv.removeEventListener("resize", ajustar);
      vv.removeEventListener("scroll", ajustar);
      soltar();
    };
  }, [activo]);
  return contenedor;
}
