"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, CustomEase);

// Misma curva que --ease-cayla en app/globals.css (arranca suave, frena largo).
// Se registra una sola vez con nombre para que esta capa nunca invente una
// segunda curva que pueda desalinearse de globals.css con el tiempo — GSAP no
// entiende cubic-bezier crudo como CSS, así que CustomEase es el puente.
if (!CustomEase.get("caylaEase")) {
  CustomEase.create("caylaEase", "0.32, 0.72, 0.24, 1");
}

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
 */
export function RevelarAlScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
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
            ref.current,
            { opacity: 0.35, y: 4 },
            {
              opacity: 1,
              y: 0,
              duration: reducido ? 0.001 : 0.32,
              ease: "caylaEase",
              scrollTrigger: { trigger: ref.current, start: "top 85%", once: true },
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
