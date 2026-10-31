"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { solesConSigno } from "@/lib/flujo-caja-reglas";
import type { ClaveEstado, RespuestaEstado } from "@/lib/estados-financieros-reglas";

// Las cuatro respuestas de Estados financieros (ADR-0585, maqueta `docs/maquetas/finanzas-eeff-2026-10/`): cada una es una pregunta de
// tienda con su cifra, y a la vez la pestaña de su estado. Es la `TarjetaCifra` del sistema (ADR-0358) en su forma de FILTRO: la elegida
// queda rellena de arena (`activa`) y tocar otra pasa a su estado, con la sede y el mes de la barra. El nombre formal va al pie, chico.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

export function RespuestasEstados({ respuestas, activa, hrefs }: { respuestas: readonly RespuestaEstado[]; activa: ClaveEstado; hrefs: Record<ClaveEstado, string> }) {
  const router = useRouter();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-guia="fin-estados.respuestas" role="group" aria-label="Los cuatro estados financieros">
      {respuestas.map((r, i) => {
        const comunes = {
          etiqueta: r.pregunta,
          pie: r.formal,
          activa: r.clave === activa,
          onClick: () => {
            if (r.clave !== activa) router.push(hrefs[r.clave]);
          },
          guia: `fin-estados.${r.clave}`,
          ...entra(i + 1),
        };
        if (r.valor === null)
          return (
            <TarjetaCifra key={r.clave} {...comunes} valor={null} noSePudoLeer={r.noSePudoLeer}>
              {r.contexto}
            </TarjetaCifra>
          );
        return (
          <TarjetaCifra
            key={r.clave}
            {...comunes}
            punto={r.punto ?? undefined}
            valor={r.conSigno ? solesConSigno(r.valor) : <CifraAnimada valor={Math.round(r.valor)} formato="soles-redondo" />}
          >
            {r.contexto}
          </TarjetaCifra>
        );
      })}
    </div>
  );
}
