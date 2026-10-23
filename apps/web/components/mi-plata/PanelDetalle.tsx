import type { ReactNode } from "react";

// El detalle de «Revisar compras» (rediseño, maqueta docs/maquetas/compras-formidable-2026-10/): lo que se está revisando se abre AL LADO
// de la lista, sin otra hoja, para pasar de uno a otro sin perder el lugar. Arriba, de quién y cuándo, qué es y su estado; debajo, lo que
// se revisa y su botón. Sin estado propio: lo dibuja cada detalle.
export function PanelDetalle({ sobre, titulo, estado, guia, children }: { sobre: string; titulo: string; estado?: ReactNode; guia?: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} data-guia={guia} className="card-cayla @container flex min-w-0 flex-col gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="label-cayla block text-[11px] text-taupe">{sobre}</span>
          <h3 className="revisar-titulo mt-1">{titulo}</h3>
        </div>
        {estado}
      </div>
      {children}
    </section>
  );
}
