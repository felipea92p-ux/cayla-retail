"use client";

import { Truck } from "lucide-react";
import { textoSugerenciaPedir, type CandidatoPedir } from "@/lib/pedidos-con-cliente-reglas";

/**
 * «Dónde más hay» con salida (ADR-0328 act. 17): en la ventana de la prenda, si una talla que el cliente pide no se puede
 * vender aquí y otra tienda la tiene, se ofrece «Pedir y apartar para este cliente». Antes la ventana solo decía «2 en
 * Arequipa» y la venta se perdía o se coordinaba por WhatsApp sin que el sistema se enterara.
 */
export function PedirEnOtraTienda({ candidatos, onPedir }: { candidatos: readonly CandidatoPedir[]; onPedir: () => void }) {
  const texto = textoSugerenciaPedir(candidatos);
  if (!texto) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-sand bg-papel px-3 py-2.5 text-xs text-tinta/80">
      <Truck className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-[12rem] flex-1">{texto}</span>
      <button
        type="button"
        onClick={onPedir}
        // Claro, como «Anotar que no había»: el botón oscuro de la ventana es «Listo» (un solo principal por vista).
        className="btn-cayla btn-secundario ml-auto inline-flex h-8 shrink-0 items-center px-2.5 text-[12.5px]"
      >
        Pedir y apartar para este cliente
      </button>
    </div>
  );
}
