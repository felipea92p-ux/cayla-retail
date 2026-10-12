"use client";

import { useId, useState } from "react";
import { MuestraTramo } from "@/components/ui/BarraApilada";
import { CAUSAS_SIN_SABER, CLASE_TRAMO_PISO, NOMBRE_TRAMO_PISO, TEXTO_CAUSA_SIN_SABER, type ConteoSinSaber } from "@/lib/frescura-piso";

// La cifra de «Aún no se sabe» con su porqué a un toque (ADR-0208, act. 2026-10-10 (c); ley 6: la ciega no supo qué lo causa). El porqué
// se despliega EN SU LUGAR, empujando lo de abajo: flotando tapaba el botón del aviso de la puerta y no se cerraba con Escape ni al tocar
// fuera (revisión adversaria). Un botón con `aria-expanded`, como los demás «¿Por qué?» del ERP.

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

export function CifraSinSaber({ pct, cuantas, causas }: { pct: number; cuantas: number; causas: ConteoSinSaber }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const conCausa = CAUSAS_SIN_SABER.filter((c) => causas[c] > 0);
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[13px] text-taupe">
        <MuestraTramo clase={CLASE_TRAMO_PISO.sin_saber} />
        {NOMBRE_TRAMO_PISO.sin_saber}
        {conCausa.length > 0 && (
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={id}
            onClick={() => setAbierto((v) => !v)}
            className="btn-cayla btn-enlace -my-[3px] inline-flex min-h-6 items-center text-[12.5px]"
          >
            ¿Por qué?
          </button>
        )}
      </dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="whitespace-nowrap font-display text-[28px] leading-none tabular-nums">{pct} %</span>
        <span className="text-[12.5px] tabular-nums text-taupe">{unidades(cuantas)}</span>
      </dd>
      {abierto && (
        <dd id={id} className="mt-1.5">
          <ul className="space-y-0.5 text-[12.5px] leading-snug text-taupe">
            {conCausa.map((c) => (
              <li key={c}>
                <span className="tabular-nums text-tinta">{unidades(causas[c])}</span>: {TEXTO_CAUSA_SIN_SABER[c]}.
              </li>
            ))}
          </ul>
        </dd>
      )}
    </div>
  );
}
