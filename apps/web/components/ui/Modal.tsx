"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useState, type ReactNode, type RefObject } from "react";

/** Debe coincidir con `.anim-salida` en globals.css. */
const MS_SALIDA = 220;

type Props = {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  onClose: () => void;
  /** Como nodo, o como función que recibe el cierre animado — así un botón
      "Cancelar" propio del formulario sale con la misma animación que Escape,
      en vez de desaparecer de golpe. */
  children: ReactNode | ((cerrar: () => void) => ReactNode);
  /** Ancho del panel en escritorio (Tailwind max-w-*). Por defecto el tamaño estándar de formulario corto. */
  ancho?: string;
  /** A qué elemento devolver el foco al cerrar. Sin esto, Radix intenta volver al
      trigger del diálogo — que estos modales controlados no tienen — y el foco cae al
      `body`. Vender lo usa para que el escáner vuelva a estar listo tras cada modal. */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
};

// Cascarón único para todos los modales del sistema. Antes cada uno reimplementaba
// a mano el overlay (`fixed inset-0 ...`) y ninguno atrapaba el foco ni cerraba con
// Escape — Radix Dialog resuelve eso una sola vez; el look sigue siendo 100% CAYLA
// (Radix no trae estilo propio, solo comportamiento de accesibilidad).
export function Modal({ titulo, subtitulo, onClose, children, ancho = "max-w-sm", alCerrarEnfocar }: Props) {
  const [cerrando, setCerrando] = useState(false);

  // Cierre en dos tiempos: se anima la salida y recién ahí se le avisa al padre
  // que desmonte. Sin esto, un modal que entra suave se iba de un corte seco —
  // que se siente más brusco que no haberlo animado nunca.
  const pedirCierre = useCallback(() => {
    setCerrando((yaCerrando) => {
      if (yaCerrando) return yaCerrando;
      const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setTimeout(onClose, sinMovimiento ? 0 : MS_SALIDA);
      return true;
    });
  }, [onClose]);

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`fixed inset-0 z-50 bg-tinta/35 backdrop-blur-[2px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`}
        />
        {/* El centrado vive en este contenedor y NO en el panel: una animación
            de entrada usa `transform`, y si el centrado también fuera un
            transform (-translate-1/2), la animación lo pisaría y el modal
            saldría corrido. `pointer-events-none` acá + `auto` en el panel deja
            que el clic afuera siga llegando al velo para cerrar. */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Dialog.Content
            className={`scroll-cayla pointer-events-auto max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-sand bg-crema p-6 shadow-xl outline-none sm:rounded-2xl ${
              cerrando ? "anim-salida" : "anim-entrada"
            } ${ancho}`}
            // Radix dispara esto al desmontar el diálogo; `preventDefault` evita que
            // su default (enfocar el trigger) pise el foco que se pone acá.
            onCloseAutoFocus={
              alCerrarEnfocar
                ? (e) => {
                    e.preventDefault();
                    alCerrarEnfocar.current?.focus();
                  }
                : undefined
            }
          >
          <Dialog.Title asChild>
            <h2 className="font-display text-lg text-tinta">{titulo}</h2>
          </Dialog.Title>
          {subtitulo ? (
            <Dialog.Description asChild>
              <p className="mb-4 mt-1 text-xs text-tinta/70">{subtitulo}</p>
            </Dialog.Description>
          ) : (
            // Radix exige una Description por accesibilidad aunque el modal no muestre una visualmente.
            <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
          )}
          {typeof children === "function" ? children(pedirCierre) : children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Estilos de campo compartidos — el mismo patrón que ya usaba EfectivoPanel
// (el primer modal migrado al sistema v3), para que un formulario nuevo no
// tenga que reinventar la etiqueta/input/botón de cada modal.
export const campoEtiqueta = "label-cayla text-[11px] text-tinta/70";
export const campoTexto =
  "w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo";
export const campoSelect = "w-full card-cayla px-3 py-2 text-sm text-tinta outline-none focus:border-rojo";
export const botonCancelar =
  "label-cayla rounded-md flex-1 border border-tinta/25 px-3 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo";
export const botonPrimario =
  "label-cayla rounded-md flex-1 bg-tinta px-3 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50";
