"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

/** Lo que no hace falta para responder la pregunta del estado, pero se sigue pudiendo ver (ADR-0611): plegado y a un toque. */
export function MasDelEstado({ texto, guia, abierto: deInicio = false, children }: { texto: string; guia?: string; /** Empieza abierto: la dirección trae algo de adentro. */ abierto?: boolean; children: ReactNode }) {
  const [abierto, setAbierto] = useState(deInicio);
  // Quien llega con un enlace a algo de adentro («Por qué no es la cifra de Ventas»): el navegador busca el lugar antes de que esto termine de abrirse y se queda arriba.
  useEffect(() => {
    if (!deInicio || !window.location.hash) return;
    const id = window.location.hash.slice(1);
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 350);
    return () => window.clearTimeout(t);
  }, [deInicio]);
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
