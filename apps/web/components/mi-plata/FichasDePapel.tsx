"use client";

import { Check, FileText, FileX, Receipt, ReceiptText, type LucideIcon } from "lucide-react";
import { PAPELES_GASTO, type PapelGasto } from "@/lib/revisar-compras-reglas";

// Las fichas de «¿Qué papel le dieron?» de un gasto que no es ropa: las mismas cuando la compradora lo dice al anotar (ADR-0574) y cuando Compras lo
// corrige al revisarlo. Una sola pieza (ADR-0358): cada papel con su ícono, y la elegida lleva su ✓.

/** El ícono de cada papel en su ficha. */
const ICONO_PAPEL: Record<PapelGasto, LucideIcon> = {
  planilla_movilidad: FileX,
  boleta: Receipt,
  factura: FileText,
  ticket: ReceiptText,
};

export function FichasDePapel({
  etiqueta,
  opciones,
  valor,
  alElegir,
  deshabilitadas,
  guia,
}: {
  etiqueta: string;
  opciones: readonly PapelGasto[];
  valor: PapelGasto | null;
  alElegir: (p: PapelGasto) => void;
  deshabilitadas: boolean;
  guia?: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2" data-guia={guia}>
      {opciones.map((k) => {
        const elegido = valor === k;
        const Icono = ICONO_PAPEL[k];
        return (
          <button
            key={k}
            type="button"
            aria-pressed={elegido}
            disabled={deshabilitadas}
            title={PAPELES_GASTO[k].ayuda}
            onClick={() => alElegir(k)}
            className={`card-cayla mov-boton relative flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-[14px] px-2 py-3 text-center ${
              elegido ? "border-tinta" : ""
            }`}
          >
            {elegido && (
              <span aria-hidden className="absolute right-2 top-2 grid h-[18px] w-[18px] place-items-center rounded-full bg-tinta text-crema">
                <Check className="h-3 w-3" />
              </span>
            )}
            <Icono className={`h-5 w-5 ${elegido ? "text-tinta" : "text-taupe"}`} aria-hidden />
            <span className="text-sm font-medium leading-tight text-tinta">{PAPELES_GASTO[k].nombre}</span>
          </button>
        );
      })}
    </div>
  );
}
