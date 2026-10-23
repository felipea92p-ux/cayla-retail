"use client";

import type { ReactNode } from "react";
import { Popover, Slot } from "radix-ui";
import { Modal } from "@/components/ui/Modal";
import { useEnCelular } from "@/components/ui/useEnCelular";

/**
 * Lo que abre una píldora de filtro cuando NO es una lista de opciones: un rango de fechas con sus campos (ADR-0479, actividad 10).
 * En escritorio, un globo junto a la píldora, como siempre. En el celular, la hoja del sistema (`<Modal>`): llega desde el borde
 * con su asa, se baja con el dedo y no flota encima de la lista (antes el globo tapaba las filas y se cerraba con un toque que caía
 * en una de ellas). Una lista de opciones es `DesplegablePildora`, no esto.
 *
 * `children` puede ser una función que recibe `cerrar`: en el celular cierra la hoja con su salida, en escritorio cierra el globo.
 * `envolver`: la caja de la píldora alrededor del botón (la de `pildora-filtro`), que no es el disparador.
 */
export function CapaDeFiltro({
  abierta,
  onAbierta,
  titulo,
  disparador,
  envolver = (t) => t,
  ancho = "w-64",
  alinear = "start",
  children,
}: {
  abierta: boolean;
  onAbierta: (abierta: boolean) => void;
  /** El título de la hoja en el celular («Fecha de emisión»). */
  titulo: string;
  /** El botón de la píldora. */
  disparador: ReactNode;
  envolver?: (disparador: ReactNode) => ReactNode;
  /** El ancho del globo en escritorio (una clase `w-*`). */
  ancho?: string;
  alinear?: "start" | "end";
  children: ReactNode | ((cerrar: () => void) => ReactNode);
}) {
  const enCelular = useEnCelular();
  const contenido = (cerrar: () => void) => (typeof children === "function" ? children(cerrar) : children);

  if (enCelular) {
    return (
      <>
        {envolver(
          <Slot.Root onClick={() => onAbierta(true)} aria-haspopup="dialog" aria-expanded={abierta}>
            {disparador}
          </Slot.Root>,
        )}
        {abierta && (
          <Modal titulo={titulo} onClose={() => onAbierta(false)} conCerrar>
            {(cerrar) => <div className="-mx-3">{contenido(cerrar)}</div>}
          </Modal>
        )}
      </>
    );
  }
  return (
    <Popover.Root open={abierta} onOpenChange={onAbierta}>
      {envolver(<Popover.Trigger asChild>{disparador}</Popover.Trigger>)}
      <Popover.Portal>
        <Popover.Content
          align={alinear}
          sideOffset={6}
          collisionPadding={16}
          className={`anim-revelar z-50 ${ancho} max-w-[calc(100vw-2rem)] rounded-lg border border-sand bg-papel shadow-md`}
        >
          {contenido(() => onAbierta(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
