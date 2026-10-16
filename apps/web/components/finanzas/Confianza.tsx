import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { textoEstado, tonoPieza, type Confianza } from "@/lib/finanzas-confianza";

// El medidor de confianza (ADR-0417, Fase 1): «qué tan seguro es este número». Un arco que se dibuja hasta el porcentaje,
// la frase que lo explica y, debajo, cada pieza con su insignia (completo · a medias · falta · sin dato), su frase en
// lenguaje de tienda y, si falta algo, el enlace a la pantalla donde se arregla. No calcula nada: la calificación viene de
// `lib/finanzas-confianza.ts` (pura, con prueba); aquí solo se dibuja. Se apaga con `prefers-reduced-motion` (el arco queda
// quieto en su valor). Sin estado propio: sirve en el servidor y en el cliente.

export function Confianza({ confianza, guia }: { confianza: Confianza; guia?: string }) {
  const c = confianza;
  return (
    <Superficie pad guia={guia}>
      <div className="fin-confianza" data-nivel={c.nivel}>
        <div className="fin-confianza-cab">
          <CabeceraBloque titulo="Qué tan seguro es este número" bajada={c.frase} />
          <div className="fin-confianza-arco" role="img" aria-label={`${c.pct} % de confianza en el número del mes`}>
            <svg viewBox="0 0 120 68" aria-hidden="true">
              <path className="fin-confianza-pista" d="M10 60 A50 50 0 0 1 110 60" pathLength={1} />
              <path className="fin-confianza-valor" d="M10 60 A50 50 0 0 1 110 60" pathLength={1} style={{ strokeDashoffset: 1 - c.pct / 100 }} />
            </svg>
            <span className="fin-confianza-pct num">{c.pct} %</span>
          </div>
        </div>
        <ul className="fin-confianza-piezas" aria-label="Lo que hace confiable el número">
          {c.piezas.map((p) => (
            <li key={p.clave} data-estado={p.estado}>
              <Chip tono={tonoPieza(p.estado)}>{textoEstado(p.estado)}</Chip>
              <div className="min-w-0">
                <b>{p.titulo}</b>
                <p>
                  {p.detalle}
                  {p.href && p.accion && (
                    <>
                      {" "}
                      <Link href={p.href} className="btn-cayla btn-enlace">
                        {p.accion}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Superficie>
  );
}
