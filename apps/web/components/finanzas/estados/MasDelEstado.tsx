"use client";

import { useState, type ReactNode } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

/** Lo que no hace falta para responder la pregunta del estado, pero se sigue pudiendo ver (ADR-0611): plegado y a un toque. */
export function MasDelEstado({ texto, guia, abierto: deInicio = false, children }: { texto: string; guia?: string; /** Empieza abierto: la dirección trae algo de adentro. */ abierto?: boolean; children: ReactNode }) {
  const [abierto, setAbierto] = useState(deInicio);
  return (
    <div className="estados-mas">
      <div className="estados-mas-boton">
        <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={texto} forma="enlace" data-guia={guia} />
      </div>
      <FilasDeMas abierto={abierto}>
        <div className="placa-estados estados-debajo estados-mas-contenido">{children}</div>
      </FilasDeMas>
    </div>
  );
}
