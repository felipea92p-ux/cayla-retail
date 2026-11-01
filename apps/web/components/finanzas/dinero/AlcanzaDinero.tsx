import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { FaltanProyeccion } from "@/components/finanzas/FaltanProyeccion";
import type { Alcanza } from "@/lib/dinero-pulso-reglas";

// Cuentas y dinero ▸ Dónde está ▸ «¿Me alcanza?» (rediseño Felipe 2026-10-31): la semana que baja del mínimo y qué pasa si depositas lo guardado, ahora en la
// columna derecha, bajo «Pide tu atención» (antes era una tarjeta de ancho completo debajo de las cuentas). No calcula: lo deciden
// `lib/dinero-pulso-reglas.ts` y las funciones de la base de siempre. Sin estado: sirve en el servidor y llega a `PanoramaDinero` como una pieza más.
export function AlcanzaDinero({
  alcanza,
  deCaylaEntera,
}: {
  alcanza: Alcanza;
  /** Se mira una sede: la proyección es de toda la empresa y lo dice (no se parte por sede, ADR-0433). */
  deCaylaEntera: boolean;
}) {
  return (
    <section className="card-cayla dp-alcanza" aria-label="¿Me alcanza?" data-guia="fin-dinero.alcanza">
      <div className="dp-atencion-cab">
        <TituloSeccion>¿Me alcanza?</TituloSeccion>
        {deCaylaEntera && (
          <Chip tono="pizarra" versalitas={false} title="Los sueldos, los alquileres y los proveedores salen de los bancos, que son de CAYLA entera">
            de CAYLA entera
          </Chip>
        )}
      </div>
      <div className="dp-alcanza-cuerpo">
        <p className="dp-tenue">{alcanza.frase}</p>
        {alcanza.estado !== "sin_dato" && (
          <>
            <div className="flex flex-wrap gap-2">
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
            </div>
            {alcanza.provisional && <FaltanProyeccion provisional faltan={alcanza.faltan} />}
            {alcanza.guardadoYaCuenta && <p className="nota-cayla">{alcanza.guardadoYaCuenta.frase}</p>}
            {alcanza.deClaudia && <p className="nota-cayla">{alcanza.deClaudia.frase}</p>}
            <p>
              <Link href="/finanzas/reportes/flujo" className="btn-cayla btn-enlace">
                Ver el flujo semana a semana
              </Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
