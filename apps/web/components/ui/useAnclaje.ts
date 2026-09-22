"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export type PosicionAnclada = { top: number; left: number };

/* ====================================================================
   useAnclaje · ancla un panel flotante debajo de su control (2026-09-22)

   Por qué existe: `MenuAcciones.tsx` ya resolvía esto para el menú «⋯» de
   una fila — mide el botón con `getBoundingClientRect` y dibuja el menú en
   `position: fixed`, porque una fila de tabla con `overflow-x-auto` recorta
   cualquier hijo `absolute`. Los selectores de rango de Análisis (Período A,
   Período B, Desempeño › Personalizado) tenían el mismo problema — el de
   Personalizado vive dentro de la franja de presets, que se desplaza en
   horizontal (`overflow-x-auto`) — y cada uno lo resolvía a mano, con una
   clase de posición distinta por pantalla (`left-4 top-[calc(100%-0.25rem)]`
   contra `left-0 top-full mt-2`): por eso el panel de Personalizado se veía
   pegado a la tarjeta entera, no al control que se tocó. Este hook es ESE
   mismo mecanismo, generalizado, para que los tres usen uno solo.

   Siempre cae debajo, pegado a la izquierda del control, con `separacion` de
   aire — nunca arriba: ninguno de los tres selectores lo necesitaba. Se
   recalcula mientras está abierto, al redimensionar la ventana y al
   desplazarse (con captura: así se entera aunque el scroll ocurra dentro de
   la franja de presets, no en la página). `ancho` es el ancho NOMINAL del
   panel (el de su propia clase, p. ej. `w-[22rem]`): si en una ventana
   angosta el panel termina más angosto (por su propio `max-w-[...]`), sobra
   margen a la derecha — nunca falta.
   ==================================================================== */
export function usePosicionAnclada(control: RefObject<HTMLElement | null>, abierto: boolean, ancho: number, separacion = 8): PosicionAnclada | null {
  const [pos, setPos] = useState<PosicionAnclada | null>(null);

  useLayoutEffect(() => {
    // Sin setear `null` acá (setState síncrono en el cuerpo del efecto, que ESLint marca con razón):
    // igual que `MenuAcciones`, quien lo usa solo lo monta mientras está abierto, así que al cerrarse el
    // componente entero se desmonta y este estado desaparece con él — nunca queda una posición vieja a la vista.
    if (!abierto || !control.current) return;
    function calcular() {
      const r = control.current!.getBoundingClientRect();
      setPos({ top: r.bottom + separacion, left: Math.min(Math.max(8, r.left), window.innerWidth - ancho - 8) });
    }
    calcular();
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    return () => {
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
    };
  }, [abierto, control, ancho, separacion]);

  return pos;
}
