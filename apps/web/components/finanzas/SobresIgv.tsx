import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { solesRedondo } from "@/lib/gastos-reglas";
import type { Sobre } from "@/lib/impuestos-sobres-reglas";

// Finanzas ▸ Impuestos en «El telar» (Felipe 2026-10-23): un sobre por mes. Lo decide `lib/impuestos-sobres-reglas.ts`; tocar un
// sobre lleva a ese mes. La tapa se entreabre al pasar el mouse; el lacre de «pagado» espera a que el sistema sepa qué mes pagó
// cada pago a SUNAT (decisión de Felipe).

export function SobresIgv({ sobres, onElegir, mesEnCurso, aDeclarar, guia }: { sobres: Sobre[]; onElegir: (mes: string) => void; mesEnCurso: string; aDeclarar: string; guia?: string }) {
  return (
    <Superficie pad className="fin-sobres-bloque anim-sube" guia={guia}>
      <CabeceraBloque titulo="Cada mes, su sobre" bajada="Abierto si falta algo; punteado si el mes todavía corre. Toca un mes para verlo arriba." />
      <div className="fin-sobres">
        {sobres.map((s, i) => (
          <button
            key={s.mes}
            type="button"
            className="fin-sobre anim-entra"
            data-forma={s.forma}
            aria-current={s.elegido ? "true" : undefined}
            aria-label={`${s.nombre}: ${s.aFavor ? `${solesRedondo(s.monto)} a favor` : solesRedondo(s.monto)}${s.estado === "a_favor" ? "" : `, ${s.texto}`}${s.elegido ? " (lo estás viendo)" : ""}`}
            style={{ ["--i" as string]: i } as CSSProperties}
            // Guía interactiva (ADR-0389): el mes en curso y el que se declara ahora, para pasar de uno al otro y volver.
            data-guia={s.mes === mesEnCurso ? "fin-impuestos.mes-en-curso" : s.mes === aDeclarar ? "fin-impuestos.mes-a-declarar" : undefined}
            onClick={() => onElegir(s.mes)}
          >
            <span className="fin-sobre-cuerpo" aria-hidden="true">
              <span className="fin-sobre-tapa" />
            </span>
            <span className="fin-sobre-mes">{s.nombre}</span>
            <span className="fin-sobre-monto">
              {solesRedondo(s.monto)}
              {s.aFavor && <small> a favor</small>}
            </span>
            <Chip tono={s.tono} tachado={false}>
              {s.texto}
            </Chip>
          </button>
        ))}
      </div>
    </Superficie>
  );
}
