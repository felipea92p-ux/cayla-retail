"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { idDeAncla } from "@/lib/ancla-de-la-direccion";

/** Lo que tarda en abrirse (400 ms, `FilasDeMas`) más un respiro: antes de eso la página aún no llega a su alto final. */
const ESPERA_AL_ABRIR_MS = 450;

/** Lo que no hace falta para responder la pregunta del estado, pero se sigue pudiendo ver (ADR-0611): plegado y a un toque. */
export function MasDelEstado({ texto, guia, abierto: deInicio = false, children }: { texto: string; guia?: string; /** Empieza abierto: la dirección trae algo de adentro. */ abierto?: boolean; children: ReactNode }) {
  const [abierto, setAbierto] = useState(deInicio);
  const contenido = useRef<HTMLDivElement>(null);
  // Quien llega con un enlace a algo de adentro («Por qué no es la cifra de Ventas», «Probar escenario»): el navegador busca el lugar antes de que esto termine de abrirse y se queda
  // en otro lado. El `#` no llega al servidor, así que se lee aquí y se abre solo si ese lugar está dentro de este pliegue.
  useEffect(() => {
    const id = idDeAncla(window.location.hash);
    if (!id) return;
    const destino = document.getElementById(id);
    const adentro = !!destino && !!contenido.current?.contains(destino);
    if (!deInicio && !adentro) return;
    if (adentro) setAbierto(true);
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), ESPERA_AL_ABRIR_MS);
    return () => window.clearTimeout(t);
  }, [deInicio]);
  return (
    <div className="estados-mas">
      <div className="estados-mas-boton">
        <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={texto} forma="enlace" data-guia={guia} />
      </div>
      <FilasDeMas abierto={abierto}>
        <div ref={contenido} className="placa-estados estados-debajo estados-mas-contenido">
          {children}
        </div>
      </FilasDeMas>
    </div>
  );
}
