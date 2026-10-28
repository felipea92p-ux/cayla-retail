"use client";

import { useState, type ReactNode } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

/** «Ver N más» de «Te toca»: la pieza de todo el ERP (ronda 15 de /unificar), que nació aquí. Las filas de más bajan en su lugar
 *  y, cerradas, quedan `inert`: ni se ven ni se alcanzan con el teclado. */
export function VerMas({ cantidad, children }: { cantidad: number; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <FilasDeMas abierto={abierto}>{children}</FilasDeMas>
      <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={`Ver ${cantidad} más`} />
    </>
  );
}
