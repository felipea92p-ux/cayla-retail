"use client";

import { useState, type ReactNode } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

/** Lo que no hace falta para responder la pregunta del estado, pero se sigue pudiendo ver (ADR-0611): plegado y a un toque. */
export function MasDelEstado({ texto, guia, children }: { texto: string; guia?: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
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
