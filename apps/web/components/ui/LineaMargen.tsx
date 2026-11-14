import { CircleAlert } from "lucide-react";
import { margenALaVista } from "@/lib/margen-a-la-vista";

// La línea viva del margen (tarea 8 de Recibir): «Ganas S/ 34 · 48 %» junto al costo y el precio. Verde con 30 % o más, ámbar debajo y rojo si
// el precio no cubre el costo. Sin costo o sin precio no se dibuja. Solo va donde la persona ya ve el costo: la pantalla decide si la pone.
const TONO = { normal: "text-verde", bajo: "text-ambar", pierdes: "text-rojo-profundo" } as const;

export function LineaMargen({
  costo,
  precio,
  soloSoles = false,
  className = "",
}: {
  costo: string | number | null | undefined;
  precio: string | number | null | undefined;
  /** Solo «Ganas S/ 34», donde el % ya está a la vista (Nuevo producto). */
  soloSoles?: boolean;
  className?: string;
}) {
  const m = margenALaVista(costo, precio);
  if (!m) return null;
  return (
    <p
      className={`flex items-center gap-1.5 text-sm font-semibold tabular-nums ${TONO[m.tono]} ${className}`}
      data-margen={m.tono}
      title={m.tono === "normal" ? undefined : m.tono === "bajo" ? "Menos de 30 % de margen" : "El precio no cubre el costo"}
      aria-live="polite"
    >
      {/* Bajo 30 % o en pérdida, además del color, el ícono: el ámbar y el verde se parecen a 14 px. */}
      {m.tono !== "normal" && <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{soloSoles ? m.enSoles : m.texto}</span>
    </p>
  );
}
