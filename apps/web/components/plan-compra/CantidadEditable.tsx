"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { limpiarCantidad } from "@/lib/alta-producto";
import { leerCantidadDelPlan } from "@/lib/plan-compra-reglas";

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
  const invalida = borrador !== null && leerCantidadDelPlan(borrador, valor, max).tipo === "rechazo";
  /** Al salir del campo o con Enter. `false`: lo escrito no era una cantidad, y se dijo. Se dice en la esquina: esta caja va en filas y celdas sin lugar para una frase, y el aviso sobrevive si el mismo clic cambia de paso. */
  const confirmar = (): boolean => {
    if (borrador === null) return true;
    setBorrador(null);
    const r = leerCantidadDelPlan(borrador, valor, max);
    if (r.tipo === "rechazo") {
      avisar.aviso(r.aviso);
      return false;
    }
    if (r.tipo === "fijar") onCambiar(r.n);
    return true;
  };
  return (
    <PasoCantidad
      tamano={tamano}
      sufijo={sufijo}
      tono={invalida ? "error" : tono}
      className="max-w-full"
      menos={{ onClick: () => onCambiar(Math.max(0, valor - 1)), deshabilitado: deshabilitado || valor <= 0, etiqueta: `Menos ${etiqueta}` }}
      mas={{ onClick: () => onCambiar(Math.min(max, valor + 1)), deshabilitado: deshabilitado || valor >= max, etiqueta: `Más ${etiqueta}` }}
      campo={{
        value: mostrado,
        inputMode: "numeric",
        autoComplete: "off",
        disabled: deshabilitado,
        "aria-label": etiqueta,
        "aria-invalid": invalida || undefined,
        style: { width: `${Math.max(2, mostrado.length + 0.5)}ch` },
        onFocus: (e) => e.currentTarget.select(),
        onChange: (e) => setBorrador(limpiarCantidad(e.target.value)),
        onBlur: confirmar,
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Lo que no valió vuelve a su número, elegido para escribir encima.
            const caja = e.currentTarget;
            if (!confirmar()) requestAnimationFrame(() => caja.select());
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
