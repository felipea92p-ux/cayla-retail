"use client";

import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { HojaLoEscaneado } from "@/components/barrido-piso/HojaLoEscaneado";
import { Boton } from "@/components/ui/campos";
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
      <Boton peso="fantasma" type="button" data-guia="barrido-detalle.lecturas" onClick={() => setAbierta(true)}>
        <ListChecks aria-hidden className="h-4 w-4" />
        Ver cada lectura
      </Boton>
      {abierta && <HojaLoEscaneado barridoId={barridoId} porId={porId} onClose={() => setAbierta(false)} />}
    </>
  );
}
