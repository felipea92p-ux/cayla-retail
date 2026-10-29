import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import type { Respuesta } from "@/lib/tres-respuestas-reglas";

// Las tres respuestas de arriba del Resumen (Felipe 2026-10-26): ¿cuánto tienes?, ¿cuánto debes pagar pronto?, ¿cuánto te deja este mes?
// Solo DIBUJA lo que arma `tresRespuestas`; cada una es la `TarjetaCifra` del sistema (ADR-0358), con su cifra contando una vez al llegar
// (ADR-0136) y su contexto en una línea. Una que lleva a otra pantalla (la caja, lo que debes) lleva su flecha; sin dato dice por qué.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

export function TresRespuestas({ respuestas, guia = "fin-resumen.respuestas" }: { respuestas: readonly Respuesta[]; guia?: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-3" data-guia={guia}>
      {respuestas.map((x, i) => {
        const contexto = (
          <>
            {x.valor === null ? x.motivo : x.detalle ?? x.motivo}
            {x.chips.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {x.chips.map((c) => (
                  <Chip key={c.texto} tono={c.tono} versalitas={false}>
                    {c.texto}
                  </Chip>
                ))}
              </span>
            )}
          </>
        );
        const comunes = { etiqueta: x.pregunta, ...entra(i + 1), ...(x.href ? { href: x.href } : {}) };
        return x.valor === null ? (
          <TarjetaCifra key={x.clave} {...comunes} valor={null} noSePudoLeer={x.noSePudoLeer}>
            {contexto}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra key={x.clave} {...comunes} valor={<CifraAnimada valor={Math.round(x.valor)} formato="soles-redondo" />}>
            {contexto}
          </TarjetaCifra>
        );
      })}
    </div>
  );
}
