"use client";

import { ElegirDueno } from "@/components/existencias/ElegirDueno";
import type { EmpresaElegible } from "@/lib/dueno-reglas";

// «¿De quién es la mercadería?» al meter prendas al stock desde «Para después» (ADR-0542): en una sede donde operan CAYLA y CLAURE, la persona dice
// de quién son las unidades que entran. Solo se dibuja en esas sedes (quien lo usa pasa `empresas` ya filtradas por `hayQueElegirDueno`).
export function DuenoDeLoQueEntra({ empresas, duenoId, onElegir, deshabilitado }: { empresas: readonly EmpresaElegible[]; duenoId: string; onElegir: (id: string) => void; deshabilitado?: boolean }) {
  return (
    <div id="hacer-ahora-dueno" data-campo="hacer-ahora-dueno" className="space-y-1.5">
      <p className="text-sm font-medium text-tinta">¿De quién es la mercadería?</p>
      <p className="text-xs text-taupe">CAYLA o CLAURE: lo marcas tú, no la marca de la prenda.</p>
      <ElegirDueno empresas={empresas} duenoId={duenoId} onElegir={onElegir} deshabilitado={deshabilitado} guia="recibir.hacer-dueno" />
    </div>
  );
}
