"use client";

import { useState } from "react";
import { Hourglass } from "lucide-react";
import { AnularSalidaOVueltaModal } from "@/components/orden-pagina/AnularSalidaOVueltaModal";
import { DeshacerAvanceModal } from "@/components/orden-pagina/DeshacerAvanceModal";
import { Chip } from "@/components/ui/Chip";
import { SeparadorDia, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { lineaDeTiempoAgrupada, type EntradaDeTiempo, type OrdenPagina } from "@/lib/orden-pagina-reglas";

// La línea de tiempo de la orden (ADR-0400, vista D): quién, cuándo y cuánto, del más reciente al más viejo, agrupada por día. Lo que se anotó de una vez es UNA entrada. «Deshacer» aparece
// como enlace solo en la anotación más reciente que todavía se puede deshacer (la base manda `avance_id` solo en esas), y solo a quien puede operar la orden.
// «Anular» (ADR-0400, actividad 4b) aparece en cada Salida o Vuelta que la base dice que todavía se puede anular (`anulable`); la que ya se anuló se ve apagada, con su chip, y la anulación es
// otra entrada («Anuló la salida de Costura · por qué»). Nada se borra: la línea de tiempo cuenta todo.

export function LineaDeTiempo({ datos, hoy }: { datos: OrdenPagina; hoy: string }) {
  const [deshaciendo, setDeshaciendo] = useState<EntradaDeTiempo | null>(null);
  const [anulando, setAnulando] = useState<EntradaDeTiempo | null>(null);
  const dias = lineaDeTiempoAgrupada(datos, hoy);
  const puedeDeshacer = datos.permisos.puedeOperar && datos.orden.estado === "en_proceso";
  // La primera entrada (la más reciente) con avances que se pueden deshacer.
  const deshacible = puedeDeshacer ? (dias.flatMap((d) => d.entradas).find((e) => e.avanceIds !== null) ?? null) : null;
  const puedeAnular = puedeDeshacer;
  // La guía interactiva ancla en la primera «Anular» que haya (las demás son iguales).
  const primeraAnulable = puedeAnular ? (dias.flatMap((d) => d.entradas).find((e) => e.anulable !== null) ?? null) : null;
  let primera = true;
  return (
    <section data-guia="prod-orden.linea-de-tiempo" aria-label="Línea de tiempo de la orden" className="space-y-3">
      <TituloSeccion dato="quién · cuándo · cuánto">Línea de tiempo</TituloSeccion>
      <div className="card-cayla p-5">
        {dias.length === 0 ? (
          <Vacio tamano="chico" icono={<Hourglass />}>
            Todavía no se anotó nada en esta orden.
          </Vacio>
        ) : (
          dias.map((dia) => (
            <div key={dia.dia}>
              <SeparadorDia hoy={dia.hoy} nivel={3} className="px-0">
                {dia.etiqueta}
              </SeparadorDia>
              <ol className="op-tiempo">
                {dia.entradas.map((e) => {
                  const esPrimero = primera;
                  primera = false;
                  return (
                    <li key={e.ids.join("-")} data-primero={esPrimero ? "true" : "false"} data-anulada={e.anulada ? "true" : undefined}>
                      <div className="op-tiempo-cuando">
                        {e.hora}
                        {e.quien ? ` · ${e.quien}` : ""}
                      </div>
                      <div className="op-tiempo-que">
                        <span>
                          <b>{e.titulo}</b>
                          {e.anulada && (
                            <>
                              {" "}
                              <Chip tono="apagado">Anulada</Chip>
                            </>
                          )}
                        </span>
                        {e.cuanto && <span className="op-tiempo-cuanto">{e.cuanto}</span>}
                      </div>
                      {e.detalle && <div className="op-tiempo-detalle">{e.detalle}</div>}
                      {puedeAnular && e.anulable && (
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          data-guia={primeraAnulable === e ? "prod-orden.anular" : undefined}
                          onClick={() => setAnulando(e)}
                          className="btn-cayla btn-enlace op-tiempo-deshacer"
                        >
                          Anular
                        </button>
                      )}
                      {deshacible === e && (
                        <button type="button" aria-haspopup="dialog" onClick={() => setDeshaciendo(e)} className="btn-cayla btn-enlace op-tiempo-deshacer">
                          Deshacer
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        )}
      </div>
      {deshaciendo && <DeshacerAvanceModal datos={datos} entrada={deshaciendo} onClose={() => setDeshaciendo(null)} />}
      {anulando && <AnularSalidaOVueltaModal datos={datos} entrada={anulando} onClose={() => setAnulando(null)} />}
    </section>
  );
}
