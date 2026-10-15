"use client";

import { Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { TAMANOS_ICONO } from "@/lib/iconos";

/* ====================================================================
   «Deshacer» — una sola pieza (ADR-0358, ronda 15, Felipe eligió P1 el 2026-10-15)

   Vuelve atrás un cambio que todavía no se guarda (un precio, una talla que se quita, una lectura de más). Es el enlace de una acción
   chica que corrige una sola cosa (ronda 9) con la flecha curva delante, para que se reconozca antes de leer. El «Deshacer» de un
   aviso (`avisar.exito(…, { accion })`) es del aviso, no de esta pieza. Registro: docs/unificar/accion.deshacer.md.
   Nunca un «Deshacer» a mano.
   ==================================================================== */

export function BotonDeshacer({
  onClick,
  disabled,
  children = "Deshacer",
  className = "",
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  /** De fábrica «Deshacer»; otro verbo solo si dice más («Deshacer la lectura»). */
  children?: ReactNode;
  /** Solo posición (márgenes), nunca la cara. */
  className?: string;
  title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`btn-cayla btn-enlace boton-deshacer ${className}`}>
      <Undo2 aria-hidden size={TAMANOS_ICONO.texto} className="shrink-0" />
      {children}
    </button>
  );
}
