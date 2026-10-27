"use client";

import { useState } from "react";
import { PasoCantidad } from "@/components/ui/PasoCantidad";

// Una cantidad de prendas que se sube o baja de uno en uno o se escribe (el paso de cantidad del sistema, `PasoCantidad`, ADR-0358). Lo escrito se confirma al salir del campo o con Enter: mientras se
// escribe, el reparto de al lado no se mueve (una letra no puede recalcular todo). Escape suelta lo escrito y no cierra la hoja; con nada escrito, Escape sigue siendo de la hoja (ADR-0136).

export function CantidadEditable({
  valor,
  onCambiar,
  etiqueta,
  tamano = "celda",
  sufijo,
  max = 100000,
  tono,
  deshabilitado = false,
}: {
  valor: number;
  onCambiar: (n: number) => void;
  /** Lo que oye el lector: «prendas de Polo básico», «S de Negro». */
  etiqueta: string;
  tamano?: "celda" | "fila";
  sufijo?: string;
  max?: number;
  tono?: "error" | "exito" | "atencion";
  deshabilitado?: boolean;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const mostrado = borrador ?? String(valor);
  const confirmar = () => {
    if (borrador === null) return;
    const n = Number(borrador);
    setBorrador(null);
    if (borrador.trim() === "" || !Number.isFinite(n)) return;
    const v = Math.min(max, Math.max(0, Math.round(n)));
    if (v !== valor) onCambiar(v);
  };
  return (
    <PasoCantidad
      tamano={tamano}
      sufijo={sufijo}
      tono={tono}
      className="max-w-full"
      menos={{ onClick: () => onCambiar(Math.max(0, valor - 1)), deshabilitado: deshabilitado || valor <= 0, etiqueta: `Menos ${etiqueta}` }}
      mas={{ onClick: () => onCambiar(Math.min(max, valor + 1)), deshabilitado: deshabilitado || valor >= max, etiqueta: `Más ${etiqueta}` }}
      campo={{
        value: mostrado,
        inputMode: "numeric",
        autoComplete: "off",
        disabled: deshabilitado,
        "aria-label": etiqueta,
        style: { width: `${Math.max(2, mostrado.length + 0.5)}ch` },
        onFocus: (e) => e.currentTarget.select(),
        onChange: (e) => setBorrador(e.target.value.replace(/\D/g, "").slice(0, 6)),
        onBlur: confirmar,
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmar();
          } else if (e.key === "Escape" && borrador !== null) {
            // Este Escape es del campo (suelta lo escrito): la hoja no se cierra.
            e.stopPropagation();
            setBorrador(null);
          }
        },
      }}
    />
  );
}
