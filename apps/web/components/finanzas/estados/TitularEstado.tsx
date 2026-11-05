import type { CSSProperties, ReactNode } from "react";

// La respuesta de cada estado, como en la maqueta aprobada (ADR-0585): el nombre formal en versalitas («Ganancias y pérdidas ·
// octubre»), la respuesta en serif con su «Sí.» en verde o «No.» en rojo, y la frase que la explica. A la derecha, lo que la pantalla
// necesite junto a la respuesta (la fecha del Balance). Entra una vez, en cascada (ADR-0136).

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

export function TitularEstado({
  formal,
  si,
  respuesta,
  bajada,
  derecha,
  guia,
}: {
  formal: string;
  /** `true`: «Sí.» en verde; `false`: «No.» en rojo; sin él, la respuesta sola («CAYLA vale S/ X»). */
  si?: boolean;
  respuesta: string;
  bajada?: ReactNode;
  derecha?: ReactNode;
  guia?: string;
}) {
  return (
    <header className="fin-titular" data-guia={guia}>
      <div className="min-w-0">
        <p {...entra(0)}>
          <span className="label-cayla text-[11px] text-taupe">{formal}</span>
        </p>
        <h2 {...entra(1)}>
          {si !== undefined && <span data-si={si}>{si ? "Sí." : "No."} </span>}
          {respuesta}
        </h2>
        {bajada && (
          <p className="fin-titular-bajada anim-entra" style={{ ["--i" as string]: 2 } as CSSProperties}>
            {bajada}
          </p>
        )}
      </div>
      {derecha && <div {...entra(2)}>{derecha}</div>}
    </header>
  );
}
