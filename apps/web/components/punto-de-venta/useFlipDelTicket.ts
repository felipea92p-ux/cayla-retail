"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { prefiereQuieto } from "@/lib/movimiento-cliente";
import { useQuieto } from "@/lib/useQuieto";

// Reflujo suave de las líneas del ticket al agregar o quitar una prenda (Flip, ADR-0038; vuelve de V1 por ADR-0045): se captura la
// posición ANTES de que cambie la lista y GSAP anima desde ahí hacia la nueva, en vez de que las filas salten. Solo se captura cuando
// la lista cambia de largo: subir la cantidad no reordena nada. El ref vive en Vender y el ticket solo lo recibe (ADR-0043).
//
// GSAP baja solo con las animaciones ENCENDIDAS (ADR-0674, actividad 7; ADR-0625): el ERP arranca quieto, y hasta el 2026-11-17 Vender
// cargaba GSAP igual —y animaba el ticket igual, porque esta pieza no preguntaba `prefiereQuieto()`—. Quieto, las filas cambian de lugar
// de una vez y la librería ni se descarga. Si la descarga falla (sin conexión), el ticket funciona igual, sin el reflujo.

type Motor = typeof import("@/lib/motion-gsap");
type Posiciones = ReturnType<Motor["Flip"]["getState"]>;

export function useFlipDelTicket(largo: number) {
  const lista = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor | null>(null);
  const posiciones = useRef<Posiciones | null>(null);
  const quieto = useQuieto();

  useEffect(() => {
    if (quieto || motor.current) return;
    let vivo = true;
    import("@/lib/motion-gsap").then(
      (m) => {
        if (vivo) motor.current = m;
      },
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [quieto]);

  /** Se llama ANTES de cambiar el largo de la lista. Quieto o sin la librería, no hace nada. */
  function capturar() {
    const m = motor.current;
    if (!m || !lista.current || prefiereQuieto()) return;
    posiciones.current = m.Flip.getState(lista.current.children);
  }

  useLayoutEffect(() => {
    const m = motor.current;
    const desde = posiciones.current;
    posiciones.current = null;
    if (!m || !desde) return;
    m.Flip.from(desde, {
      duration: 0.32,
      ease: "caylaEase",
      // Solo la fila que SALE se saca del flujo (`position: absolute`) para poder deslizarse encima de las demás sin arrastrarlas. Con
      // `absolute: true` TODAS las filas —también las que se quedan y la que entra— salían del flujo mientras duraba la animación: el
      // contenedor de la lista perdía su alto real y, si el ticket ya llenaba el scroll, la fila nueva se dibujaba superpuesta a las
      // demás hasta que Flip terminaba y las devolvía a su lugar (bug reportado 2026-09-17: «parpadeo» al agregar una prenda que
      // excede el largo del ticket).
      absoluteOnLeave: true,
      onEnter: (elementos) => m.gsap.fromTo(elementos, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.32, ease: "caylaEase" }),
      onLeave: (elementos) => m.gsap.to(elementos, { opacity: 0, duration: 0.18 }),
    });
  }, [largo]);

  return { lista, capturar };
}
