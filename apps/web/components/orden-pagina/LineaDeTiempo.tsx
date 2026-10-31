"use client";

import { useState } from "react";
import { Hourglass } from "lucide-react";
import { AnularSalidaOVueltaModal } from "@/components/orden-pagina/AnularSalidaOVueltaModal";
import { CambioConMotivoModal, type CambioConMotivo } from "@/components/orden-pagina/CambioConMotivoModal";
import { CorregirAnotacionModal } from "@/components/orden-pagina/CorregirAnotacionModal";
import { NotaDeLaOrdenModal } from "@/components/orden-pagina/NotaDeLaOrdenModal";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { SeparadorDia, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { faseDeLaAnotacion, lineaDeTiempoAgrupada, tonoDeEntrada, type AnotacionCorregible, type EntradaDeTiempo, type OrdenPagina } from "@/lib/orden-pagina-reglas";

// La historia de la orden (ADR-0400, vista D; ADR-0570): quién, cuándo y cuánto, del más reciente al más viejo, agrupada por día. Lo que se anotó de una vez es UNA entrada. El punto de
// cada entrada lleva la regla de color de Producción (`tonoDeEntrada`): verde lo hecho, pizarra lo que salió a un servicio, ámbar lo que se deshizo, anuló o cambió, rojo una prenda
// con falla, y neutro una nota del equipo.
// Corregir y eliminar con su historia (ADR-0570, actividad 3; Felipe 2026-10-29): CADA anotación que sigue viva —no solo la última— lleva su lápiz (`<LapizEditar>`, la pieza de
// «editar» en una fila de una lista, ADR-0358). Un «Terminé» abre «Corregir» (cantidades, fallas y día, con «Eliminar» a la izquierda del pie); la marca de Ploteo abre «Quitar la
// marca»; una Salida o una Vuelta abre «Anular». Así el rojo queda dentro de su hoja y no se repite en cada fila. Lo que un cambio quitó sale de la vista y en su lugar va el cambio,
// con su motivo; una eliminación trae «Restaurar» (`<BotonDeshacer>`, la pieza de deshacer). Arriba, «Escribir una nota». Nada se borra: la historia cuenta todo.
// La marca de Ploteo la quita y la restaura SOLO un líder (ADR-0586 act. 2; la base repite: `marca_solo_lider`): a los demás no se les ofrece ni su lápiz ni su «Restaurar».

export function LineaDeTiempo({ datos, hoy, esLider = false }: { datos: OrdenPagina; hoy: string; esLider?: boolean }) {
  const [corrigiendo, setCorrigiendo] = useState<AnotacionCorregible | null>(null);
  const [anulando, setAnulando] = useState<EntradaDeTiempo | null>(null);
  const [cambio, setCambio] = useState<CambioConMotivo | null>(null);
  const [escribiendo, setEscribiendo] = useState(false);
  const dias = lineaDeTiempoAgrupada(datos, hoy);
  const entradas = dias.flatMap((d) => d.entradas);
  const puedeCambiar = datos.permisos.puedeOperar && datos.orden.estado === "en_proceso";
  // La guía interactiva ancla en la primera de cada una (las demás son iguales).
  const primera = (f: (e: EntradaDeTiempo) => boolean) => (puedeCambiar ? (entradas.find(f) ?? null) : null);
  const primeraCorregible = primera((e) => e.corregible !== null);
  const primeraAnulable = primera((e) => e.anulable !== null);
  const restaurable = (e: EntradaDeTiempo) => e.restaurable !== null && (esLider || !e.restaurable.marca);
  const primeraMarca = esLider ? primera((e) => e.marcaViva !== null) : null;
  const primeraRestaurable = primera(restaurable);
  const faseCorregida = corrigiendo ? faseDeLaAnotacion(datos.fases, corrigiendo.faseClave) : null;

  return (
    <section data-guia="prod-orden.linea-de-tiempo" aria-label="Historia de la orden" className="space-y-3">
      <TituloSeccion
        accion={
          datos.permisos.puedeOperar ? (
            <Boton type="button" aria-haspopup="dialog" data-guia="prod-orden.nota" onClick={() => setEscribiendo(true)}>
              Escribir una nota
            </Boton>
          ) : undefined
        }
      >
        Historia
      </TituloSeccion>
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
                {dia.entradas.map((e) => (
                  <li key={e.ids.join("-")} data-tono={tonoDeEntrada(e.tipo)} data-anulada={e.anulada ? "true" : undefined}>
                    <div className="op-tiempo-fila">
                      <div className="op-tiempo-cuerpo">
                        <div className="op-tiempo-cuando">{e.anotado ? `${e.quien ?? "Alguien"} ${e.anotado}` : `${e.hora}${e.quien ? ` · ${e.quien}` : ""}`}</div>
                        <div className="op-tiempo-que">
                          <span>
                            <b>{e.titulo}</b>
                            {e.anulada && (
                              <>
                                {" "}
                                <Chip tono="apagado">Anulada</Chip>
                              </>
                            )}
                            {e.corregida && (
                              <>
                                {" "}
                                <Chip tono="pizarra">Corregida</Chip>
                              </>
                            )}
                            {e.restaurado && (
                              <>
                                {" "}
                                <Chip tono="pizarra">Restaurado</Chip>
                              </>
                            )}
                          </span>
                          {e.cuanto && <span className="op-tiempo-cuanto">{e.cuanto}</span>}
                        </div>
                        {e.detalle && <div className="op-tiempo-detalle">{e.detalle}</div>}
                        {puedeCambiar && restaurable(e) && (
                          <span data-guia={primeraRestaurable === e ? "prod-orden.restaurar" : undefined}>
                            <BotonDeshacer
                              className="op-tiempo-deshacer"
                              onClick={() => e.restaurable && setCambio({ que: "restaurar", cambioId: e.restaurable.cambioId, titulo: e.titulo, detalle: e.cuanto })}
                            >
                              Restaurar
                            </BotonDeshacer>
                          </span>
                        )}
                      </div>
                      {puedeCambiar && e.corregible && (
                        <LapizEditar
                          que={`lo terminado en ${e.corregible.faseNombre.toLocaleLowerCase("es")}`}
                          guia={primeraCorregible === e ? "prod-orden.corregir" : undefined}
                          onClick={() => setCorrigiendo(e.corregible)}
                        />
                      )}
                      {puedeCambiar && esLider && e.marcaViva && (
                        <LapizEditar
                          que={`la marca de ${e.marcaViva.faseNombre.toLocaleLowerCase("es")}`}
                          guia={primeraMarca === e ? "prod-orden.quitar-marca" : undefined}
                          onClick={() => e.marcaViva && setCambio({ que: "quitar-marca", marcaId: e.marcaViva.id, faseNombre: e.marcaViva.faseNombre })}
                        />
                      )}
                      {puedeCambiar && e.anulable && (
                        <LapizEditar que={e.titulo.toLocaleLowerCase("es")} guia={primeraAnulable === e ? "prod-orden.anular" : undefined} onClick={() => setAnulando(e)} />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </div>
      {corrigiendo && faseCorregida && <CorregirAnotacionModal datos={datos} fase={faseCorregida} anotacion={corrigiendo} onClose={() => setCorrigiendo(null)} />}
      {anulando && <AnularSalidaOVueltaModal datos={datos} entrada={anulando} onClose={() => setAnulando(null)} />}
      {cambio && <CambioConMotivoModal datos={datos} cambio={cambio} onClose={() => setCambio(null)} />}
      {escribiendo && <NotaDeLaOrdenModal datos={datos} onClose={() => setEscribiendo(false)} />}
    </section>
  );
}
