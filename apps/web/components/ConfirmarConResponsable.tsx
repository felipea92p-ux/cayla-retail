"use client";

import { useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import type { Confirmacion } from "@/lib/confirmar-catalogo";
import type { ControlResponsable } from "@/lib/useResponsable";

/**
 * Confirmación corta para una acción de un clic (Aprobar, Desactivar, Reactivar en el Catálogo) con el combo
 * «Responsable» adentro: así la pantalla principal no carga un combo suelto arriba de la lista (textos y porqué en
 * `lib/confirmar-catalogo.ts`). Con la cuenta de una persona ya viene su nombre; con una terminal, vacío.
 */
export function ConfirmarConResponsable({
  confirmacion,
  control,
  onClose,
}: {
  confirmacion: Confirmacion;
  control: ControlResponsable;
  onClose: () => void;
}) {
  const [enCurso, setEnCurso] = useState(false);
  return (
    <Modal titulo={confirmacion.titulo} subtitulo={confirmacion.bajada} ancho="max-w-sm" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <ComboResponsable control={control} deshabilitado={enCurso} />
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={enCurso}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              className="flex-1"
              cargando={enCurso}
              disabled={!control.listo}
              title={control.motivo ?? undefined}
              onClick={async () => {
                setEnCurso(true);
                try {
                  await confirmacion.accion();
                } finally {
                  setEnCurso(false);
                  cerrar();
                }
              }}
            >
              {confirmacion.verbo}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
