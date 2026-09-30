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
  children,
}: {
  como?: "div" | "section" | "aside";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [ref, visto] = useAlVerse<HTMLDivElement>();
  const clase = `${className} ${visto ? "ia-in" : ""}`.trim();
  if (como === "section") return <section ref={ref} className={clase} style={style}>{children}</section>;
  if (como === "aside") return <aside ref={ref} className={clase} style={style}>{children}</aside>;
  return <div ref={ref} className={clase} style={style}>{children}</div>;
}
