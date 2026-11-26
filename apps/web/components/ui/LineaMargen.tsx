"use client";

import { CircleAlert } from "lucide-react";
import { useMargenObjetivo } from "@/components/ReglasDePrecio";
import { margenALaVista } from "@/lib/margen-a-la-vista";
import type { Rasgo } from "@/lib/margen-por-rasgos";

// La línea viva del margen (tarea 8 de Recibir): «Te quedan S/ 34.25 · 49 %» junto al costo y el precio. Verde si el precio llega al objetivo
// de la prenda (la base del Admin más sus casillas, ADR-0700), ámbar si no (dice desde qué precio llega) y rojo si se pierde. Sin costo o sin
// precio no se dibuja. Solo va donde la persona ya ve el costo: la pantalla decide si la pone. La cuenta es la única de CAYLA (ADR-0668):
// todas las prendas igual, con o sin factura.
const TONO = { normal: "text-verde", bajo: "text-ambar", pierdes: "text-rojo-profundo" } as const;

export function LineaMargen({
  costo,
  precio,
  rasgos,
  soloSoles = false,
  className = "",
}: {
  costo: string | number | null | undefined;
  precio: string | number | null | undefined;
  /** Lo que la prenda tiene (sus casillas): sube el objetivo. Sin casillas, la base. */
  rasgos?: readonly Rasgo[];
  /** Solo «Te quedan S/ 34.25», donde el % ya está a la vista (Nuevo producto). */
  soloSoles?: boolean;
  className?: string;
}) {
  const objetivo = useMargenObjetivo(rasgos);
  const m = margenALaVista(costo, precio, objetivo);
  if (!m) return null;
  // Con `soloSoles`, la pantalla ya dice «Bajo tu objetivo» debajo de la cifra grande: aquí solo a cuánto subir.
  const desde = m.tono === "bajo" && m.objetivo !== null ? `${soloSoles ? "Sube a" : `Bajo tu objetivo de ${objetivo} %: sube a`} S/ ${m.objetivo.toFixed(2)}` : null;
  return (
    <p
      className={`flex flex-wrap items-center gap-x-1.5 text-sm font-semibold tabular-nums ${TONO[m.tono]} ${className}`}
      data-margen={m.tono}
      // La rebaja que aguanta se dice aquí y no en otra línea: es el mismo número que el % (Felipe 2026-11-24, «poco texto a la vista»).
      title={m.tono === "pierdes" ? "El precio no cubre lo que pagaste más la parte de SUNAT" : "Ese % es también la rebaja más grande que aguanta sin perder"}
      aria-live="polite"
    >
      {/* Bajo el objetivo o en pérdida, además del color, el ícono: el ámbar y el verde se parecen a 14 px. */}
      {m.tono !== "normal" && <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{soloSoles ? m.enSoles : m.texto}</span>
      {/* En su propio renglón: partido a 375 px, un «·» al inicio se veía roto. */}
      {desde && <span className="basis-full pl-5 font-normal">{desde}</span>}
    </p>
  );
}
