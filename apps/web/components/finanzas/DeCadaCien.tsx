"use client";

import { useState, type CSSProperties } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { COLOR_TIPO } from "@/components/finanzas/RecorridoPlata";
import type { DeCadaCien } from "@/lib/de-cada-cien-reglas";
import { soles } from "@/lib/flujo-caja-reglas";

// Finanzas ▸ Resumen, «De cada S/ 100 que vendes» (Felipe 2026-10-24, spike 3-A). Solo DIBUJA lo que arma `deCadaCien`: cien cuadros, uno por sol
// de cada cien, del color de lo que se llevó cada uno (los mismos colores del recorrido de la plata). Vive a un toque bajo el recorrido: la frase ya
// está arriba, en la respuesta; esto es «¿dónde está cada cuadro?». Tocar un renglón enciende solo sus cuadros.

export function DeCadaCienPieza({ cien, colorDeSede }: { cien: DeCadaCien; colorDeSede: Record<string, string> }) {
  const [abierto, setAbierto] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  // Un mes que pierde no tiene cuadros que llenar: la frase de la respuesta lo dice y aquí no hay nada que abrir.
  if (cien.tipo !== "queda") return null;
  const color = (p: DeCadaCien & { tipo: "queda" }, i: number) => {
    const parte = p.partes[i]!;
    return COLOR_TIPO[parte.tipo] ?? (parte.sedeId ? colorDeSede[parte.sedeId] : undefined) ?? "var(--color-taupe)";
  };
  let n = 0;
  const cuadros = cien.partes.flatMap((p, i) => [...Array(p.cuadros)].map(() => ({ clave: p.clave, color: color(cien, i), i: n++ })));
  return (
    <div className="mt-4 border-t border-sand pt-3" data-guia="fin-resumen.cien">
      <BotonVerMas forma="enlace" abierto={abierto} onCambiar={setAbierto} controla="fin-cien" texto="¿Y de cada S/\u00a0100?" />
      <FilasDeMas abierto={abierto}>
        <div id="fin-cien" className="fin-cien mt-3">
          <div className="fin-cien-cuadros" data-foco={foco ?? undefined} role="img" aria-label={cien.titular}>
            {cuadros.map((c) => (
              <i key={c.i} data-en={c.clave === foco ? "" : undefined} style={{ ["--c" as string]: c.color, ["--i" as string]: c.i } as CSSProperties} />
            ))}
          </div>
          <div>
            <p className="m-0 font-serif text-xl leading-snug">{cien.titular}</p>
            <p className="mb-2 mt-1 text-xs text-taupe">Cada cuadro es un sol de cada cien. Toca un renglón para ver dónde están sus cuadros.</p>
            <ul className="fin-cien-lista" aria-label="A dónde va cada S/\u00a0100">
              {cien.partes.map((p, i) => (
                <li key={p.clave}>
                  <button type="button" aria-pressed={foco === p.clave} onClick={() => setFoco(foco === p.clave ? null : p.clave)} style={{ ["--c" as string]: color(cien, i) } as CSSProperties}>
                    <i aria-hidden />
                    <span>{p.nombre}</span>
                    <b className="num">{p.cuadros > 0 ? `S/ ${p.cuadros}` : "menos de S/ 1"}</b>
                    <span className="num text-xs text-taupe">{soles(p.monto)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </FilasDeMas>
    </div>
  );
}
