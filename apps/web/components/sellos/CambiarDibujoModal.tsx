"use client";

import { useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo } from "@/components/ui/campos";
import { ElegirDibujoDeInsignia } from "@/components/sellos/ElegirDibujoDeInsignia";
import { cambioDeDibujo, type EleccionDeDibujo } from "@/lib/eleccion-de-dibujo";
import type { ControlResponsable } from "@/lib/useResponsable";

/**
 * «Dibujo» en el pase de una insignia o campaña que ya existe (ADR-0490): cambia el dibujo o la imagen que lleva sin tocar nada más. Guardar es UNA
 * escritura (`fijar_icono_etiqueta`; si es una imagen nueva, antes se sube al almacén) y la firma el combo «Responsable», como crear una insignia
 * (ADR-0161). Su guía de foco sale de lo que ya apaga el botón: otro dibujo y alguien que firma.
 */
export function CambiarDibujoModal({
  nombre,
  actual,
  esDelNombre,
  esCampana,
  responsable,
  guardando,
  onGuardar,
  onClose,
}: {
  nombre: string;
  /** Lo que lleva hoy: su imagen propia, el dibujo que eligió o el de su nombre (`eleccionDeLoGuardado`). */
  actual: EleccionDeDibujo;
  /** `true` si nunca eligió: lo que lleva sale de su nombre. */
  esDelNombre: boolean;
  esCampana: boolean;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardar: (eleccion: EleccionDeDibujo) => void;
  onClose: () => void;
}) {
  const [eleccion, setEleccion] = useState<EleccionDeDibujo | null>(null);
  const valor = eleccion ?? actual;
  const cambio = eleccion !== null && cambioDeDibujo(actual, eleccion);
  const guia = useGuiaCampos([
    { id: "dibujo", nombre: "Dibujo", requerido: true, hecho: cambio, pendiente: "Elige otro dibujo o sube tu imagen." },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  return (
    <Modal titulo={`Dibujo ${esCampana ? "de la campaña" : "de la insignia"}`} subtitulo={nombre} onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="dibujo" guia={guia}>
            <Campo etiqueta={guia.etiqueta("dibujo", "Dibujo")} idEtiqueta="dibujo-cambiar" sinPie>
              <ElegirDibujoDeInsignia valor={valor} yaElegido={eleccion !== null || !esDelNombre} onValor={setEleccion} idEtiqueta="dibujo-cambiar" deshabilitado={guardando} />
            </Campo>
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="pie-acciones">
            <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              onClick={() => eleccion && onGuardar(eleccion)}
              cargando={guardando}
              disabled={!cambio || !responsable.listo}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              Guardar dibujo
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
