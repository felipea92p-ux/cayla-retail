"use client";

import { Modal } from "@/components/ui/Modal";
import { AvisoIntentoIncierto } from "@/components/ui/AvisoIntentoIncierto";

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * Vender, cuando no se sabe si un cobro se guardó (`useIntento` en duda, /chaos 2026-10-13): la respuesta de la base se perdió
 * (un corte, un 502). La hoja tapa la caja a propósito: mientras no se sepa, el ticket no se toca (cambiarlo y cobrar de nuevo
 * podría cobrar dos veces) y la pistola no agrega nada. Dos salidas: revisar si la venta quedó, o reenviar el MISMO ticket (si ya
 * quedó, la base no la repite). No se cierra con Escape ni con el velo: se sale sabiendo qué pasó.
 */
export function CobroEnDuda({
  total,
  prendas,
  sinCola,
  revisando,
  reintentando,
  onRevisar,
  onReintentar,
}: {
  total: number;
  prendas: number;
  /** Por qué este cobro no se guardó para subir solo cuando vuelva el internet (el canje del club, una pieza de liquidación…). */
  sinCola: string | null;
  revisando: boolean;
  reintentando: boolean;
  onRevisar: () => void;
  onReintentar: () => void;
}) {
  return (
    <Modal
      titulo="No sabemos si se cobró"
      subtitulo={`${soles(total)} · ${prendas} ${prendas === 1 ? "prenda" : "prendas"}`}
      onClose={() => {}}
      bloqueado
      ancho="max-w-md"
    >
      <div className="space-y-4">
        <AvisoIntentoIncierto onRevisar={onRevisar} revisando={revisando} onReintentar={onReintentar} reintentando={reintentando} />
        {sinCola && <p className="nota-cayla">{sinCola}</p>}
        <p className="text-sm text-tinta/75">Mientras tanto, no le entregues las prendas ni le cobres de otra forma.</p>
      </div>
    </Modal>
  );
}
