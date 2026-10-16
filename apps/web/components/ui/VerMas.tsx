"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/* ====================================================================
   «Ver más / Ver menos» — una sola pieza (ADR-0358, ronda 15, Felipe eligió P1 el 2026-10-15)

   Una lista muestra sus primeras filas y guarda las demás. La pieza es la franja de Inicio de Almacén:
   · `forma="pie"` (de fábrica): a todo el ancho, al pie de la tarjeta, sobre una raya; «Ver 3 más» en taupe con la flecha hacia abajo.
   · `forma="enlace"`: la misma frase y la misma flecha como enlace, para una lista suelta (fuera de una tarjeta).
   Al abrir dice «Ver menos» y la flecha da media vuelta; las filas de más bajan EN SU LUGAR con <FilasDeMas> (0fr → 1fr, 400 ms, sin
   medir alturas) y, cerradas, quedan `inert`: ni se ven ni se alcanzan con el teclado. Registro: docs/unificar/accion.siguiente.md.
   Nunca un «Ver más» ni un «Ver menos» a mano.
   ==================================================================== */

export function BotonVerMas({
  abierto,
  onCambiar,
  texto,
  forma = "pie",
  controla,
  className = "",
  "data-guia": guia,
}: {
  abierto: boolean;
  onCambiar: (abierto: boolean) => void;
  /** Lo que dice cerrado: «Ver 3 más», «Ver las 12», «Ver 4 pendientes más». Abierto dice «Ver menos». */
  texto: ReactNode;
  forma?: "pie" | "enlace";
  /** El id de lo que abre (aria-controls). */
  controla?: string;
  /** Solo posición (márgenes), nunca la cara. */
  className?: string;
  "data-guia"?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onCambiar(!abierto)}
      aria-expanded={abierto}
      aria-controls={controla}
      data-guia={guia}
      className={`${forma === "pie" ? "ver-mas-pie" : "btn-cayla btn-enlace ver-mas-enlace"} ${className}`}
    >
      {abierto ? "Ver menos" : texto}
      <ChevronDown aria-hidden className="ver-mas-flecha" />
    </button>
  );
}

/** Las filas que la lista guarda: bajan en su lugar al abrir y, cerradas, no se alcanzan con el teclado. */
export function FilasDeMas({ abierto, id, children, className = "" }: { abierto: boolean; id?: string; children: ReactNode; className?: string }) {
  return (
    <div id={id} className={`filas-de-mas ${className}`} data-abierto={abierto || undefined} inert={!abierto}>
      <div>{children}</div>
    </div>
  );
}
