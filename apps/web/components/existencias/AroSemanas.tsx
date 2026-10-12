"use client";

import type { RitmoDePrenda } from "@/lib/existencias-colgar-primero";

/* ====================================================================
   El aro de semanas (maqueta `docs/maquetas/existencias-tactil-2026-10/`): para cuántas semanas alcanza lo que hay de una talla al ritmo
   al que se vende. Verde desde 2 semanas, ámbar con 1 o menos. Lo usa el panel de la talla junto a su ritmo. Vivía en «Colgar primero»,
   que se quitó el 2026-10-06 (ADR-0344, «Quinta vuelta»).
   ==================================================================== */

const LARGO_ARO = 2 * Math.PI * 13;

/** Lleno hasta 6 semanas, verde desde 2, ámbar con 1 o menos (se acaba). Sin ritmo medido, no se dibuja. */
export function AroSemanas({ ritmo, tam = 34 }: { ritmo: RitmoDePrenda; tam?: number }) {
  if (ritmo.tipo !== "medido") return null;
  const semanas = Math.max(0, Math.round(ritmo.semanas));
  const lleno = Math.min(1, ritmo.semanas / 6);
  const color = ritmo.semanas <= 1 ? "var(--color-ambar)" : "var(--color-verde)";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: tam, height: tam }} aria-hidden>
      <svg viewBox="0 0 34 34" className="h-full w-full">
        <circle cx="17" cy="17" r="13" fill="none" stroke="var(--color-hueso)" strokeWidth="4" />
        <circle
          cx="17"
          cy="17"
          r="13"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(lleno * LARGO_ARO).toFixed(1)} ${LARGO_ARO.toFixed(1)}`}
          transform="rotate(-90 17 17)"
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums text-tinta">{Number.isFinite(semanas) ? semanas : "+"}</span>
    </span>
  );
}
