import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { FaltanProyeccion } from "@/components/finanzas/FaltanProyeccion";
import { soles } from "@/lib/flujo-caja-reglas";
import type { Alcanza, Tienes } from "@/lib/dinero-pulso-reglas";

// Cuentas y dinero en camino A (Felipe 2026-10-15): arriba de la lista de cuentas, la respuesta grande «Tienes S/ X» y, al
// lado, «¿Me alcanza?» (la semana que baja del mínimo y qué pasa si depositas lo guardado) y «¿Qué debes?» (lo vencido y lo
// próximo). No calcula: lo deciden `lib/dinero-pulso-reglas.ts` y las funciones de la base de siempre. Sin estado: sirve en
// el servidor.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });

export function DineroPulso({
  tienes,
  alcanza,
  deCaylaEntera,
  frascos,
}: {
  tienes: Tienes;
  alcanza: Alcanza;
  /** Se mira una sede: la proyección de «¿Me alcanza?» es de toda la empresa y lo dice (no se parte por sede, ADR-0433). */
  deCaylaEntera: boolean;
  /** Las repisas de frascos (El telar), entre la respuesta y las preguntas. */
  frascos: ReactNode;
}) {
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

      {frascos}

      <section>
        <div {...entra("", 5)}>
          <Superficie pad guia="fin-dinero.alcanza">
            <CabeceraBloque
              titulo={
                <span className="din-alcanza-cab">
                  ¿Me alcanza?
                  {deCaylaEntera && (
                    <Chip tono="pizarra" versalitas={false} title="Los sueldos, los alquileres y los proveedores salen de los bancos, que son de CAYLA entera">
                      de CAYLA entera
                    </Chip>
                  )}
                </span>
              }
              bajada={alcanza.frase}
            />
            {alcanza.estado !== "sin_dato" && (
              <div className="fin-dinero-alcanza">
                <Chip tono={alcanza.estado === "baja" ? "ambar" : alcanza.provisional ? "pizarra" : "verde"}>
                  {alcanza.estado === "baja" ? "Baja del mínimo" : alcanza.provisional ? "Dentro del mínimo · provisional" : "Dentro del mínimo"}
                </Chip>
                {alcanza.diasDeCaja !== null && (
                  <Chip tono="pizarra">
                    {alcanza.provisional ? "≈ " : ""}
                    {alcanza.diasDeCaja} {alcanza.diasDeCaja === 1 ? "día de caja" : "días de caja"}
                    {alcanza.provisional ? " · provisional" : ""}
                  </Chip>
                )}
                {alcanza.provisional && <FaltanProyeccion provisional faltan={alcanza.faltan} className="mt-3" />}
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
      </section>
    </>
  );
}
