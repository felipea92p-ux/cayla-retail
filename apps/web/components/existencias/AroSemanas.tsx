"use client";

import { Anillo } from "@/components/ui/Anillo";
import type { RitmoDePrenda } from "@/lib/existencias-colgar-primero";

/* ====================================================================
   El aro de semanas (maqueta `docs/maquetas/existencias-tactil-2026-10/`): para cuántas semanas alcanza lo que hay de una talla al ritmo
   al que se vende. Lo usa el panel de la talla junto a su ritmo. Vivía en «Colgar primero», que se quitó el 2026-10-06 (ADR-0344,
   «Quinta vuelta»). Desde la ronda 13 de /unificar (2026-10-15) es el anillo chico del sistema: en tinta, lleno (y verde) a las 6
   semanas, y ámbar con 1 o menos (se acaba).
   ==================================================================== */

/** Lleno hasta 6 semanas, ámbar con 1 o menos (se acaba). Sin ritmo medido, no se dibuja. */
export function AroSemanas({ ritmo }: { ritmo: RitmoDePrenda }) {
  if (ritmo.tipo !== "medido") return null;
  const semanas = Math.max(0, Math.round(ritmo.semanas));
  return (
    <Anillo pct={(ritmo.semanas / 6) * 100} tamano="chico" tono={ritmo.semanas <= 1 ? "ambar" : undefined} decorativa>
      {Number.isFinite(semanas) ? semanas : "+"}
    </Anillo>
  );
}
