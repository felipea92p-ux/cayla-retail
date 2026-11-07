import { TuboDePartes } from "@/components/finanzas/estados/PartesDelEstado";
import type { ParteEstado } from "@/lib/estados-partes";

function Fila({ rotulo, cifra, partes, huecos }: { rotulo: string; cifra: string; partes: readonly ParteEstado[]; huecos?: readonly string[] }) {
  return (
    <div className="estados-tubo-fila">
      <div className="estados-tubo-rotulo">
        <span>{rotulo}</span>
        <b className="tabular-nums">{cifra}</b>
      </div>
      <TuboDePartes partes={partes} huecos={huecos} etiqueta={rotulo} />
    </div>
  );
}

/** El Balance (ADR-0611): dos tubos del mismo largo. Activo, contra Pasivo + Patrimonio: que midan lo mismo es que cuadre. El Patrimonio es lo que queda: un hueco. */
export function TubosDelBalance({
  arriba,
  abajo,
  huecos,
  guia,
}: {
  arriba: { rotulo: string; cifra: string; partes: readonly ParteEstado[] };
  abajo: { rotulo: string; cifra: string; partes: readonly ParteEstado[] };
  huecos: readonly string[];
  guia?: string;
}) {
  return (
    <div className="estados-tubos" data-guia={guia}>
      <Fila {...arriba} />
      <Fila {...abajo} huecos={huecos} />
    </div>
  );
}
