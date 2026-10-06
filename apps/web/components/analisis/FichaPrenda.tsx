"use client";

import { Modal } from "@/components/ui/Modal";

// Análisis v4 (ADR-0356): PROVISIONAL. La ficha de la prenda se construye en la actividad 6.

export function FichaPrenda({ onCerrar }: { varianteId: string; onCerrar: () => void }) {
  return (
    <Modal titulo="Ficha de la prenda" subtitulo="En construcción." onClose={onCerrar} variante="hoja" conCerrar>
      <div className="analisis analisis-hoja" />
    </Modal>
  );
}
