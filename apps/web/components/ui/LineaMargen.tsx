"use client";

import { CircleAlert } from "lucide-react";
import { margenALaVista } from "@/lib/margen-a-la-vista";

// La línea viva del margen (tarea 8 de Recibir): «Te quedan S/ 34.25 · 49 %» junto al costo y el precio. Verde si el precio aguanta una
// rebaja de 35 %, ámbar si no (dice desde qué precio la aguanta) y rojo si se pierde. Sin costo o sin precio no se dibuja. Solo va donde la
// persona ya ve el costo: la pantalla decide si la pone. La cuenta es la única de CAYLA (ADR-0668): todas las prendas igual, con o sin factura.
const TONO = { normal: "text-verde", bajo: "text-ambar", pierdes: "text-rojo-profundo" } as const;

export function LineaMargen({
  costo,
  precio,
  soloSoles = false,
  className = "",
}: {
  costo: string | number | null | undefined;
  precio: string | number | null | undefined;
  /** Solo «Te quedan S/ 34.25», donde el % ya está a la vista (Nuevo producto). */
  soloSoles?: boolean;
  className?: string;
}) {
  const m = margenALaVista(costo, precio);
  if (!m) return null;
  // Con `soloSoles`, la pantalla ya dice «Aguanta poca rebaja» debajo de la cifra grande: aquí solo a cuánto subir.
  const desde = m.tono === "bajo" && m.piso !== null ? `${soloSoles ? "sube a" : "aguanta poca rebaja: sube a"} S/\u00a0${m.piso.toFixed(2)}` : null;
  return (
    <p
      className={`flex flex-wrap items-center gap-x-1.5 text-sm font-semibold tabular-nums ${TONO[m.tono]} ${className}`}
      data-margen={m.tono}
      title={m.tono === "pierdes" ? "El precio no cubre lo que pagaste más la parte de SUNAT" : undefined}
      aria-live="polite"
    >
      {/* Bajo el piso o en pérdida, además del color, el ícono: el ámbar y el verde se parecen a 14 px. */}
      {m.tono !== "normal" && <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{soloSoles ? m.enSoles : m.texto}</span>
      {desde && <span className="font-normal">· {desde}</span>}
    </p>
  );
}
