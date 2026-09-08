"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

type Props = {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Ancho del panel en escritorio (Tailwind max-w-*). Por defecto el tamaño estándar de formulario corto. */
  ancho?: string;
};

// Cascarón único para todos los modales del sistema. Antes cada uno reimplementaba
// a mano el overlay (`fixed inset-0 ...`) y ninguno atrapaba el foco ni cerraba con
// Escape — Radix Dialog resuelve eso una sola vez; el look sigue siendo 100% CAYLA
// (Radix no trae estilo propio, solo comportamiento de accesibilidad).
export function Modal({ titulo, subtitulo, onClose, children, ancho = "max-w-sm" }: Props) {
  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-velo fixed inset-0 z-50 bg-tinta/30 backdrop-blur-[1px]" />
        {/* El centrado vive en este contenedor y NO en el panel: una animación
            de entrada usa `transform`, y si el centrado también fuera un
            transform (-translate-1/2), la animación lo pisaría y el modal
            saldría corrido. `pointer-events-none` acá + `auto` en el panel deja
            que el clic afuera siga llegando al velo para cerrar. */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Dialog.Content
            className={`anim-entrada scroll-cayla pointer-events-auto max-h-[90vh] w-full overflow-y-auto border-t border-sand bg-crema p-6 outline-none sm:border ${ancho}`}
          >
          <Dialog.Title asChild>
            <h2 className="font-display text-lg text-tinta">{titulo}</h2>
          </Dialog.Title>
          {subtitulo ? (
            <Dialog.Description asChild>
              <p className="mb-4 mt-1 text-xs text-tinta/50">{subtitulo}</p>
            </Dialog.Description>
          ) : (
            // Radix exige una Description por accesibilidad aunque el modal no muestre una visualmente.
            <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
          )}
          {children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Estilos de campo compartidos — el mismo patrón que ya usaba EfectivoPanel
// (el primer modal migrado al sistema v3), para que un formulario nuevo no
// tenga que reinventar la etiqueta/input/botón de cada modal.
export const campoEtiqueta = "label-cayla text-[10px] text-tinta/50";
export const campoTexto =
  "w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo";
export const campoSelect = "w-full card-cayla px-3 py-2 text-sm text-tinta outline-none focus:border-rojo";
export const botonCancelar =
  "label-cayla flex-1 border border-tinta/25 px-3 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo";
export const botonPrimario =
  "label-cayla flex-1 bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50";
