"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Debe coincidir con `.anim-modal-sale` en globals.css. */
const MS_SALIDA = 220;
/** Pasado esto, el aviso admite que está tardando (la persona no debe dudar de si se colgó). */
const MS_TARDA = 4000;

/**
 * El aviso central de «te estoy llevando a otra sede».
 *
 * EL PROBLEMA. Cambiar de sede repinta toda la pantalla con datos de otra tienda, y mientras
 * la base contesta no se veía nada más que una línea de 2 px bajo la pastilla: la persona
 * podía creer que el clic no se registró y volver a elegir, o —peor— leer las cifras de la
 * sede anterior creyendo que ya eran las nuevas y decidir con ellas.
 *
 * QUÉ HACE. Aparece al elegir y se va cuando llegan los datos: dura exactamente lo que tarda
 * la carga (`activo` viene del `useTransition` del selector, no de un reloj). Dice de qué sede
 * viene y a cuál va. Entra y sale con el movimiento de los modales (ADR-0136): velo con
 * desenfoque, hoja que sube 18 px, sin rebote. Lo único que se mueve en bucle es la señal de
 * «estoy trabajando» (el arco y el hilo), que es justo lo que se quiere ver.
 *
 * DÓNDE VA. En un portal a `body`, por debajo del lateral (z-40) y la cabecera (z-30): la
 * navegación y la pastilla quedan a la vista y el velo solo cubre el contenido. No es un
 * diálogo —no atrapa el foco ni se cierra solo— sino un estado: `role="status"`.
 *
 * Maqueta: docs/maquetas/cambio-de-sede-spike-2026-09/cambio-de-sede-spike.html
 */
export function AvisoCambioDeSede({ activo, de, a }: { activo: boolean; de: string; a: string }) {
  const [montado, setMontado] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [tarda, setTarda] = useState(false);
  // Al terminar la carga, `de`/`a` ya son los nuevos: se congelan los de la carga mientras sale.
  const [textos, setTextos] = useState({ de, a });
  const [antes, setAntes] = useState(activo);

  // Ajuste durante el render (no en un efecto): el estado sigue a `activo` sin un render de más.
  if (activo !== antes) {
    setAntes(activo);
    if (activo) {
      setMontado(true);
      setSaliendo(false);
    } else if (montado) {
      setSaliendo(true); // se anima la salida y recién ahí se desmonta (mismo cierre en dos tiempos que `Modal`)
    }
  }
  if (activo && (textos.de !== de || textos.a !== a)) setTextos({ de, a });

  useEffect(() => {
    if (!activo) return;
    const t = setTimeout(() => setTarda(true), MS_TARDA);
    return () => {
      clearTimeout(t);
      setTarda(false);
    };
  }, [activo]);

  useEffect(() => {
    if (!saliendo) return;
    const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(
      () => {
        setMontado(false);
        setSaliendo(false);
      },
      sinMovimiento ? 0 : MS_SALIDA,
    );
    return () => clearTimeout(t);
  }, [saliendo]);

  if (!montado) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-20 flex items-start justify-center bg-crema/60 px-4 pt-[26vh] backdrop-blur-[3px] sm:pl-lateral ${
        saliendo ? "anim-velo-salida" : "anim-velo"
      }`}
    >
      <div
        className={`relative w-full max-w-[380px] overflow-hidden rounded-[20px] bg-papel px-6 pb-6 pt-6 text-center shadow-[0_22px_44px_-22px_rgba(80,50,20,0.5)] ring-1 ring-tinta/[0.07] ${
          saliendo ? "anim-modal-sale" : "anim-modal-entra"
        }`}
      >
        <div className="relative mx-auto mb-3.5 grid h-16 w-16 place-items-center">
          <Image
            src="/cayla-isotipo.png"
            alt=""
            width={34}
            height={34}
            priority
            className="h-[34px] w-auto"
          />
          <svg
            aria-hidden
            viewBox="0 0 64 64"
            fill="none"
            strokeWidth={2}
            className="absolute inset-0 h-full w-full"
          >
            <circle cx="32" cy="32" r="29" className="stroke-sand" />
            <circle
              cx="32"
              cy="32"
              r="29"
              strokeDasharray="46 137"
              strokeLinecap="round"
              className="origin-center stroke-rojo animate-spin [animation-duration:1.1s]"
            />
          </svg>
        </div>
        <p className="label-cayla text-[11px] text-taupe-profundo">
          Cambiando de sede
        </p>
        <p className="font-display mt-1.5 text-[26px] leading-[1.15] text-tinta">
          {textos.de} → <span className="text-rojo-profundo">{textos.a}</span>
        </p>
        <p className="mt-2 text-[13px] text-tinta/65">
          {tarda
            ? "Está tardando más de lo normal, un momento…"
            : "Trayendo el inventario de esa sede…"}
        </p>
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden"
        >
          <span className="block h-full w-1/3 bg-rojo [animation:cayla-hilo-barrido_1.1s_linear_infinite]" />
        </span>
      </div>
    </div>,
    document.body,
  );
}
