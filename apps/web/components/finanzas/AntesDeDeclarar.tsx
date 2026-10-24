import { Chip } from "@/components/ui/Chip";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import type { PendienteImpuesto } from "@/lib/impuestos-antes-reglas";

// Finanzas ▸ Impuestos: «Antes de declarar», la única lista de lo que falta (El telar, Felipe 2026-10-23). La arma
// `lib/impuestos-antes-reglas.ts`; cada cosa con su punto, su explicación y un solo botón que lleva a donde se arregla.

export function AntesDeDeclarar({ pendientes, guia }: { pendientes: PendienteImpuesto[]; guia?: string }) {
  return (
    <Superficie pad className="anim-sube" guia={guia}>
      <CabeceraBloque titulo="Antes de declarar" bajada={pendientes.length ? "Lo que puede hacer que pagues de más o que SUNAT te observe." : "Nada pendiente: los comprobantes están aceptados y las compras, con factura."}>
        <Chip tono={pendientes.length ? "ambar" : "verde"}>{pendientes.length ? `${pendientes.length} por hacer` : "Al día"}</Chip>
      </CabeceraBloque>
      {pendientes.length > 0 && (
        <ul className="fin-decidir">
          {pendientes.map((p) => (
            <li key={p.id}>
              <span className="fin-punto" data-tono={p.estado === "frena" ? "rojo" : "ambar"} aria-hidden />
              <div>
                <b>{p.titulo}</b>
                <p>{p.detalle}</p>
              </div>
              {p.href && p.verbo ? (
                <BotonVer href={p.href} chico>
                  {p.verbo}
                </BotonVer>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
    </Superficie>
  );
}
