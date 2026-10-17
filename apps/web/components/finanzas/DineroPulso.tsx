import Link from "next/link";
import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import type { Alcanza, Debes, Tienes } from "@/lib/dinero-pulso-reglas";

// Cuentas y dinero en camino A (Felipe 2026-10-15): arriba de la lista de cuentas, la respuesta grande «Tienes S/ X» y, al
// lado, «¿Me alcanza?» (la semana que baja del mínimo y qué pasa si depositas lo guardado) y «¿Qué debes?» (lo vencido y lo
// próximo). No calcula: lo deciden `lib/dinero-pulso-reglas.ts` y las funciones de la base de siempre. Sin estado: sirve en
// el servidor.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });

export function DineroPulso({ tienes, alcanza, debes, verPorPagar }: { tienes: Tienes; alcanza: Alcanza; debes: Debes; verPorPagar: string }) {
  return (
    <>
      <section className="fin-pulso-hero" aria-labelledby="fin-dinero-pregunta" data-guia="fin-dinero.pulso">
        <p id="fin-dinero-pregunta" {...entra("fin-pulso-pregunta", 1)}>
          ¿Dónde está mi plata?
        </p>
        <p {...entra("fin-pulso-respuesta", 2)}>
          <span className="fin-pulso-verbo">tienes</span>
          <span className="fin-pulso-monto">
            <CifraAnimada valor={Math.round(tienes.total)} formato="soles" />
          </span>
        </p>
        <p {...entra("fin-pulso-explica", 3)}>{tienes.frase}</p>
        {tienes.partes.length > 0 && (
          <ul {...entra("fin-dinero-partes", 4)} aria-label="Dónde está">
            {tienes.partes.map((p) => (
              <li key={p.clave}>
                <span>{p.titulo}</span>
                <b className="num">{soles(p.monto)}</b>
              </li>
            ))}
            {tienes.tarjeta > 0 && (
              <li data-deuda="">
                <span>Debes en la tarjeta</span>
                <b className="num">{soles(tienes.tarjeta)}</b>
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="fin-dos-col">
        <div {...entra("", 5)}>
          <Superficie pad guia="fin-dinero.alcanza">
            <CabeceraBloque titulo="¿Me alcanza?" bajada={alcanza.frase} />
            {alcanza.estado !== "sin_dato" && (
              <div className="fin-dinero-alcanza">
                <Chip tono={alcanza.estado === "baja" ? "ambar" : "verde"}>
                  {alcanza.estado === "baja" ? "Baja del mínimo" : "Dentro del mínimo"}
                </Chip>
                {alcanza.diasDeCaja !== null && (
                  <Chip tono="pizarra">
                    {alcanza.diasDeCaja} {alcanza.diasDeCaja === 1 ? "día de caja" : "días de caja"}
                  </Chip>
                )}
                {alcanza.siDepositas && <p className="nota-cayla mt-3">{alcanza.siDepositas.frase}</p>}
                <p className="fin-dinero-ver">
                  <Link href="/finanzas/reportes/flujo" className="btn-cayla btn-enlace">
                    Ver el flujo semana a semana
                  </Link>
                </p>
              </div>
            )}
          </Superficie>
        </div>
        <div {...entra("", 6)}>
          <Superficie pad guia="fin-dinero.debes">
            <CabeceraBloque titulo="¿Qué debes?" bajada={debes.frase} />
            <div className="fin-dinero-alcanza">
              <Chip tono={debes.tono} vivo={debes.tono === "rojo" || debes.tono === "ambar"}>
                {debes.n === 0 ? "Sin deudas registradas" : `${soles(debes.total)} en ${debes.n} ${debes.n === 1 ? "factura" : "facturas"}`}
              </Chip>
              {debes.n > 0 && (
                <p className="fin-dinero-ver">
                  <Link href={verPorPagar} className="btn-cayla btn-enlace">
                    Ver todo lo que debes
                  </Link>
                </p>
              )}
            </div>
          </Superficie>
        </div>
      </section>
    </>
  );
}
