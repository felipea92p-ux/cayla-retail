"use client";

import { useEffect } from "react";

/**
 * Lo que sube al bajar la página (la maqueta de la Pasarela): promete que cada bloque marcado con `data-revela`, y cada hijo de un
 * `data-revela-lista`, se esconde SOLO si está bajo el pliegue y aparece una sola vez al entrar en pantalla. Lo que ya se ve al cargar no
 * se toca, y sin JavaScript o con «reducir movimiento» no se esconde nada. Asume que el CSS de `globals.css` lee `data-r`
 * («espera» / «visto» / «ya»). Se monta una vez en el marco: sigue lo que aparece al navegar o al cambiar una pestaña.
 * No dibuja nada.
 */
export function RevelaAlBajar() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.r = "visto";
          observador.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    const revisar = () => {
      // El lugar en la lista fija el desfase (110 ms por posición, hasta la sexta): una fila larga no tarda en completarse.
      document.querySelectorAll("[data-revela-lista]").forEach((lista) => {
        Array.from(lista.children).forEach((hijo, i) => {
          if (hijo.hasAttribute("data-revela")) return;
          hijo.setAttribute("data-revela", "");
          (hijo as HTMLElement).style.setProperty("--i", String(Math.min(i, 5)));
        });
      });
      document.querySelectorAll<HTMLElement>("[data-revela]:not([data-r])").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.9) {
          // Ya a la vista (o más arriba, o escondido por `hidden`): se queda como está.
          el.dataset.r = "ya";
          return;
        }
        el.dataset.r = "espera";
        observador.observe(el);
      });
    };

    let cuadro = 0;
    const alCambiar = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(revisar);
    };
    revisar();
    const vigia = new MutationObserver(alCambiar);
    vigia.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(cuadro);
      vigia.disconnect();
      observador.disconnect();
    };
  }, []);

  return null;
}
