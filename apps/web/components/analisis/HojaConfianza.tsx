"use client";

import { Modal } from "@/components/ui/Modal";
import { useAnalisis } from "@/components/analisis/contexto";
import { AnillosCondiciones } from "@/components/analisis/TodaviaNo";
import { Racha } from "@/components/analisis/piezas";
import { DIAS_SOSTENIDOS } from "@/lib/motor-demanda-reglas";

// Análisis v4 (ADR-0357): la hoja del chip «Datos confiables / Datos incompletos». Dice las tres condiciones del motor
// (ADR-0346) con su anillo, y si faltan, el botón de cada una. No es un formulario: no lleva guía de foco.

export function HojaConfianza({ onCerrar }: { onCerrar: () => void }) {
  const { datos } = useAnalisis();
  const mia = datos.preparacion.find((p) => p.ubicacionId === datos.sede.id);
  const racha = Math.min(mia?.racha.dias ?? 0, DIAS_SOSTENIDOS);
  return (
    <Modal
      titulo={datos.puedeHablar ? "Datos confiables" : "Datos incompletos"}
      subtitulo={datos.puedeHablar ? "Las tres condiciones se cumplen." : "Análisis recomienda cuando se cumplen las tres."}
      onClose={onCerrar}
      variante="hoja"
      ancho="max-w-xl"
      tituloGrande
      conCerrar
    >
      <div className="analisis analisis-hoja">
        <div className="anim">
          <AnillosCondiciones p={mia} />
        </div>
        <div className="h-sec">
          <h3>Días seguidos</h3>
          <Racha n={racha} />
          <p className="h-nota">
            {racha} de {DIAS_SOSTENIDOS} · la misma regla que CAYLA Global
          </p>
        </div>
      </div>
    </Modal>
  );
}
