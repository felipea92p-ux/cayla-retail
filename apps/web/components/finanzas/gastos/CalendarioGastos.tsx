"use client";

import type { CSSProperties } from "react";
import { soles } from "@/lib/flujo-caja-reglas";
import type { DiaCalendario } from "@/lib/gastos-telar-reglas";

const DIAS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * El calendario de Gastos (El telar): cuándo se gastó en el mes. Cada día se tiñe más oscuro cuanto más se gastó; tocar un día filtra
 * la lista por ese día, y tocarlo otra vez lo quita. Los días que todavía no llegan no se eligen.
 */
export function CalendarioGastos({ huecos, dias, mesNombre, elegido, onElegir }: { huecos: number; dias: DiaCalendario[]; mesNombre: string; elegido: number | null; onElegir: (dia: number | null) => void }) {
  return (
    <div className="calendario-gastos" role="group" aria-label={`Lo gastado cada día de ${mesNombre}`} data-guia="fin-gastos.calendario">
      {DIAS.map((d, i) => (
        <span key={i} className="calendario-dia-semana" aria-hidden>
          {d}
        </span>
      ))}
      {Array.from({ length: huecos }, (_, i) => (
        <span key={`h${i}`} aria-hidden />
      ))}
      {dias.map((d, i) => (
        <button
          key={d.dia}
          type="button"
          className="calendario-dia"
          disabled={d.futuro}
          aria-pressed={elegido === d.dia}
          data-oscuro={d.intensidad > 0.55 ? "" : undefined}
          style={{ "--a": d.futuro ? 0 : Math.round(8 + d.intensidad * 80), "--i": i } as CSSProperties}
          onClick={() => onElegir(elegido === d.dia ? null : d.dia)}
          aria-label={`${d.dia} de ${mesNombre}: ${d.n ? `${soles(d.total)} en ${d.n} ${d.n === 1 ? "gasto" : "gastos"}` : "sin gastos"}`}
          title={d.futuro ? undefined : d.n ? `${soles(d.total)} · ${d.n} ${d.n === 1 ? "gasto" : "gastos"}` : "Sin gastos"}
        >
          {d.dia}
        </button>
      ))}
    </div>
  );
}
