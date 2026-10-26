"use client";

import { useEffect, useRef } from "react";

/* ====================================================================
   useAtrasCierraLaHoja · «atrás» cierra la hoja, no la pantalla (Felipe 2026-10-26)

   En el teléfono, el botón «atrás» y el gesto desde el borde son la forma natural de quitarse una hoja de encima. Sin esto,
   «atrás» dejaba la hoja abierta y llevaba a la pantalla anterior. Cómo:
     · al abrir, una entrada de historial con la MISMA URL y la marca de esta hoja;
     · «atrás» la consume: se repone al instante (la hoja sigue abierta mientras decide) y se pide el cierre por la puerta de
       siempre (`antesDeCerrar` de `<Modal>`), así que con cambios sin guardar pregunta «¿Salir sin guardar?» y, si la persona
       sigue, la hoja queda abierta y el próximo «atrás» vuelve a preguntar;
     · si la hoja se cierra por otro lado (la ✕, Escape, el dedo, guardar), su entrada se retira sola con un «atrás» propio, para
       que el siguiente «atrás» de la persona no se pierda en una entrada vacía. Si ya hay otra entrada encima (se navegó desde la
       hoja), no se toca: no es nuestra.
   Los dos `popstate` (el de la persona y el del retiro) se atienden en la CAPTURA de `window` y no siguen: la URL no cambió, así
   que el router de Next no tiene nada que restaurar, y si restaurara el árbol de la entrada de abajo podría volver a montar la
   pantalla entera (ver `useSalidaSinGuardar`, 2026-10-08). Hoy lo pide la hoja de la prenda de Existencias (`<Modal atrasCierra>`);
   llevarlo a todas las hojas es otro paso.
   ==================================================================== */

/** Marca de la entrada de una hoja en `history.state`: guarda su id, para no confundirla con la de otra. */
const MARCA = "__hojaAbierta";
const hojaEnElHistorial = () => (window.history.state as Record<string, unknown> | null)?.[MARCA];
const ponerEntrada = (id: string) => window.history.pushState({ ...(window.history.state ?? {}), [MARCA]: id }, "", window.location.href);

/** El `popstate` que provoca retirar una entrada no es la persona pulsando «atrás»: se corta una vez. */
let ignorarProximoPop = false;
if (typeof window !== "undefined") {
  window.addEventListener(
    "popstate",
    (e) => {
      if (!ignorarProximoPop) return;
      ignorarProximoPop = false;
      e.stopImmediatePropagation();
    },
    { capture: true }
  );
}

let siguienteId = 0;

export function useAtrasCierraLaHoja(activo: boolean, pedirCierre: () => void) {
  const pedirCierreActual = useRef(pedirCierre);
  useEffect(() => {
    pedirCierreActual.current = pedirCierre;
  }, [pedirCierre]);
  // Refs y no estado: sobreviven al desmontaje de prueba de React en desarrollo, que si no pondría dos entradas.
  const entrada = useRef<{ id: string; url: string } | null>(null);
  const montada = useRef(false);

  useEffect(() => {
    if (!activo) return;
    montada.current = true;
    if (!entrada.current) {
      const id = `hoja-${++siguienteId}`;
      ponerEntrada(id);
      entrada.current = { id, url: window.location.href };
    }
    const alVolver = (e: PopStateEvent) => {
      const en = entrada.current;
      if (!en || ignorarProximoPop) return;
      if (hojaEnElHistorial() === en.id) return;
      // Se fue a otra URL (o a otra entrada que no es la de abajo): no es un «atrás» sobre esta hoja.
      if (window.location.href !== en.url) {
        entrada.current = null;
        return;
      }
      e.stopImmediatePropagation();
      ponerEntrada(en.id);
      pedirCierreActual.current();
    };
    window.addEventListener("popstate", alVolver, { capture: true });
    return () => {
      window.removeEventListener("popstate", alVolver, { capture: true });
      montada.current = false;
      // Se mira después de que asiente lo que la desmontó: si fue una navegación, la entrada de arriba ya no es la nuestra.
      window.setTimeout(() => {
        const en = entrada.current;
        if (montada.current || !en) return;
        entrada.current = null;
        if (hojaEnElHistorial() === en.id && window.location.href === en.url) {
          ignorarProximoPop = true;
          window.history.back();
        }
      }, 0);
    };
  }, [activo]);
}
