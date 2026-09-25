"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";

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
  /** «papel» (Por pagar, 2026-09-19, spike): el panel en `papel` con borde fino y SIN sombra —la profundidad viene del tiempo, no del
      espacio (regla v3.1)— y una ✕ para cerrar arriba a la derecha. Sin esto, el panel de siempre (`crema` con sombra). */
  variante?: "papel" | "hoja";
  /* «hoja» (Finanzas, 2026-09-24, spike docs/maquetas/finanzas-2026-09/): el panel en `papel` sin sombra ni ✕, con el
     título en serif grande y la bajada en taupe —la hoja del spike—. Los campos de adentro van en caja (`fin-control`,
     app/estilos/finanzas.css). */
};

// REGLA DE MOVIMIENTO (ADR-0136): todo modal nuevo se hace con este componente y hereda, sin definir nada, el
// efecto del sistema — velo con desenfoque, hoja que sube y crece, contenido que entra en cascada, salida
// corta (detalle y números en globals.css, «REGLA DE MODALES»). NO reimplementes el overlay ni pongas otra
// animación de entrada en un modal: si una pieza necesita salirse de la cascada, `data-sin-cascada`.
//
// Cascarón único para todos los modales del sistema. Antes cada uno reimplementaba
// a mano el overlay (`fixed inset-0 ...`) y ninguno atrapaba el foco ni cerraba con
// Escape — Radix Dialog resuelve eso una sola vez; el look sigue siendo 100% CAYLA
// (Radix no trae estilo propio, solo comportamiento de accesibilidad).
export function Modal({ titulo, subtitulo, onClose, children, ancho = "max-w-sm", alCerrarEnfocar, variante }: Props) {
  const [cerrando, setCerrando] = useState(false);

  // Cierre en dos tiempos: se anima la salida y recién ahí se le avisa al padre
  // que desmonte. Sin esto, un modal que entra suave se iba de un corte seco —
  // que se siente más brusco que no haberlo animado nunca.
  //
  // El temporizador vive en un efecto y NO dentro del updater de `setCerrando`
  // (como estuvo al principio): React ejecuta los updaters dos veces en
  // desarrollo (StrictMode) para delatar efectos escondidos, y un `setTimeout`
  // ahí adentro disparaba `onClose` dos veces. Con `setModal(null)` daba
  // igual; con un cierre que navega (`router.back()` en ModalRuta) retrocedía
  // dos páginas. El efecto corre una vez por cierre y limpia su temporizador.
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const temporizador = setTimeout(onClose, sinMovimiento ? 0 : MS_SALIDA);
    return () => clearTimeout(temporizador);
  }, [cerrando, onClose]);

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`fixed inset-0 z-50 bg-tinta/35 backdrop-blur-[2px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`}
        />
        {/* La posición vive en este contenedor y NO en el panel: una animación
            de entrada usa `transform`, y si la posición también fuera un
            transform (-translate-1/2), la animación lo pisaría y el modal
            saldría corrido. `pointer-events-none` acá + `auto` en el panel deja
            que el clic afuera siga llegando al velo para cerrar.
            En escritorio la hoja va ANCLADA ARRIBA (8vh), no centrada (2026-09-23, ADR-0185): centrada, cada
            cambio de alto del contenido (elegir un medio, un motivo, un responsable) movía también su borde de
            arriba y la hoja «bailaba». Anclada, el título no se mueve nunca; solo crece o se acorta el borde de
            abajo. En celular sigue siendo una hoja pegada abajo. */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:p-6 sm:pt-[8vh]">
          <Dialog.Content
            className={`scroll-cayla pointer-events-auto relative max-h-[90vh] w-full sm:max-h-[calc(100dvh-8vh-1.5rem)] overflow-y-auto rounded-t-2xl border border-sand p-6 outline-none sm:rounded-2xl ${
              variante === "papel" || variante === "hoja" ? "bg-papel" : "bg-crema shadow-xl"
            } ${
              cerrando ? "anim-modal-sale" : "anim-modal-entra"
            } cascada-modal ${ancho}`}
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
          {variante === "papel" && (
            <button
              type="button"
              onClick={pedirCierre}
              aria-label="Cerrar"
              className="absolute right-4 top-4 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
          <Dialog.Title asChild>
            <h2 className={`font-display text-tinta ${variante === "hoja" ? "text-2xl leading-tight" : "text-lg"} ${variante === "papel" ? "pr-8" : ""}`}>{titulo}</h2>
          </Dialog.Title>
          {subtitulo ? (
            <Dialog.Description asChild>
              <p className={variante === "hoja" ? "mb-[18px] mt-1 text-[13.5px] leading-normal text-taupe" : "mb-4 mt-1 text-xs text-tinta/70"}>{subtitulo}</p>
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
  "label-cayla rounded-md flex-1 bg-tinta px-3 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo-profundo disabled:opacity-50";
