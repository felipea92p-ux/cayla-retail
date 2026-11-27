"use client";

import { useId, useState, type ReactNode } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

/**
 * Una lista del Resumen que guarda parte de sus filas: las `visibles` se ven siempre y el `resto` baja en su lugar con «Ver N más» (la pieza única de ADR-0358, `VerMas`). Las filas
 * las dibuja el servidor y llegan hechas (`<li>`): esto solo les pone el estado de «abierto».
 */
export function FilasQuePlegan({ visibles, resto, textoMas }: { visibles: ReactNode; resto: ReactNode; textoMas: string }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <>
      <ul>{visibles}</ul>
      <FilasDeMas abierto={abierto} id={id}>
        <ul>{resto}</ul>
      </FilasDeMas>
      <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={textoMas} controla={id} />
    </>
  );
}
