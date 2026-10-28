"use client";

import { ChipOpcion } from "@/components/alta-producto/piezas";
import type { EmpresaElegible } from "@/lib/dueno-reglas";

// «¿De quién es?» (ADR-0542, Felipe 2026-10-27): el botón con el que quien ingresa o ajusta stock en Tienda LIM dice si lo que toca es de
// CAYLA o de CLAURE. Sin respuesta de fábrica. Solo se dibuja donde operan dos empresas (`hayQueElegirDueno`); quien lo usa lo envuelve en su
// `CampoGuiado` y manda lo elegido con `conDueno(...)`.
export function ElegirDueno({
  empresas,
  duenoId,
  onElegir,
  deshabilitado = false,
  guia,
}: {
  empresas: readonly EmpresaElegible[];
  duenoId: string;
  onElegir: (id: string) => void;
  deshabilitado?: boolean;
  /** El `data-guia` de este grupo (cada pantalla que lo usa tiene el suyo). */
  guia: string;
}) {
  return (
    <div role="group" aria-label="De quién es lo que ajustas" data-guia={guia} className="flex flex-wrap gap-2">
      {empresas.map((e) => (
        <ChipOpcion key={e.id} elegido={e.id === duenoId} disabled={deshabilitado} onClick={() => onElegir(e.id)} className="min-w-32 justify-center font-medium">
          {e.nombre}
        </ChipOpcion>
      ))}
    </div>
  );
}
