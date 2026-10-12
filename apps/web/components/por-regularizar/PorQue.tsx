"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * El «¿Por qué?» de Ventas sin registrar (Formidable ley 6, ADR-0360 act. c): lo difícil vive bajo un toque, nunca solo con hover. Un botón
 * chico, con su estado (`aria-expanded`), que abre la explicación en una nota en hueso justo debajo; otro toque la cierra. Sin movimiento
 * propio más que el de entrar (`vsr-sube`, una vez). No guarda nada ni decide nada: solo cuenta lo que ya hace la pantalla.
 */
export function PorQue({ etiqueta = "¿Por qué?", alAbrir, children }: { etiqueta?: string; /** Se avisa al abrir: la nota hace crecer lo que la contiene (el puente) y quien lo contiene puede traerla a la vista. */ alAbrir?: () => void; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="vsr-pq" aria-expanded={abierto} aria-controls={id} onClick={() => {
          if (!abierto) alAbrir?.();
          setAbierto((a) => !a);
        }}>
        {etiqueta}
      </button>
      {abierto && (
        <div id={id} role="note" className="vsr-pq-nota">
          {children}
        </div>
      )}
    </>
  );
}
