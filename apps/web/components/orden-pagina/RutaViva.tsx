"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, House, ListChecks, Truck } from "lucide-react";
import { AnotarAvanceModal } from "@/components/orden-pagina/AnotarAvanceModal";
import { AnotarSalidaModal } from "@/components/orden-pagina/AnotarSalidaModal";
import { AnotarVueltaModal } from "@/components/orden-pagina/AnotarVueltaModal";
import { AgregarPasoModal } from "@/components/orden-pagina/AgregarPasoModal";
import { CambiarQuienModal } from "@/components/orden-pagina/CambiarQuienModal";
import { QuitarPasoModal } from "@/components/orden-pagina/QuitarPasoModal";
import { MarcarFaseModal } from "@/components/orden-pagina/MarcarFaseModal";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { OpcionesNuevaOrden } from "@/lib/produccion";
import type { Tolerado } from "@/lib/resultado";
import {
  accionesDeFase,
  avisoMinimoDeFase,
  cuandoTerminoLaFase,
  estadoEnRuta,
  faltaTerminar,
  faseAbiertaDeLaRuta,
  previaQueCuenta,
  pasosAgregables,
  puedeCambiarQuien,
  puedeRegistrarQuien,
  puedeQuitarPaso,
  quienDeFase,
  subtituloEnRuta,
  textoDeFase,
  type FasePagina,
  type OrdenPagina,
} from "@/lib/orden-pagina-reglas";

// La orden como «Ruta viva» (ADR-0570, actividad 1; maqueta `docs/maquetas/produccion-taller-2026-10/`, versión A, elegida por Felipe el 2026-10-29). Arriba, la ruta: cada paso con
// su color —verde hecho, ámbar el que toca, gris el que falta— y su renglón («57 · mié 28 oct», «Te toca», «Taller»). Debajo, UN paso abierto con su cifra, quién lo hace y sus
// botones: al entrar, el que toca; tocar otro paso de la ruta lo abre en su lugar. Un punto ámbar en un paso cerrado avisa que ahí también hay algo para anotar (una Salida que ya
// puede salir, un «Terminé» de lo que llegó). Bajo el paso abierto va lo que la página pone en `izquierda` (la tela y el costo); al costado, `derecha` (la ficha y la historia).
// Antes eran siete tarjetas iguales en una grilla (vista D, ADR-0400): el paso hecho y el que tocaba se veían casi igual, y la tela quedaba lejos de lo que pedía anotarla.
// Las acciones son las de siempre (ADR-0400, ADR-0551, ADR-0566) y nada se calcula aquí: el estado de cada fase viene de la base (`fn_fases_de_orden`) y los textos, de
// `lib/orden-pagina-reglas.ts`. Con un solo paso abierto a la vez, cada ancla de la guía interactiva (ADR-0389) vive en un solo botón.

type Hoja = { tipo: "terminar" | "quien" | "salida" | "vuelta" | "marcar" | "desmarcar" | "quitar"; faseId: string };

