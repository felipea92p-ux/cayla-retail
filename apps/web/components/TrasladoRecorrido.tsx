import { Check } from "lucide-react";
import type { EstadoPaso, PasoRecorrido } from "@/lib/traslados-reglas";

// El recorrido de un traslado en el detalle (rediseño 2026-09-22): salió → en camino → recibido → cerrado.
// Los cuatro pasos SÍ son una secuencia, por eso llevan número; cada uno dice cuándo y quién. Qué dice y en
// qué estado está cada paso lo decide `recorridoTraslado` (traslados-reglas.ts, con pruebas): acá solo se pinta.
// El color sigue el mismo reparto que la lista: rojo solo si ya debió llegar, ámbar si hubo diferencia,
// verde lo hecho y tinta el paso en el que está hoy.
const MARCA: Record<EstadoPaso, string> = {
  hecho: "border-verde bg-verde text-crema",
  actual: "border-2 border-tinta bg-papel font-semibold text-tinta",
  urgente: "border-2 border-rojo bg-papel font-semibold text-rojo-profundo",
  alerta: "border-ambar bg-ambar text-crema",
  pendiente: "border-sand bg-papel text-taupe",
};

export function TrasladoRecorrido({ pasos }: { pasos: PasoRecorrido[] }) {
  return (
    <ol aria-label="Recorrido del traslado" className="card-cayla grid grid-cols-2 gap-y-5 px-5 py-4 md:grid-cols-4">
      {pasos.map((p, i) => (
        <li key={p.clave} className="relative grid content-start gap-0.5 pr-3" aria-current={p.estado === "actual" || p.estado === "urgente" ? "step" : undefined}>
          {/* La línea que une un paso con el siguiente: en celular (dos por fila) solo dentro de cada fila. */}
          {i < pasos.length - 1 && (
            <span
              aria-hidden
              className={`absolute left-8 right-0 top-[11px] h-px ${i === 1 ? "max-md:hidden" : ""} ${p.estado === "hecho" ? "bg-verde/50" : "bg-sand"}`}
            />
          )}
          <span aria-hidden className={`relative z-[1] mb-1.5 flex h-[23px] w-[23px] items-center justify-center rounded-full border text-[11px] ${MARCA[p.estado]}`}>
            {p.estado === "hecho" ? <Check strokeWidth={2.2} className="h-3 w-3" /> : p.estado === "alerta" ? "!" : i + 1}
          </span>
          <span className="text-sm font-medium text-tinta">{p.titulo}</span>
          {p.lineas.map((l, k) => (
            <span key={k} className={`text-xs leading-relaxed ${p.estado === "urgente" ? "text-rojo-profundo" : "text-taupe"}`}>
              {l}
            </span>
          ))}
          <span className="sr-only">{ESTADO_LEIDO[p.estado]}</span>
        </li>
      ))}
    </ol>
  );
}

// Lo que un lector de pantalla dice de cada paso: el color y el ícono no le llegan.
const ESTADO_LEIDO: Record<EstadoPaso, string> = {
  hecho: "Hecho.",
  actual: "Paso actual.",
  urgente: "Atrasado.",
  alerta: "Con diferencia.",
  pendiente: "Pendiente.",
};
