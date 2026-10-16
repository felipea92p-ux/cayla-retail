import Link from "next/link";
import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import type { PulsoCierre } from "@/lib/cierre-pulso-reglas";

// Cierre de mes en camino A (Felipe 2026-10-15): «¿Puedo cerrar octubre?» con lo que falta en una cifra, el anillo de lo que
// ya está (los chequeos que frenan y ya pasaron) y las primeras cosas por resolver, cada una con el enlace a donde se
// arregla. La matriz y los chequeos de siempre siguen debajo: aquí solo se responde. Sin estado.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });
const PRIMERAS = 3;

export function CierrePulso({ pulso }: { pulso: PulsoCierre }) {
  const cosas = pulso.cosas.slice(0, PRIMERAS);
  return (
    <>
      <section className="fin-pulso-hero" aria-labelledby="fin-cierre-pregunta" data-guia="fin-cierre.pulso">
        <p id="fin-cierre-pregunta" {...entra("fin-pulso-pregunta", 1)}>
          ¿Puedo cerrar {nombreMesDe(pulso.mes)}?
        </p>
        <div {...entra("fin-cierre-anillo", 2)} role="img" aria-label={`${pulso.hechos} de ${pulso.total} chequeos ya pasaron`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="fin-cierre-pista" cx="60" cy="60" r="52" pathLength={1} />
            <circle className="fin-cierre-valor" cx="60" cy="60" r="52" pathLength={1} data-estado={pulso.estado} style={{ strokeDashoffset: 1 - pulso.pct / 100 }} />
          </svg>
          <span className="fin-cierre-anillo-num">
            <b className="num">{pulso.estado === "faltan" ? pulso.faltan : "✓"}</b>
            <small>{pulso.estado === "faltan" ? (pulso.faltan === 1 ? "cosa" : "cosas") : pulso.estado === "cerrado" ? "cerrado" : "listo"}</small>
          </span>
        </div>
        <p {...entra("fin-pulso-verbo", 3)}>{pulso.frase}</p>
        <p {...entra("fin-pulso-explica", 4)}>{pulso.explica}</p>
      </section>

      {cosas.length > 0 && (
        <div {...entra("", 5)}>
          <Superficie pad guia="fin-cierre.cosas">
            <CabeceraBloque titulo="Lo primero que falta" bajada="Lo que frena el cierre va primero; lo que solo avisa, después.">
              <Chip tono={pulso.faltan > 0 ? "ambar" : "pizarra"} vivo={pulso.faltan > 0}>
                {pulso.faltan > 0 ? `${pulso.faltan} ${pulso.faltan === 1 ? "frena" : "frenan"}` : "Solo avisos"}
              </Chip>
            </CabeceraBloque>
            <ul className="fin-chequeos">
              {cosas.map((c) => (
                <li key={c.clave}>
                  <span className="fin-ok-ic" data-tono={c.bloquea ? "rojo" : "ambar"} aria-label={c.bloquea ? "falta (frena el cierre)" : "aviso"}>
                    !
                  </span>
                  <div className="min-w-0">
                    <b>
                      {c.titulo} <small className="text-taupe">· {c.unidad}</small>
                    </b>
                    <p>{c.detalle}</p>
                  </div>
                  {c.href ? (
                    <Link href={c.href} className="btn-cayla btn-sutil btn-chico">
                      Resolver
                    </Link>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
            {pulso.cosas.length > PRIMERAS && <p className="fin-gastos-cosa-mas">Y {pulso.cosas.length - PRIMERAS} más, en los chequeos de cada unidad, abajo.</p>}
          </Superficie>
        </div>
      )}
    </>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function nombreMesDe(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}