export function RutaViva({
  datos,
  opciones,
  hoy,
  izquierda,
  derecha,
  esLider = false,
}: {
  datos: OrdenPagina;
  /** Un líder ve «+ Agregar un paso» aunque el catálogo no tenga nada más que ofrecer: puede dar de alta «Otro proceso…» (ADR-0570, actividad 5). */
  esLider?: boolean;
  opciones: Tolerado<OpcionesNuevaOrden> | null;
  hoy: string;
  /** La tela y el costo: van debajo del paso abierto. */
  izquierda: ReactNode;
  /** La ficha y la historia: la columna de la derecha. */
  derecha: ReactNode;
}) {
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [agregando, setAgregando] = useState(false);
  const { fases, orden, lineaDeTiempo } = datos;
  // El paso que la persona abrió en la ruta vale mientras la fase actual siga siendo la misma: al anotar y pasar a la siguiente, la ruta vuelve a abrir la que toca.
  const idActual = fases.find((f) => f.actual)?.id ?? null;
  const [elegida, setElegida] = useState<{ id: string; conActual: string | null } | null>(null);
  const abierta = (elegida && elegida.conActual === idActual ? fases.find((f) => f.id === elegida.id) : undefined) ?? faseAbiertaDeLaRuta(fases);
  const hechas = fases.filter((f) => f.estado === "hecha").length;
  const { ofrecidos: pasosPorAgregar, bloqueados: pasosBloqueados } = pasosAgregables(datos);
  const sePuedeAgregar = pasosPorAgregar.length > 0 || (esLider && datos.permisos.puedeOperar && orden.estado === "en_proceso" && fases.length > 0);
  const faseDeLaHoja = hoja ? (fases.find((f) => f.id === hoja.faseId) ?? null) : null;
  const dato =
    fases.length === 0
      ? undefined
      : fases.every((f) => f.estado === "hecha")
        ? "los pasos terminaron"
        : `${hechas} de ${fases.length} ${hechas === 1 ? "hecho" : "hechos"}${fases.some((f) => f.quien === "servicio" && f.afuera > 0) ? " · hay prendas afuera" : ""}`;

  return (
    <>
      <section aria-label="Ruta de la orden" className="space-y-3">
        <TituloSeccion
          dato={dato}
          accion={
            sePuedeAgregar ? (
              <Boton peso="fantasma" aria-haspopup="dialog" data-guia="prod-orden.agregar-paso" onClick={() => setAgregando(true)}>
                + Agregar un paso
              </Boton>
            ) : undefined
          }
        >
          Ruta de la orden
        </TituloSeccion>
        {!sePuedeAgregar && pasosBloqueados.length > 0 && <p className="op-sub">{pasosBloqueados.map((p) => `${p.nombre} ya no se puede agregar: ${p.porQue}.`).join(" ")}</p>}
        {fases.length === 0 ? (
          // Una orden abierta antes de que existieran las fases (solo en una base que ya tenía órdenes) no trae ninguna: se dice, no se dibuja una ruta vacía.
          <div className="card-cayla" data-guia="prod-orden.fases">
            <Vacio tamano="chico" icono={<ListChecks />}>
              {orden.estado === "en_proceso" ? "Esta orden se abrió antes de que existieran las fases. Se sigue desde la lista de Órdenes." : "Esta orden se cerró antes de que existieran las fases: no hay un recorrido por fase que mostrar."}
            </Vacio>
          </div>
        ) : (
          <ol className="op-camino card-cayla" style={{ "--n": fases.length } as CSSProperties} data-guia="prod-orden.fases">
            {fases.map((fase, i) => {
              const estado = estadoEnRuta(fase);
              const esAbierta = fase.id === abierta?.id;
              const hayAlgo = accionesDeFase(fase, datos).some((a) => a !== "desmarcar");
              return (
                <li key={fase.id} className="op-nodo-li" data-estado={estado} data-previa={i === 0 ? undefined : fases[i - 1].estado === "hecha" ? "hecha" : "no"}>
                  <button
                    type="button"
                    className="op-nodo"
                    aria-pressed={esAbierta}
                    aria-current={fase.actual ? "step" : undefined}
                    aria-controls="op-paso-abierto"
                    onClick={() => setElegida({ id: fase.id, conActual: idActual })}
                  >
                    <span className="op-glifo" aria-hidden>
                      {estado === "hecha" && <Check />}
                    </span>
                    <span className="op-nodo-texto">
                      <span className="op-nodo-nombre">{fase.nombre}</span>
                      <span className="op-nodo-sub">{subtituloEnRuta(fase, cuandoTerminoLaFase(fase.clave, lineaDeTiempo), orden.cantidadPlan)}</span>
                    </span>
                    {hayAlgo && !esAbierta && (
                      <span className="op-nodo-punto" title="Aquí hay algo para anotar">
                        <span className="sr-only">, hay algo para anotar</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="op-bloques">
        <div className="op-columna">
          {abierta && <PasoAbierto fase={abierta} datos={datos} alAbrirHoja={(tipo) => setHoja({ tipo, faseId: abierta.id })} />}
          {izquierda}
        </div>
        <div className="op-columna">{derecha}</div>
      </div>

      {(hoja?.tipo === "marcar" || hoja?.tipo === "desmarcar") && faseDeLaHoja && <MarcarFaseModal datos={datos} fase={faseDeLaHoja} modo={hoja.tipo === "marcar" ? "marcar" : "deshacer"} onClose={() => setHoja(null)} />}
      {hoja?.tipo === "terminar" && faseDeLaHoja && <AnotarAvanceModal datos={datos} fase={faseDeLaHoja} onClose={() => setHoja(null)} />}
      {hoja?.tipo === "salida" && faseDeLaHoja && <AnotarSalidaModal datos={datos} fase={faseDeLaHoja} onClose={() => setHoja(null)} />}
      {hoja?.tipo === "vuelta" && faseDeLaHoja && <AnotarVueltaModal datos={datos} fase={faseDeLaHoja} onClose={() => setHoja(null)} />}
      {hoja?.tipo === "quitar" && faseDeLaHoja && <QuitarPasoModal datos={datos} fase={faseDeLaHoja} onClose={() => setHoja(null)} />}
      {agregando && sePuedeAgregar && <AgregarPasoModal datos={datos} pasos={pasosPorAgregar} bloqueados={pasosBloqueados} opciones={opciones} hoy={hoy} esLider={esLider} onClose={() => setAgregando(false)} />}
      {hoja?.tipo === "quien" && faseDeLaHoja && <CambiarQuienModal datos={datos} fase={faseDeLaHoja} opciones={opciones} hoy={hoy} onClose={() => setHoja(null)} />}
    </>
  );
}

/** El paso abierto bajo la ruta: su estado, quién lo hace, la cifra y lo que dice, y sus botones (los mismos que tenía su tarjeta). */
function PasoAbierto({ fase, datos, alAbrirHoja }: { fase: FasePagina; datos: OrdenPagina; alAbrirHoja: (tipo: Hoja["tipo"]) => void }) {
  const { fases, orden, lineaDeTiempo } = datos;
  const previa = previaQueCuenta(fases, fases.findIndex((f) => f.id === fase.id));
  const t = textoDeFase(fase, { previa, terminoEl: fase.estado === "hecha" ? cuandoTerminoLaFase(fase.clave, lineaDeTiempo) : null, totalPlan: orden.cantidadPlan });
  const acciones = accionesDeFase(fase, datos);
  const aviso = avisoMinimoDeFase(fase, orden.cantidadPlan);
  const registrar = puedeRegistrarQuien(fase, datos);
  const cambiar = registrar || puedeCambiarQuien(fase, datos);
  const quitar = puedeQuitarPaso(fase, datos);
  const servicio = fase.quien === "servicio";
  const estado = estadoEnRuta(fase);
  // El botón principal es el que avanza el paso; en un paso ya hecho, lo que queda (Deshacer) es secundario.
  const peso = estado === "hecha" ? "fantasma" : "primario";
  return (
    <section
      id="op-paso-abierto"
      aria-label={`${fase.nombre}, ${estado === "hecha" ? "hecho" : estado === "toca" ? "te toca" : "falta"}`}
      data-estado={estado}
      data-guia={fase.actual ? "prod-orden.fase-actual" : undefined}
      className="op-paso card-cayla"
    >
      <div className="op-paso-cab">
        <Chip tono={estado === "hecha" ? "verde" : estado === "toca" ? "ambar" : "neutro"}>{estado === "hecha" ? (fase.hito ? "Hecho" : "Hecha") : estado === "toca" ? "Te toca" : "Falta"}</Chip>
        <span className="op-paso-quien" title={quienDeFase(fase)}>
          {servicio ? <Truck aria-hidden /> : <House aria-hidden />}
          <span>{servicio ? `Afuera · ${quienDeFase(fase)}` : "En el Taller"}</span>
        </span>
      </div>
      <h3 className="op-paso-nombre">
        {fase.nombre}
        {fase.posicion && <span className="op-paso-posicion"> · sobre {fase.posicion}</span>}
      </h3>
      <p className="op-paso-cifra">
        {t.cifra}
        {t.de && <small>{t.de}</small>}
      </p>
      <p className="op-paso-detalle">{t.detalle}</p>
      {servicio && fase.tarifaPrenda !== null && fase.estado !== "hecha" && (
        <p className="op-paso-detalle">
          S/&nbsp;{fase.tarifaPrenda.toFixed(2)} por prenda{fase.fijoOrden > 0 ? ` + S/ ${fase.fijoOrden.toFixed(2)} fijo` : ""}
        </p>
      )}
      {aviso && (
        <Aviso tono="atencion" chico className="op-paso-aviso">
          {aviso}
        </Aviso>
      )}
      {(acciones.length > 0 || cambiar || quitar) && (
        <div className="op-paso-acciones">
          {acciones.includes("marcar") && (
            <Boton type="button" peso={peso} aria-haspopup="dialog" data-guia="prod-orden.marcar" onClick={() => alAbrirHoja("marcar")}>
              {fase.nombre} hecho
            </Boton>
          )}
          {acciones.includes("desmarcar") && <BotonDeshacer onClick={() => alAbrirHoja("desmarcar")} />}
          {acciones.includes("terminar") && (
            <Boton type="button" peso={peso} aria-haspopup="dialog" data-guia="prod-orden.terminar" onClick={() => alAbrirHoja("terminar")}>
              Terminé {faltaTerminar(fase, fases)}
            </Boton>
          )}
          {acciones.includes("vuelta") && (
            <Boton type="button" peso={peso} aria-haspopup="dialog" data-guia="prod-orden.vuelta" onClick={() => alAbrirHoja("vuelta")}>
              Vuelta
            </Boton>
          )}
          {acciones.includes("salida") && (
            <Boton type="button" peso={acciones.includes("vuelta") ? "fantasma" : peso} aria-haspopup="dialog" data-guia="prod-orden.salida" onClick={() => alAbrirHoja("salida")}>
              Salida
            </Boton>
          )}
          {cambiar && (
            <button type="button" aria-haspopup="dialog" data-guia="prod-orden.cambiar-quien" onClick={() => alAbrirHoja("quien")} className="btn-cayla btn-enlace text-[12.5px]">
              {registrar ? "Registrar quién" : "Cambiar quién"}
            </button>
          )}
          {quitar && (
            <button type="button" aria-haspopup="dialog" data-guia="prod-orden.quitar-paso" onClick={() => alAbrirHoja("quitar")} className="btn-cayla btn-enlace text-[12.5px]">
              Quitar este paso
            </button>
          )}
        </div>
      )}
    </section>
  );
}
