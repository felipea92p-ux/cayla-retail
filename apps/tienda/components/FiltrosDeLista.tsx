"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import { guardarAviso } from "@/lib/filtros-aviso";

/**
 * La barra de filtros de una lista del catálogo (grupos, categorías y orden), que se queda pegada arriba al bajar. Si la persona toca un
 * filtro con la barra ya pegada (venía mirando la lista más abajo), la vista vuelve al comienzo de la lista antes de que llegue la nueva:
 * sin esto, la lista nueva aparecía desde la mitad (en Lima, elegir «Abajo» desde abajo mostraba los shorts del final y no las faldas del
 * comienzo, y parecía que no había más). Si la barra todavía no se pegó, nada se mueve. Sus enlaces van con `scroll={false}`: Next no
 * sube la página hasta el título. La marca de arriba dice dónde empieza la barra cuando no está pegada (la barra pegada no lo sabe).
 */
export function FiltrosDeLista({ children }: { children: ReactNode }) {
  const marca = useRef<HTMLSpanElement>(null);

  function alTocar(e: MouseEvent<HTMLDivElement>) {
    // Abrir en otra pestaña (o con el botón del medio) no cambia esta lista.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const enlace = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!enlace || !marca.current) return;
    // Un grupo o una categoría que suelta lo elegido de color y talla manda su frase en el enlace (`data-quita`, ADR-0512): se guarda para que
    // quien llega al otro lado vea qué se quitó, con «Deshacer» que vuelve a esta lista.
    const quita = enlace.getAttribute("data-quita");
    if (quita) {
      try {
        guardarAviso(window.sessionStorage, { texto: quita, destino: enlace.getAttribute("href") ?? "", volver: window.location.pathname + window.location.search });
      } catch {
        // Sin almacén (ventana privada): el aviso no cruza.
      }
    }
    const comienzo = marca.current.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > comienzo + 1) window.scrollTo({ top: comienzo, behavior: "instant" });
  }

  return (
    <>
      <span ref={marca} className="t-filtros-marca" aria-hidden="true" />
      <div className="t-filtros" onClickCapture={alTocar}>
        {children}
      </div>
    </>
  );
}
