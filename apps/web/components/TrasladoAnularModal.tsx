"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ControlResponsable } from "@/lib/useResponsable";
import { textoObligatorioValido } from "@/lib/traslados-recepcion-reglas";

// «Anular envío» (ADR-0239 D-132): quien envió (o un líder) deshace un traslado mientras nadie haya empezado a
// contarlo. Antes la única salida era que la otra sede registrara 0 y un líder lo diera por perdido: una pérdida falsa.
// El modal escribe la consecuencia antes de apretar y pide el motivo; el combo «Responsable» va aquí adentro porque
// quien anula está parada en la sede de ORIGEN, donde el detalle no tiene otra cosa que guardar.

export function TrasladoAnularModal({
  numero,
  consecuencia,
  responsable,
  ocupado,
  onAnular,
  onClose,
}: {
  numero: number;
  consecuencia: string;
  responsable: ControlResponsable;
  ocupado: boolean;
  onAnular: (motivo: string, cerrar: () => void) => void;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const valido = textoObligatorioValido(motivo);

  return (
    <Modal titulo={`Anular el envío del Traslado ${numero}`} subtitulo={consecuencia} ancho="max-w-md" bloqueado={ocupado} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="motivo-anulacion" className="text-xs text-taupe">
              Por qué lo anulas (obligatorio)
            </label>
            <textarea
              id="motivo-anulacion"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: mandé la talla equivocada; sale otro traslado con la correcta."
              rows={3}
              disabled={ocupado}
              className="caja-cayla w-full px-3 py-2 text-sm text-tinta outline-none placeholder:text-taupe"
            />
          </div>
          <ComboResponsable control={responsable} deshabilitado={ocupado} />
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={cerrar} disabled={ocupado} className="btn-cayla btn-secundario">
              No anular
            </button>
            <button
              type="button"
              onClick={() => onAnular(motivo.trim(), cerrar)}
              disabled={ocupado || !valido || !responsable.listo}
              title={!valido ? "Escribe por qué lo anulas." : (responsable.motivo ?? undefined)}
              className="btn-cayla btn-peligro"
            >
              {ocupado ? "Anulando…" : "Anular envío"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
