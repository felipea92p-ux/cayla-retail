"use client";

import { useId, useState, type ReactNode } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

/**
 * Una lista del Resumen que guarda parte de sus filas: las `visibles` se ven siempre y el `resto` baja en su lugar con «Ver N más» (la pieza única de ADR-0358, `VerMas`). Las filas
 * las dibuja el servidor y llegan hechas (`<li>`): esto solo les pone el estado de «abierto». Sin `visibles`, la lista entera está plegada bajo su `cabecera` (el grupo «Para vigilar»).
 */
export function FilasQuePlegan({ cabecera, visibles, resto, textoMas }: { cabecera?: ReactNode; visibles?: ReactNode; resto: ReactNode; textoMas: string }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <>
      {cabecera}
      {visibles ? <ul>{visibles}</ul> : null}
      <FilasDeMas abierto={abierto} id={id}>
        <ul>{resto}</ul>
      </FilasDeMas>
      <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={textoMas} controla={id} />
    </>
  );
}
