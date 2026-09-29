"use client";

import { useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import type { Confirmacion } from "@/lib/confirmar-catalogo";
import type { ControlResponsable } from "@/lib/useResponsable";

/**
 * Confirmación corta para una acción de un clic (Aprobar, Desactivar, Reactivar en el Catálogo), textos y porqué en
 * `lib/confirmar-catalogo.ts`. Va SIN responsable (Felipe, 2026-09-29): Aprobar, Desactivar y Reactivar se firman con la
 * clave `catalogo_confirmar_estado` desde cada lista. El nombre del archivo quedó de cuando siempre llevaba el combo.
 * `control` es opcional: solo lo pasan las confirmaciones que NO se soltaron (eliminar una marca; cambiar la temporada
 * de una categoría o asignar en lote en Temporadas), que siguen con su combo y su candado.
 */
export function ConfirmarConResponsable({
  confirmacion,
  control,
  onClose,
}: {
  confirmacion: Confirmacion;
  control?: ControlResponsable;
  onClose: () => void;
}) {
  const [enCurso, setEnCurso] = useState(false);
  return (
    <Modal titulo={confirmacion.titulo} subtitulo={confirmacion.bajada} ancho="max-w-sm" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          {control && <ComboResponsable control={control} deshabilitado={enCurso} />}
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={enCurso}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              className="flex-1"
              cargando={enCurso}
              disabled={control ? !control.listo : undefined}
              title={control?.motivo ?? undefined}
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
