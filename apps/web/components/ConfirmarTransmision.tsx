"use client";

import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";

/**
 * Antes de transmitir (o reintentar) un comprobante a SUNAT: quién lo envía (ADR-0161; Facturación se delega en
 * emitir y reenviar, B4). La acción vivía en un botón de fila sin formulario; como guarda en la base, pide el combo
 * igual que cualquier otra. El envío en sí lo hace `useTransmitir` con los encabezados que se le devuelven.
 */
export function ConfirmarTransmision({ onClose, onTransmitir }: { onClose: () => void; onTransmitir: (encabezados: Record<string, string>) => void }) {
  const responsable = useResponsable();
  return (
    <Modal titulo="Transmitir a SUNAT" subtitulo="Elige quién lo envía. Lo que llega a SUNAT no se deshace." onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <ComboResponsable control={responsable} />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={!responsable.listo}
              title={responsable.motivo ?? undefined}
              onClick={() => onTransmitir(responsable.encabezados())}
              className={botonPrimario}
            >
              Transmitir
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
