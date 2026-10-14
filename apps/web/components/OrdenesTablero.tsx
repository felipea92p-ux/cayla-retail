"use client";

import { useMemo, useState } from "react";
import { soles } from "@/lib/compras-reglas";
import { diaLima, diaMes } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { NuevaOrdenProduccionForm } from "@/components/NuevaOrdenProduccionForm";
import type { DecisionProduccion } from "@/lib/decision-produccion";
import type { Tolerado } from "@/lib/resultado";
import { OrdenPanel } from "@/components/OrdenPanel";
import { AnularOrdenModal, RevertirOrdenModal } from "@/components/OrdenModales";
import { OrdenTarjeta, semaforoDeOrden } from "@/components/OrdenTarjeta";
import { useFlipCajas } from "@/lib/useFlipCajas";
import { COLUMNAS_TABLERO, etapaActual, resumenTablero } from "@/lib/produccion-reglas";
import type { TipoOrden } from "@/lib/modelo-nuevo-orden-reglas";
import { ordenesParaLaLista } from "@/lib/orden-modelo-reglas";
import type { VocabularioModeloNuevo } from "@/lib/modelo-nuevo-reglas";
import type { ModeloProducible, OrdenProduccion } from "@/lib/produccion";
import type { ConsumoDeOrden, InsumoVista } from "@/lib/insumos";
import { Scissors, Shirt } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Órdenes de producción del Taller (ADR-0133, F2): un tablero por etapa en vez de una lista plana. La etapa donde
// está la orden ES su columna; al marcarla hecha la tarjeta viaja a la siguiente. Las muestras (otras tres
// etapas) van en su franja; las terminadas y anuladas siguen debajo, como antes. Toda escritura es una RPC
// (etapa, cerrar, anular, revertir): ninguna toca las tablas directo.

