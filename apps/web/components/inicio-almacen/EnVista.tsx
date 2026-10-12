"use client";

import type { CSSProperties, ReactNode } from "react";
import { useAlVerse } from "./useAlVerse";

/**
 * Lo que tiene que «armarse» (un aro que se llena, un trazo que avanza) espera a que la persona lo vea: pone `ia-in` UNA vez
 * cuando el bloque entra en pantalla, y las transiciones de `inicio-almacen.css` hacen el resto. Con «menos movimiento» esas
 * transiciones no existen: ve el resultado, no el viaje.
 */
export function EnVista({
  como = "div",
  className = "",
  style,
  guia,
  children,
}: {
  como?: "div" | "section" | "aside";
  className?: string;
  style?: CSSProperties;
  /** Ancla de la guía interactiva (`data-guia`, ADR-0389): no cambia nada de cómo se ve. */
  guia?: string;
  children: ReactNode;
}) {
  const [ref, visto] = useAlVerse<HTMLDivElement>();
  const clase = `${className} ${visto ? "ia-in" : ""}`.trim();
  if (como === "section") return <section ref={ref} className={clase} style={style} data-guia={guia}>{children}</section>;
  if (como === "aside") return <aside ref={ref} className={clase} style={style} data-guia={guia}>{children}</aside>;
  return <div ref={ref} className={clase} style={style} data-guia={guia}>{children}</div>;
}
