"use client";

import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { textoPrendas } from "@/lib/recepcion-conteo-reglas";

// El tacho de un modelo o de una categoría que ya se contó (Felipe 2026-11-03, ADR-0604 y ADR-0605): se pregunta, porque se pierde ese conteo. En 0 se borra directo, sin pasar por aquí.

export function QuitarModelo({ nombre, contadas, onQuitar, onCerrar }: { nombre: string; contadas: number; onQuitar: () => void; onCerrar: () => void }) {
  return (
    <Modal titulo={`¿Quitar ${nombre}?`} subtitulo={`Ya contaste ${textoPrendas(contadas)}: ese conteo se borra de este envío.`} onClose={onCerrar}>
      {(cerrar) => (
        <div className="pie-acciones">
          <Boton type="button" peso="fantasma" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton
            type="button"
            peso="peligro"
            onClick={() => {
              onQuitar();
              onCerrar();
            }}
          >
            Quitar
          </Boton>
        </div>
      )}
    </Modal>
  );
}
