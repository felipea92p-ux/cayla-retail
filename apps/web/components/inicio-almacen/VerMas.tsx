"use client";

import { useState, type ReactNode } from "react";
import { Ico } from "./iconos";

/** «Ver N más» de «Te toca»: las filas de más se despliegan con `grid-template-rows` (0fr → 1fr), sin medir alturas. Cerradas
 *  quedan `inert`: ni se ven ni se alcanzan con el teclado. */
export function VerMas({ cantidad, children }: { cantidad: number; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <div className={`ia-mas ${abierto ? "ia-on" : ""}`} inert={!abierto}>
        <div>{children}</div>
      </div>
      <button type="button" className={`ia-vm ${abierto ? "ia-on" : ""}`} onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        {abierto ? "Ver menos" : `Ver ${cantidad} más`}
        <Ico clave="chevDown" />
      </button>
    </>
  );
}
