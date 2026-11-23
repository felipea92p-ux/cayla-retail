"use client";

import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { HojaLoEscaneado } from "@/components/barrido-piso/HojaLoEscaneado";
import type { PrendaBarrido } from "@/lib/barrido-piso-reglas";

/**
 * «Ver cada lectura» del historial (ADR-0690, actividad 9): abre la misma hoja de «Lo escaneado» del barrido, pero solo para leer —sin
 * «Quitar»—: los tramos de cada persona con su hora, lo quitado tachado con quién lo quitó y lo apartado con su foto.
 */
export function VerLecturasDelBarrido({ barridoId, prendas }: { barridoId: string; prendas: PrendaBarrido[] }) {
  const [abierta, setAbierta] = useState(false);
  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p] as const)), [prendas]);
  return (
    <>
      <button type="button" data-guia="barrido-detalle.lecturas" onClick={() => setAbierta(true)} className="btn-cayla btn-secundario h-11">
        <ListChecks aria-hidden className="h-4 w-4" />
        Ver cada lectura
      </button>
      {abierta && <HojaLoEscaneado barridoId={barridoId} porId={porId} onClose={() => setAbierta(false)} />}
    </>
  );
}
