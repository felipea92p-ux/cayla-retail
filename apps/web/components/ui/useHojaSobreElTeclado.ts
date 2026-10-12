"use client";

import { useEffect, useRef } from "react";

/** Menos que esto no es un teclado: la barra de Safari que se esconde o aparece mueve el alto unos 50–80 px. */
const MIN_TECLADO = 120;

/**
 * Una hoja pegada abajo en el celular no queda tapada por el teclado (2026-10-08, Vender ▸ Registrar cliente).
 *
 * En el iPhone (y en Chrome de Android desde la v108) abrir el teclado no achica la página: solo achica lo que se ve
 * (`visualViewport`). Un `fixed inset-0` con la hoja abajo sigue midiendo la pantalla entera, así que el teclado tapaba
 * el botón «Registrar» y el propio campo donde se escribía.
 *
 * Con el teclado arriba, el contenedor que posiciona la hoja empieza en el borde de arriba de lo visible y sigue hasta el
 * fondo de la pantalla, DETRÁS del teclado; la hoja lo llena entero y reserva abajo, con relleno, lo que tapa el teclado
 * (`--teclado`, `data-teclado`: las reglas viven en globals.css, «Hoja con el teclado arriba»). Así lo último de la hoja
 * se alcanza desplazando y el pie fijo (`pie-hoja-fijo`) se apoya sobre el teclado.
 *
 * Por qué NO se pega la hoja al borde de abajo de lo visible (como se hizo la primera vez, 2026-10-08): Brave en Android
 * reporta `visualViewport.height` unos 56 px más bajo de lo que se ve —descuenta su barra de abajo, que el teclado ya
 * escondió— y la hoja quedaba flotando con el velo asomando entre ella y el teclado (medido en una captura de Vender ▸
 * Prenda sin registrar). Anclada arriba y llegando hasta el fondo, un alto mal reportado solo agranda el relleno de abajo:
 * nunca deja un hueco a la vista.
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
      tocado?.style.removeProperty("--teclado");
      tocado?.removeAttribute("data-teclado");
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
      // Lo que queda tapado bajo lo visible, medido desde el fondo del contenedor (el de la pantalla).
      el.style.setProperty("--teclado", `${Math.max(0, Math.round(window.innerHeight - vv.offsetTop - vv.height))}px`);
      el.setAttribute("data-teclado", "");
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
    // La barra del navegador que aparece o se esconde cambia `innerHeight` sin mover siempre el área visible.
    window.addEventListener("resize", ajustar);
    return () => {
      vv.removeEventListener("resize", ajustar);
      vv.removeEventListener("scroll", ajustar);
      window.removeEventListener("resize", ajustar);
      soltar();
    };
  }, [activo]);
  return contenedor;
}