export function OrdenesTablero({
  tallerId,
  ordenes,
  modelos,
  esLider,
  hoy,
  insumos,
  consumosPorOrden,
  decision,
  ordenInicialId = null,
  nuevaInicial = null,
  sugeridaInicial = false,
  tipoInicial = "produccion",
  puedeEditarCatalogo = false,
  vocabulario = null,
  sede,
}: {
  tallerId: string;
  ordenes: OrdenProduccion[];
  modelos: ModeloProducible[];
  esLider: boolean;
  hoy: string;
  insumos: InsumoVista[];
  consumosPorOrden: Record<string, ConsumoDeOrden[]>;
  /** Solo el líder (F5): lo que aconseja la red al abrir una orden. */
  decision: Tolerado<DecisionProduccion> | null;
  /** Enlaces del Resumen (F6): `?orden=<id>` abre esa orden; `?nueva=<modelo>` abre «Nueva orden» con el modelo elegido (`auto` = el primero). */
  ordenInicialId?: string | null;
  nuevaInicial?: string | null;
  /** `&sugerida=1` (solo desde «Abrir orden sugerida» del Resumen): «Nueva orden» llega con la matriz ya llena con la sugerencia de la red. */
  sugeridaInicial?: boolean;
  /** `?tipo=muestra` (ADR-0361): el tipo con que se abre «Nueva orden» al volver de crear un modelo nuevo. */
  tipoInicial?: TipoOrden;
  /** Quien edita el catálogo puede crear el modelo que falta desde aquí (`fn_puede_editar_catalogo`, ADR-0361). */
  puedeEditarCatalogo?: boolean;
  /** Tallas, colores y categorías para «Modelo nuevo» dentro de la orden (ADR-0361). */
  vocabulario?: Tolerado<VocabularioModeloNuevo> | null;
  /** La sede de la línea de arriba de la cabecera (el Taller). */
  sede: string;
}) {
  const [abiertaId, setAbiertaId] = useState<string | null>(ordenInicialId && ordenes.some((o) => o.id === ordenInicialId) ? ordenInicialId : null);
  const [nuevaAbierta, setNuevaAbierta] = useState(nuevaInicial !== null);
  // La sugerencia del Resumen se aplica UNA vez, a la apertura que vino por la URL: la URL no cambia al cerrar ni al guardar, así que sin esto cada «+ Nueva orden» la volvería a escribir.
  const [sugeridaPendiente, setSugeridaPendiente] = useState(sugeridaInicial);
  const [anulando, setAnulando] = useState<OrdenProduccion | null>(null);
  const [revirtiendo, setRevirtiendo] = useState<OrdenProduccion | null>(null);
  const [verTerminadas, setVerTerminadas] = useState(false);

  const enProceso = ordenes.filter((o) => o.estado === "en_proceso");
  const produccion = enProceso.filter((o) => !o.esMuestra);
  const muestras = enProceso.filter((o) => o.esMuestra);
  const terminadas = ordenes.filter((o) => o.estado === "terminada");
  const anuladas = ordenes.filter((o) => o.estado === "anulada");
  const resumen = resumenTablero(ordenes, hoy);
  // Para la lista de «Nueva orden»: cuántas órdenes abiertas tiene cada modelo y cuáles fueron los últimos (ADR-0396).
  const paraLaLista = useMemo(() => ordenesParaLaLista(ordenes), [ordenes]);

  const porColumna = (clave: string) => produccion.filter((o) => etapaActual(o.etapas, false) === clave);
  // Firma de «qué tarjeta está en qué columna»: solo cuando cambia se anima el viaje.
  const { ref: refTarjeta, contenedor: refTablero } = useFlipCajas(produccion.map((o) => `${o.id}:${etapaActual(o.etapas, false)}`).join("|"));

  const abierta = ordenes.find((o) => o.id === abiertaId && o.estado !== "anulada") ?? null;
  const urgentes = resumen.vencidas + resumen.pronto;
  let indice = 0;

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
      <EncabezadoPagina
        sede={sede}
        titulo="Órdenes de producción"
        subtitulo="Dónde está cada corrida, cuánto lleva costando y si llega a tiempo."
        acciones={
          <Boton peso="primario" data-guia="prod-ordenes.nueva" onClick={() => setNuevaAbierta(true)}>
            + Nueva orden
          </Boton>
        }
      />

      {modelos.length === 0 && (
        <div className="card-cayla">
          <Vacio
            icono={<Shirt />}
            titulo="Todavía no hay modelos"
            acciones={
              <Boton peso="primario" onClick={() => setNuevaAbierta(true)}>
                + Crear el primer modelo
              </Boton>
            }
          >
            Créalo aquí mismo: un modelo nuevo se abre ya con su orden de producción.
          </Vacio>
        </div>
      )}

      {/* ==================== cifras ==================== */}
      <div data-guia="prod-ordenes.cifras" className={`grid gap-3 sm:grid-cols-2 ${esLider ? "xl:grid-cols-3" : ""}`}>
        <TarjetaCifra punto="verde" etiqueta="Órdenes en curso" className="anim-entra" style={{ ["--i" as string]: 0 }} valor={<CifraQueCuenta valor={resumen.enCurso} alMontar />}>
          {resumen.prendas} prendas planeadas
        </TarjetaCifra>
        <TarjetaCifra
          punto={resumen.vencidas > 0 ? "rojo" : urgentes > 0 ? "ambar" : "verde"}
          etiqueta="Entregas por atender"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={urgentes} alMontar />}
          detalleTono={resumen.vencidas > 0 ? "text-rojo-profundo" : urgentes > 0 ? "text-ambar-profundo" : "text-verde-profundo"}
        >
          {urgentes === 0 ? "todas con tiempo" : `${resumen.vencidas} pasadas · ${resumen.pronto} por vencer`}
        </TarjetaCifra>
        {esLider && (
          <TarjetaCifra
            punto="verde"
            etiqueta="Margen promedio"
            className="anim-entra"
            style={{ ["--i" as string]: 2 }}
            valor={resumen.margenPromedio === null ? null : <CifraQueCuenta valor={resumen.margenPromedio * 100} formato="porcentaje" alMontar />}
          >
            {resumen.margenPromedio === null ? "sin precio o costo todavía" : "sobre el precio de venta más bajo"}
          </TarjetaCifra>
        )}
      </div>

      {/* ==================== tablero ==================== */}
      {produccion.length === 0 && muestras.length === 0 ? (
        <div className="card-cayla">
          <Vacio
            icono={<Scissors />}
            titulo="Ninguna orden abierta"
            acciones={
              modelos.length > 0 ? (
                <Boton peso="primario" onClick={() => setNuevaAbierta(true)}>
                  Abrir una orden
                </Boton>
              ) : null
            }
          >
            Todo lo abierto ya se cerró. Abre una orden para empezar una corrida.
          </Vacio>
        </div>
      ) : (
        <div ref={refTablero} data-guia="prod-ordenes.tablero" className="relative grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3.5 overflow-x-auto pb-2 min-[1240px]:grid-flow-row min-[1240px]:auto-cols-auto min-[1240px]:grid-cols-4 min-[1240px]:overflow-visible">
          {COLUMNAS_TABLERO.map((col) => {
            const tarjetas = porColumna(col.clave);
            return (
              <section key={col.clave} aria-label={col.titulo} className="min-h-[9rem] min-w-0 rounded-2xl bg-sand/35 p-2.5">
                <header className="px-1.5 pb-2.5 pt-1.5">
                  <TituloGrupo nivel={2} cuenta={tarjetas.length}>
                    {col.titulo}
                  </TituloGrupo>
                </header>
                <div className="space-y-2.5">
                  {tarjetas.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-tinta/25 px-3 py-5 text-center text-xs text-tinta/65">
                      {col.clave === "listo" ? "Cuando terminen los acabados, la orden espera aquí para entrar al stock." : "Sin órdenes en esta etapa."}
                    </p>
                  ) : (
                    tarjetas.map((o) => (
                      <OrdenTarjeta key={o.id} orden={o} esLider={esLider} hoy={hoy} indice={indice++} refTarjeta={refTarjeta(o.id)} onAbrir={() => setAbiertaId(o.id)} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ==================== muestras ==================== */}
      {muestras.length > 0 && (
        <section data-guia="prod-ordenes.muestras" className="space-y-3">
          <TituloSeccion>Muestras en desarrollo</TituloSeccion>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {muestras.map((o) => (
              <OrdenTarjeta key={o.id} orden={o} esLider={esLider} hoy={hoy} indice={indice++} onAbrir={() => setAbiertaId(o.id)} />
            ))}
          </div>
        </section>
      )}

      {/* ==================== terminadas ==================== */}
      {terminadas.length > 0 && (
        <section data-guia="prod-ordenes.terminadas" className="space-y-2">
          <button
            type="button"
            aria-expanded={verTerminadas}
            onClick={() => setVerTerminadas((v) => !v)}
            className="label-cayla text-[11px] text-tinta/65 outline-none hover:text-tinta focus-visible:text-tinta"
          >
            Terminadas ({terminadas.length}) {verTerminadas ? "▾" : "▸"}
          </button>
          {/* Se abre por `grid-template-rows` (ADR-0128): sin medir alturas, sin salto. */}
          <div className={`grid transition-[grid-template-rows] duration-300 ease-cayla ${verTerminadas ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <ul className="min-h-0 space-y-2 overflow-hidden">
              {terminadas.map((o) => {
                const sem = semaforoDeOrden(o);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      tabIndex={verTerminadas ? 0 : -1}
                      onClick={() => setAbiertaId(o.id)}
                      className="card-cayla alza-cayla flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-left text-sm"
                    >
                      <span className="font-display text-base text-tinta">{o.referencia}</span>
                      <span className="text-tinta/65">
                        {o.cantidadBuenas} buenas de {o.cantidadPlan}
                      </span>
                      {o.inventariadoEn ? <span className="text-xs text-tinta/65">en stock desde el {diaMes(diaLima(o.inventariadoEn))}</span> : o.esMuestra ? <span className="text-xs text-tinta/65">muestra · no entra al stock</span> : null}
                      {esLider && (
                        <span className="ml-auto inline-flex items-center gap-2 tabular-nums text-tinta">
                          {soles(o.costoUnitario)}
                          {sem?.sede && <span className="text-xs text-tinta/65">en {sem.sede}</span>}
                          {sem && <span aria-hidden className={`h-2 w-2 rounded-full ${sem.clase}`} />}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ==================== anuladas ==================== */}
      {anuladas.length > 0 && (
        <section data-guia="prod-ordenes.anuladas" className="space-y-2">
          <TituloSeccion>Anuladas</TituloSeccion>
          {anuladas.map((o) => (
            <div key={o.id} className="card-cayla flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm text-tinta/65">
              <span className="text-tinta/80">{o.referencia}</span>
              <span>× {o.cantidadPlan}</span>
              {o.esMuestra && <span className="label-cayla text-[10px]">muestra</span>}
              {o.nota && <span className="truncate">— {o.nota}</span>}
              <span className="ml-auto text-xs">{diaMes(diaLima(o.creadoEn))}</span>
            </div>
          ))}
        </section>
      )}

      {abierta && (
        <OrdenPanel
          key={abierta.id}
          orden={abierta}
          tallerId={tallerId}
          esLider={esLider}
          hoy={hoy}
          insumos={insumos}
          consumos={consumosPorOrden[abierta.id] ?? []}
          onCerrar={() => setAbiertaId(null)}
          onAnular={() => setAnulando(abierta)}
          onRevertir={() => setRevirtiendo(abierta)}
        />
      )}
      {nuevaAbierta && (
        <NuevaOrdenProduccionForm
          tallerId={tallerId}
          modelos={modelos}
          decision={decision}
          productoInicialId={nuevaInicial}
          sugeridaInicial={sugeridaPendiente}
          tipoInicial={tipoInicial}
          puedeEditarCatalogo={puedeEditarCatalogo}
          vocabulario={vocabulario}
          abiertas={paraLaLista.abiertas}
          recientes={paraLaLista.recientes}
          onClose={() => {
            setNuevaAbierta(false);
            setSugeridaPendiente(false);
          }}
        />
      )}
      {anulando && <AnularOrdenModal orden={anulando} consumos={consumosPorOrden[anulando.id] ?? []} onClose={() => setAnulando(null)} />}
      {revirtiendo && <RevertirOrdenModal orden={revirtiendo} onClose={() => setRevirtiendo(null)} />}
    </div>
  );
}
