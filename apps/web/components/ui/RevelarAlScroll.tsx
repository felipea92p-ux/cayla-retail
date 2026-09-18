"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/motion-gsap";

/**
 * Revela `children` con el mismo gesto que `.anim-asentar` (opacidad 0.35→1,
 * 4px hacia arriba), pero disparado al cruzar el viewport en el scroll en vez
 * de al montar. Es el único caso que la capa CSS de globals.css no cubre: para
 * saber CUÁNDO algo entra en pantalla mientras la persona se desplaza hace
 * falta observar el scroll, y el soporte de navegador para animar eso en CSS
 * puro (`animation-timeline: scroll()`) todavía es parejo — ScrollTrigger sí
 * lo resuelve bien y con control fino del punto de disparo.
 *
 * Sigue la regla de ADR-0011 ("el movimiento responde a una acción de la
 * persona"): acá la acción es el scroll mismo, no la carga de la pantalla —
 * por eso `once: true`, se revela una vez y no se repite si se vuelve a pasar.
 * Lo que ya está a la vista al montar no viaja: ScrollTrigger lo da por cruzado.
 *
 * El scroll puede ser el de la ventana o el de un contenedor interno (la grilla
 * de Vender scrollea por dentro, ADR-0044): si no se pasa `scroller`, se busca el
 * ancestro más cercano con `overflow-y: auto|scroll`; si no hay, es la ventana.
 */
export function RevelarAlScroll({
  children,
  className,
  scroller,
}: {
  children: ReactNode;
  className?: string;
  /** Elemento o selector del contenedor que scrollea. Opcional: se descubre solo. */
  scroller?: string | Element;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const nodo = ref.current;
      if (!nodo) return;
      const contenedor = scroller ?? contenedorQueScrollea(nodo) ?? undefined;
      // Regla de ADR-0011: nada se anima solo al entrar a la pantalla. Lo que ya está a
      // la vista cuando se monta (la primera fila de la grilla, por ejemplo) se queda
      // como está; el gesto es solo para lo que la persona trae con el scroll.
      if (yaALaVista(nodo, contenedor)) return;
      gsap.matchMedia().add(
        {
          reducido: "(prefers-reduced-motion: reduce)",
          normal: "(prefers-reduced-motion: no-preference)",
        },
        (contexto) => {
          const { reducido } = contexto.conditions as { reducido: boolean };
          // Igual que en globals.css: quien pidió menos movimiento ve el
          // resultado, no el viaje — se colapsa la duración, no se elimina
          // la animación (dejaría el elemento a medio revelar).
          const tween = gsap.fromTo(
            nodo,
            { opacity: 0.35, y: 4 },
            {
              opacity: 1,
              y: 0,
              duration: reducido ? 0.001 : 0.32,
              ease: "caylaEase",
              scrollTrigger: {
                trigger: nodo,
                scroller: contenedor,
                start: "top 90%",
                once: true,
              },
            },
          );
          return () => tween.scrollTrigger?.kill();
        },
      );
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** El ancestro más cercano que scrollea verticalmente, o null si scrollea la ventana. */
function contenedorQueScrollea(desde: Element): Element | null {
  let el = desde.parentElement;
  while (el && el !== document.body) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

/** ¿El nodo ya se ve dentro del área visible del contenedor (o de la ventana)? */
function yaALaVista(nodo: Element, contenedor: string | Element | undefined): boolean {
  const r = nodo.getBoundingClientRect();
  const marco =
    typeof contenedor === "string"
      ? document.querySelector(contenedor)?.getBoundingClientRect()
      : contenedor?.getBoundingClientRect();
  const arriba = marco?.top ?? 0;
  const abajo = marco?.bottom ?? window.innerHeight;
  return r.top < abajo && r.bottom > arriba;
}
