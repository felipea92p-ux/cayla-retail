"use client";

import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { textoPrendas } from "@/lib/recepcion-conteo-reglas";
import type { ModeloDelConteo } from "@/lib/recepcion-modelos-reglas";

// El tacho de un modelo que ya se contó (Felipe 2026-11-03, ADR-0604): se pregunta, porque se pierde ese conteo. En 0 se borra directo, sin pasar por aquí.

export function QuitarModelo({ modelo, onQuitar, onCerrar }: { modelo: ModeloDelConteo; onQuitar: () => void; onCerrar: () => void }) {
  return (
    <Modal titulo={`¿Quitar ${modelo.nombre}?`} subtitulo={`Ya contaste ${textoPrendas(modelo.contadas)}: ese conteo se borra de este envío.`} onClose={onCerrar}>
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
