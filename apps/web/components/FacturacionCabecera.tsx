"use client";

import { FileText, Plus } from "lucide-react";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { useFacturacionAcciones } from "@/lib/useFacturacionAcciones";

// Cabecera de Facturación. En R1: el título y las dos acciones globales. La línea viva
// (fecha y hora, «actualizado hace…») y el buscador llegan con las vistas que los usan (R2).
export function FacturacionCabecera() {
  const { abrirEmitir, abrirProforma } = useFacturacionAcciones();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Vender</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Facturación</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BotonCompacto variante="vidrio" icono={<FileText aria-hidden strokeWidth={1.75} />} onClick={abrirEmitir}>
          Emitir comprobante
        </BotonCompacto>
        <BotonCompacto variante="primario" icono={<Plus aria-hidden strokeWidth={1.75} />} onClick={abrirProforma}>
          Nueva proforma
        </BotonCompacto>
      </div>
    </div>
  );
}
