"use client";

import { useId, useState, type ReactNode } from "react";

/** «¿Por qué?»: lo difícil, a un toque (Formidable, ley 6). Un enlace dentro de la frase que abre la explicación debajo; nunca solo con hover. */
export function PorQue({ children, guia }: { children: ReactNode; guia?: string }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="btn-enlace ml-1.5 text-[13px] font-medium"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
        data-guia={guia}
      >
        ¿Por qué?
      </button>
      <span id={id} hidden={!abierto} className="nota-cayla mt-2 block max-w-prose">
        {children}
      </span>
    </>
  );
}
