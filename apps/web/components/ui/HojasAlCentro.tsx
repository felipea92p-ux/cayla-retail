"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

// Las hojas que abren al centro de la pantalla (Felipe 2026-11-12, al recibir ENV-001660: «el modal sale muy arriba, que aparezca más
// centrado»; «es un problema que tienen la mayoría de modales y hay que corregir primero en este módulo de recibir mercadería»).
//
// Por qué no basta con centrarla (ADR-0185, 2026-09-23): una hoja centrada con flexbox se re-centra cada vez que su contenido cambia de alto
// —elegir un medio, un motivo, abrir un aviso— y su título sube y baja: «bailaba». Por eso toda hoja va anclada arriba (8vh).
//
// Cómo se centra sin bailar: al ABRIR se mide y se pone al centro; desde ahí su borde de arriba queda FIJO y la hoja solo crece hacia abajo.
// Si al crecer ya no cabe, sube lo justo para caber (nunca vuelve a bajar mientras está abierta). Cambiar el tamaño de la ventana la vuelve a
// centrar. En el celular (< 640 px) no aplica: ahí la hoja va pegada abajo (ADR-0479).
//
// Se enciende por zona con `<HojasAlCentro>` (hoy: el layout de /recibir). Toda `<Modal>` adentro —también las del portal, porque el
// contexto de React atraviesa el portal— lo lee sola: ninguna pantalla tiene que hacer nada.

const HojasAlCentroContexto = createContext(false);

export function HojasAlCentro({ children }: { children: ReactNode }) {
  return <HojasAlCentroContexto.Provider value={true}>{children}</HojasAlCentroContexto.Provider>;
}

/** Margen que queda bajo la hoja cuando crece hasta no caber (el mismo `1.5rem` que descuenta su alto máximo). */
const MARGEN_ABAJO = 24;
/** El tope de arriba de siempre (ADR-0185): ninguna hoja abre más arriba que esto. */
const TOPE_ARRIBA = 0.08;

/**
 * @internal Exportada para su prueba (`lib/hojas-al-centro.test.ts`); la usa `useHojaAlCentro`, aquí mismo.
 * Dónde va el borde de arriba de una hoja al centro, en px. Pura, para probarla: `actual` es donde está ahora (`null` = recién abre).
 * Al abrir, el centro (sin pasar el tope). Después, el mismo lugar, salvo que ya no quepa: entonces sube lo justo, sin pasar el tope.
 */
export function bordeDeArriba(altoVentana: number, altoHoja: number, actual: number | null): number {
  const tope = altoVentana * TOPE_ARRIBA;
  const centro = Math.max(tope, (altoVentana - altoHoja) / 2);
  if (actual === null) return Math.round(centro);
  const cabe = Math.max(tope, altoVentana - altoHoja - MARGEN_ABAJO);
  return Math.round(Math.min(actual, cabe));
}

/** El padding de arriba del contenedor de la hoja, o `null` si esta hoja no va al centro (fuera de la zona, en el celular). */
export function useHojaAlCentro(activo: boolean, hoja: HTMLElement | null): number | null {
  const enLaZona = useContext(HojasAlCentroContexto);
  const [arriba, setArriba] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!activo || !enLaZona || !hoja) return;
    const escritorio = window.matchMedia("(min-width: 640px)");
    let actual: number | null = null;
    const medir = (abriendo: boolean) => {
      if (!escritorio.matches) {
        actual = null;
        setArriba(null);
        return;
      }
      // `offsetHeight` es el alto de la caja sin la animación de entrada (que escala con `transform`).
      actual = bordeDeArriba(window.innerHeight, hoja.offsetHeight, abriendo ? null : actual);
      setArriba(actual);
    };
    medir(true);
    const observador = new ResizeObserver(() => medir(false));
    observador.observe(hoja);
    const alCambiarLaVentana = () => medir(true);
    window.addEventListener("resize", alCambiarLaVentana);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", alCambiarLaVentana);
    };
  }, [activo, enLaZona, hoja]);

  return activo && enLaZona ? arriba : null;
}
