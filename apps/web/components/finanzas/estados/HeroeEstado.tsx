import type { ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { CifraQueRueda } from "@/components/finanzas/estados/CifraQueRueda";

const TONO_CHIP = { bien: "verde", mal: "rojo" } as const;

/**
 * Lo primero de cada estado (ADR-0611): una cifra enorme, una frase que la interpreta, contra qué se compara y un solo gráfico. Es lo que se entiende en cinco segundos;
 * lo demás viene abajo.
 */
export function HeroeEstado({
  nombre,
  valor,
  mal,
  conSigno,
  frase,
  chip,
  guia,
  conAire,
  children,
}: {
  /** «Ganancias y pérdidas · Octubre 2026». */
  nombre: string;
  valor: number;
  mal?: boolean;
  conSigno?: boolean;
  frase: string;
  chip?: { texto: string; tono: "bien" | "mal" | null } | null;
  guia?: string;
  /** El gráfico no llega a los bordes de la placa. */
  conAire?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="placa-estados estados-heroe" data-guia={guia}>
      <h2 className="estados-heroe-nombre">{nombre}</h2>
      <CifraQueRueda valor={valor} mal={mal} conSigno={conSigno} className="estados-heroe-cifra" />
      <p className="estados-frase">{frase}</p>
      {chip && (
        <div className="estados-heroe-chip">
          <Chip tono={chip.tono ? TONO_CHIP[chip.tono] : "pizarra"} versalitas={false}>
            {chip.texto}
          </Chip>
        </div>
      )}
      {children && (
        <div className="estados-grafico" data-aire={conAire || undefined}>
          {children}
        </div>
      )}
    </section>
  );
}
