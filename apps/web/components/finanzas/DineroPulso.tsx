import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { FaltanProyeccion } from "@/components/finanzas/FaltanProyeccion";
import type { Alcanza } from "@/lib/dinero-pulso-reglas";

// Cuentas y dinero ▸ Dónde está (El telar, Felipe 2026-10-23): los frascos de cada sede y, debajo, «¿Me alcanza?» (la semana que
// baja del mínimo y qué pasa si depositas lo guardado). «Tienes S/ X» es la respuesta de la cabecera (`RespuestaTelar`) y lo que se
// debe es su propia cara. No calcula: lo deciden `lib/dinero-pulso-reglas.ts` y las funciones de la base de siempre. Sin estado.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });

export function DineroPulso({
  alcanza,
  deCaylaEntera,
  frascos,
}: {
  alcanza: Alcanza;
  /** Se mira una sede: la proyección de «¿Me alcanza?» es de toda la empresa y lo dice (no se parte por sede, ADR-0433). */
  deCaylaEntera: boolean;
  /** Las repisas de frascos (El telar), entre la respuesta y las preguntas. */
  frascos: ReactNode;
}) {
  return (
    <>

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
                {alcanza.guardadoYaCuenta && <p className="nota-cayla mt-3">{alcanza.guardadoYaCuenta.frase}</p>}
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
