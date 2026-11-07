"use client";

import type { CSSProperties } from "react";
import { useParte } from "@/components/finanzas/estados/PartesDelEstado";
import type { ColumnaCascada } from "@/lib/estados-flujo";

function Columna({ c, i }: { c: ColumnaCascada; i: number }) {
  const p = useParte(c.clave, c.nombre);
  return (
    <span role="img" className="estados-cc" data-total={c.total || undefined} style={{ "--i": i, "--c": c.color } as CSSProperties} {...p}>
      <span className="estados-cc-plano">
        <span className="estados-cc-col" style={{ bottom: `${c.abajo}%`, height: `${c.alto}%` }} />
        <span className="estados-cc-val tabular-nums" data-signo={c.total ? undefined : c.texto.startsWith("−") ? "menos" : "mas"} style={{ bottom: `calc(${c.abajo + c.alto}% + 6px)` }}>
          {c.texto}
        </span>
        {c.enlace !== null && <span className="estados-cc-enlace" style={{ bottom: `${c.enlace}%` }} />}
      </span>
      <span className="estados-cc-nombre">{c.nombre}</span>
    </span>
  );
}

/** Por qué cambió la plata (ADR-0611): de cuánto se partió, cada cosa que la movió y con cuánto se terminó. Cada movimiento empieza donde terminó el anterior. */
export function CascadaDeColumnas({ columnas, etiqueta }: { columnas: readonly ColumnaCascada[]; etiqueta: string }) {
  return (
    <div className="estados-cascada" role="group" aria-label={etiqueta} style={{ "--n": columnas.length } as CSSProperties}>
      {columnas.map((c, i) => (
        <Columna key={c.clave} c={c} i={i} />
      ))}
    </div>
  );
}
