"use client";

import { useEffect, useSyncExternalStore } from "react";
import { prendaDeLaRuta } from "@/lib/esqueleto";
import { leerPrendaTocada, type PrendaTocada } from "@/lib/prenda-tocada";
import { nombreDeFoto } from "./Vistas";

// La última prenda tocada (lib/prenda-tocada.ts). Vive en la memoria de esta pestaña: al recargar, la ficha llega con su esqueleto de
// siempre. Solo se escribe al tocar, así que el servidor nunca la ve (y una página recién abierta hidrata igual que como llegó).
let tocada: PrendaTocada | null = null;
const sinAvisos = () => () => {};
const laTocada = () => tocada;
const ninguna = () => null;

/**
 * Escucha los toques que llevan a la ficha de una prenda (desde una tarjeta, una polaroid o un carril) y guarda lo que esa tarjeta ya
 * mostraba. Se monta una vez (`app/layout.tsx`). Escucha en la captura, antes de que el enlace navegue; un clic con Ctrl o con la rueda
 * (otra pestaña) no cuenta.
 */
export function RecordarPrendaTocada() {
  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
      const enlace = e.target.closest("a[href]");
      if (!(enlace instanceof HTMLAnchorElement)) return;
      const id = prendaDeLaRuta(new URL(enlace.href).pathname);
      if (!id) return;
      const caja = enlace.closest<HTMLElement>("[data-prenda]");
      if (!caja || caja.dataset.prenda?.toLowerCase() !== id) return;
      const img = caja.querySelector("img");
      const lista = img && img.complete && img.naturalWidth > 0 ? img.currentSrc || img.src : null;
      tocada = leerPrendaTocada({ ...caja.dataset }, lista);
      // La foto tocada lleva el nombre de la foto grande de la ficha: el navegador la hace volar de un lugar al otro (`FotoQueViaja`). Se
      // le quita al rato: si quedara, otra tarjeta de la misma prenda (el Inicio la repite en dos carriles) chocaría con ella.
      const foto = caja.querySelector<HTMLElement>(".t-card-foto");
      if (tocada && foto && "startViewTransition" in document) {
        foto.style.viewTransitionName = nombreDeFoto(id);
        foto.style.viewTransitionClass = "t-viaja";
        window.setTimeout(() => {
          foto.style.viewTransitionName = "";
          foto.style.viewTransitionClass = "";
        }, 1500);
      }
    };
    document.addEventListener("click", alTocar, true);
    return () => document.removeEventListener("click", alTocar, true);
  }, []);
  return null;
}

/** Lo que se vio de la prenda `id` en la tarjeta tocada; null si se tocó otra (o ninguna). */
export function usePrendaTocada(id: string | null): PrendaTocada | null {
  const t = useSyncExternalStore(sinAvisos, laTocada, ninguna);
  return t && id && t.id === id.toLowerCase() ? t : null;
}
