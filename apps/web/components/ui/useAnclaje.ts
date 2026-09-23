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

/* ====================================================================
   usePosicionLista · la lista de un desplegable, fuera de la caja que la
   contiene (2026-09-22)

   Por qué existe: `Desplegable` y `ComboBuscable` dibujaban su lista en
   `absolute` debajo del control. Dentro de un `<Modal>` eso no funciona: la
   hoja tiene `overflow-y-auto` (para que un formulario largo se desplace) y
   RECORTA todo lo que sobresale. En «Asignar rol» el campo Cuenta está al
   pie de la hoja: la lista se abría, pero quedaba metida en un scroll
   interno de cinco filas, con el título y los botones empujados fuera de la
   vista — se veía como un buscador roto.

   Mismo remedio que `MenuAcciones` y `usePosicionAnclada`: `position: fixed`
   medido contra el control, que ninguna caja con overflow recorta. A
   diferencia de aquel, la lista toma el ANCHO del control y, si no cabe
   abajo, se abre hacia arriba — en un modal el campo suele estar cerca del
   borde inferior de la ventana. `alto` es el tope de la lista (su
   `max-h-*`); se achica si no hay tanto espacio en ninguno de los dos lados.
   Mientras mide por primera vez devuelve `null`: quien lo usa no pinta la
   lista hasta tener posición, para que no aparezca un cuadro en (0,0).

   Se mide EN CADA CUADRO mientras está abierta, no solo al abrir, al
   desplazarse o al redimensionar (2026-09-22): al abrir un modal, Radix
   enfoca el primer campo en el mismo instante en que la hoja empieza a
   entrar —achicada al 96,5 % y 18 px más abajo, y el campo 10 px más por la
   cascada—; el combo se abre con ese foco y medía el campo a medio camino.
   Terminada la entrada el campo quedaba en su lugar y la lista no: más
   angosta, corrida y ~28 px más abajo, tapando los botones. Una animación
   no dispara `scroll` ni `resize`, y tampoco un aviso que aparece arriba y
   empuja el campo. Cuesta un `getBoundingClientRect` por cuadro, solo con
   la lista a la vista, y el estado cambia solo si la posición cambió.
   ==================================================================== */
export type PosicionLista = { left: number; width: number; maxHeight: number } & ({ top: number } | { bottom: number });

export function usePosicionLista(control: RefObject<HTMLElement | null>, abierto: boolean, alto: number, separacion = 6): PosicionLista | null {
  const [pos, setPos] = useState<PosicionLista | null>(null);

  useLayoutEffect(() => {
    if (!abierto || !control.current) return;
    let previa = "";
    let cuadro = 0;
    function calcular() {
      if (!control.current) return;
      const r = control.current.getBoundingClientRect();
      const margen = 8;
      const abajo = window.innerHeight - r.bottom - separacion - margen;
      const arriba = r.top - separacion - margen;
      const base = { left: r.left, width: r.width };
      // Abajo es lo esperado; arriba solo si abajo no alcanza y arriba hay más aire.
      const nueva: PosicionLista =
        abajo >= Math.min(alto, 160) || abajo >= arriba
          ? { ...base, top: r.bottom + separacion, maxHeight: Math.min(alto, Math.max(abajo, 120)) }
          : { ...base, bottom: window.innerHeight - r.top + separacion, maxHeight: Math.min(alto, arriba) };
      const clave = JSON.stringify(nueva);
      if (clave !== previa) {
        previa = clave;
        setPos(nueva);
      }
    }
    // Cuadro a cuadro (ver arriba): cubre la entrada del modal, el scroll, el resize y el campo que se mueve solo.
    function seguir() {
      calcular();
      cuadro = requestAnimationFrame(seguir);
    }
    seguir();
    return () => cancelAnimationFrame(cuadro);
  }, [abierto, control, alto, separacion]);

  return abierto ? pos : null;
}
