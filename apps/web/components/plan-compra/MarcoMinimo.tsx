import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { PestanasPlan, type PestanaDelPlan } from "@/components/plan-compra/PestanasPlan";

// El marco del Plan de campaña SIN una campaña abierta: la cabecera y las pestañas, nada más (ADR-0525). Lo usa `SinCampana` (cuando no hay ninguna campaña que mostrar o la lectura falló) y
// el Calendario cuando todavía no hay ninguna: ahí es justo donde se decide cuáles campañas se tienen, y no puede depender de que ya exista un plan. Sin selector de campaña, sin chip del
// momento ni centro de avisos: todo eso sale de la campaña abierta.

export function MarcoMinimo({ activa, subtitulo, children }: { activa: PestanaDelPlan; subtitulo: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <EncabezadoPagina sede="Todas las tiendas" titulo="Plan de campaña" subtitulo={subtitulo} />
      <PestanasPlan activa={activa} />
      {children}
    </div>
  );
}
