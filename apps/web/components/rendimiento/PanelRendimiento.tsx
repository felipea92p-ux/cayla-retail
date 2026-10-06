"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Encabezado, TABLA, Tabla, type Columna } from "@/components/ui/Tabla";
import { diaYHoraLima } from "@/lib/fechas-lima";
import {
  asignacionDeVista,
  avance,
  columnaDePersona,
  ETIQUETA_MOTIVO,
  lecturaDeRitmo,
  minutosEnLima,
  etiquetaDeHora,
  ordenarPersonas,
  prendasPorVenta,
  primerDiaDelMes,
  proyectarMes,
  puedeEditarMeta,
  repartePorHoras,
  resumenDeSede,
  ritmoDelTurno,
  serieParaGrafico,
  turnoDeHoy,
  ventasDeLaTiendaPorHora,
  VISTAS,
  type CambioMeta,
  type DiaSerie,
  type FilaDetalle,
  type Orden,
  type PersonaMeta,
  type Vista,
} from "@/lib/rendimiento-meta-reglas";
import { EditarMetaModal } from "./EditarMetaModal";
import { GraficoVentasMeta } from "./GraficoVentasMeta";

/* ====================================================================
   El panel de Rendimiento de UNA tienda (ADR-0325, spike docs/maquetas/rendimiento-meta-2026-09/)

   Cifras → nota → «Cómo va» (una fila por persona, con su meta editable) → ventas contra la meta → cambios de meta.
   Los rankings del mes van DESPUÉS, en la página (servidor).

   Hoy · Semana · Mes salen de UNA sola lectura que hizo el servidor: cambiar de vista es estado local. La URL se
   actualiza con `history.replaceState` (para poder compartirla o recargar en la misma vista) pero no navega: ni pide
   nada a la base, ni prende el loader, ni mueve el scroll (Felipe, 2026-09-29: «que se mantenga la posición»).
   ==================================================================== */

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

const PLANTILLA = "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]";

const TEXTO_VISTA: Record<Vista, { periodo: string; enPeriodo: string; meta: string; tabla: string }> = {
  hoy: { periodo: "hoy", enPeriodo: "hoy", meta: "de hoy", tabla: "Cómo va hoy" },
  semana: { periodo: "7 días", enPeriodo: "en 7 días", meta: "de los 7 días", tabla: "Cómo va la semana" },
  mes: { periodo: "el mes", enPeriodo: "en el mes", meta: "del mes", tabla: "Cómo va el mes" },
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function PanelRendimiento({
  ubicacionId,
  nombre,
  hoy,
  serie,
  detalle,
  personas,
  historial,
  vistaInicial,
  onVista,
  personaCuentaId,
  esAdmin,
}: {
  ubicacionId: string;
  nombre: string;
  hoy: string;
  serie: DiaSerie[];
  /** Ventas por día y hora de la tienda; `null` si la base no lo entregó (no se dibujan esas dos medidas). */
  detalle: FilaDetalle[] | null;
  personas: PersonaMeta[];
  historial: CambioMeta[];
  vistaInicial: Vista;
  /** Avisa cuando la persona cambia de vista, para conservarla si cambia de tienda. */
  onVista?: (v: Vista) => void;
  personaCuentaId: string | null;
  esAdmin: boolean;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [orden, setOrden] = useState<Orden>("nombre");
  const [editando, setEditando] = useState<PersonaMeta | null>(null);
  // La hora de Lima solo se conoce ya en el navegador: sin esto el servidor y el navegador pintarían horas distintas (D-159, «ritmo
  // esperado»: cuánto del turno ya pasó). Antes de montarse no hay marca ni palabra; luego se actualiza cada minuto.
  const [ahoraMin, setAhoraMin] = useState<number | null>(null);
  useEffect(() => {
    const poner = () => setAhoraMin(minutosEnLima());
    poner();
    const id = window.setInterval(poner, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const res = useMemo(() => resumenDeSede(serie, vista, hoy), [serie, vista, hoy]);
  const proyeccion = useMemo(() => proyectarMes(serie, hoy), [serie, hoy]);
  const porHora = useMemo(() => (detalle ? ventasDeLaTiendaPorHora(detalle, vista, hoy) : null), [detalle, vista, hoy]);
  const prendas = useMemo(() => (detalle ? prendasPorVenta(detalle, vista, hoy) : null), [detalle, vista, hoy]);
  const resMes = useMemo(() => resumenDeSede(serie, "mes", hoy), [serie, hoy]);
  const grafico = useMemo(() => serieParaGrafico(serie, hoy), [serie, hoy]);
  const filas = useMemo(() => ordenarPersonas(personas, vista, orden), [personas, vista, orden]);
  const porHoras = repartePorHoras(personas);
  const asignacion = asignacionDeVista(personas, vista, res.meta);
  const t = TEXTO_VISTA[vista];
  const mes = primerDiaDelMes(hoy);
  const mesEtiqueta = MESES[Number(mes.slice(5, 7)) - 1];

  function cambiarVista(v: Vista) {
    setVista(v);
    onVista?.(v);
    // Solo la barra de direcciones: nada de navegar (no vuelve a pedir la pantalla ni mueve el scroll).
    const url = new URL(window.location.href);
    if (v === "hoy") url.searchParams.delete("vista");
    else url.searchParams.set("vista", v);
    window.history.replaceState(null, "", url);
  }

  const vendieron = personas.filter((p) => columnaDePersona(p, vista).vendido > 0).length;
  const programadas = personas.filter((p) => p.entradaHoy !== null).length;
  const pctMeta = avance(res.soles, res.meta);

  const columnas: Columna[] = [
    {
      titulo: (
        <BotonOrden activo={orden === "nombre"} onClick={() => setOrden("nombre")}>
          Persona
        </BotonOrden>
      ),
    },
    {
      titulo: (
        <BotonOrden activo={orden === "ventas"} onClick={() => setOrden("ventas")}>
          Vendió
        </BotonOrden>
      ),
    },
    { titulo: "Meta", ayuda: porHoras ? "Repartida por horas programadas (turnos de Dynamic)" : "Partes iguales entre quienes marcaron asistencia" },
    {
      titulo: (
        <BotonOrden activo={orden === "avance"} onClick={() => setOrden("avance")}>
          Avance
        </BotonOrden>
      ),
    },
    { titulo: "", alinear: "der" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="label-cayla text-[11px] font-bold text-taupe">Período</span>
        {/* El período es un filtro de un valor: la píldora del sistema, con su rótulo (ADR-0354). */}
        <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-2">
          {VISTAS.map((v) => (
            <button key={v.clave} type="button" aria-pressed={vista === v.clave} onClick={() => cambiarVista(v.clave as Vista)} className="pildora-cayla">
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Las cuatro cifras */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TarjetaCifra etiqueta={`Soles ${t.periodo}`} valor={SOLES.format(res.soles)}>
          {res.ventas > 0 ? `${res.ventas} ${plural(res.ventas, "venta", "ventas")}` : "Sin ventas todavía"}
        </TarjetaCifra>

        {res.meta === null || pctMeta === null ? (
          <TarjetaCifra
            etiqueta="Meta de la sede"
            valor={null}
            accion={{ href: "/configuracion?tab=tiendas", texto: "Cargarla en Configuración" }}
          >
            Falta cargarla para {nombre}. Sin ella no hay qué repartir.
          </TarjetaCifra>
        ) : (
          <TarjetaCifra etiqueta={`Meta ${t.meta}`} valor={`${pctMeta} %`}>
            {res.soles >= res.meta ? `Superada por ${SOLES.format(res.soles - res.meta)}` : `Faltan ${SOLES.format(res.meta - res.soles)} de ${SOLES.format(res.meta)}`}
            {res.tocabaPct !== null && ` · a hoy tocaba ${res.tocabaPct} %`}
            <BarraAvance pct={pctMeta} marca={res.tocabaPct} />
          </TarjetaCifra>
        )}

        {vista === "hoy" && personas.length > 0 ? (
          <TarjetaCifra etiqueta="Programadas hoy" valor={String(programadas)}>
            {vendieron} {plural(vendieron, "vendió", "vendieron")}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra etiqueta="Personas" valor={personas.length > 0 ? String(vendieron) : null}>
            {personas.length > 0 ? `${plural(vendieron, "persona vendió", "personas vendieron")} ${t.enPeriodo}` : "Sin personal cargado"}
          </TarjetaCifra>
        )}

        <TarjetaCifra etiqueta="Ticket promedio" valor={res.ticket !== null ? SOLES.format(res.ticket) : null}>
          {res.ticket !== null ? "por venta" : "Sin ventas todavía"}
        </TarjetaCifra>
      </div>

      {/* Las tres medidas de la propuesta final (Felipe, 2026-10-03): proyección del mes, prendas por venta y ventas por hora */}
      {(proyeccion || prendas) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {proyeccion && (
            // La pieza única de cifra (TarjetaCifra, ADR-0354): antes era una copia a mano con la receta del Inicio.
            <TarjetaCifra etiqueta="Proyección del mes" valor={SOLES.format(proyeccion.proyeccion)}>
                A este ritmo ({SOLES.format(proyeccion.ritmoPorDia)} por día de trabajo) {nombre} cierra el mes cerca de esa cifra
                {proyeccion.pctDeMeta !== null && proyeccion.metaMes !== null && (
                  <>
                    : <b className="font-semibold text-tinta">{proyeccion.pctDeMeta} %</b> de su meta de {SOLES.format(proyeccion.metaMes)}
                  </>
                )}
                . {proyeccion.diasQueQuedan > 0 ? `Quedan ${proyeccion.diasQueQuedan} ${plural(proyeccion.diasQueQuedan, "día de trabajo", "días de trabajo")}.` : "Es el último día de trabajo del mes."}
            </TarjetaCifra>
          )}
          {prendas && (
            <TarjetaCifra etiqueta="Prendas por venta" valor={prendas.porVenta !== null ? prendas.porVenta.toLocaleString("es-PE", { maximumFractionDigits: 1 }) : null}>
              {prendas.porVenta !== null
                ? `${prendas.prendas} ${plural(prendas.prendas, "prenda", "prendas")} en ${prendas.ventas} ${plural(prendas.ventas, "venta", "ventas")} ${t.enPeriodo}. Las devoluciones no restan.`
                : "Sin ventas todavía"}
            </TarjetaCifra>
          )}
        </div>
      )}

      {porHora && (
        <div className="card-cayla p-4 sm:p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Ventas por hora ({t.periodo})</p>
          {porHora.mejor ? (
            <>
              <div className="mt-3 flex h-24 items-end gap-1" role="img" aria-label={`Ventas por hora ${t.enPeriodo}. La mejor hora fue ${etiquetaDeHora(porHora.mejor.hora)}, con ${SOLES.format(porHora.mejor.total)}.`}>
                {porHora.horas.map((h) => {
                  const alto = Math.max(h.total > 0 ? 6 : 2, Math.round((h.total / porHora.mejor!.total) * 100));
                  const esMejor = h.hora === porHora.mejor!.hora;
                  return (
                    <div key={h.hora} className="flex h-full min-w-0 flex-1 items-end" title={`${etiquetaDeHora(h.hora)} · ${SOLES.format(h.total)} · ${h.ventas} ${plural(h.ventas, "venta", "ventas")}`}>
                      <div className={`w-full rounded-t ${esMejor ? "bg-taupe" : h.total > 0 ? "bg-sand" : "bg-tinta/10"}`} style={{ height: `${alto}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-tinta/65 tabular-nums">
                <span>{etiquetaDeHora(porHora.horas[0].hora)}</span>
                <span>{etiquetaDeHora(porHora.horas.at(-1)!.hora)}</span>
              </div>
              <p className="mt-2 text-xs text-tinta/65">
                La mejor franja fue la de las <b className="font-semibold text-tinta">{etiquetaDeHora(porHora.mejor.hora)}</b>: {SOLES.format(porHora.mejor.total)} en{" "}
                {porHora.mejor.ventas} {plural(porHora.mejor.ventas, "venta", "ventas")}. Sirve para repartir turnos, no para juzgar a nadie.
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-tinta/65">Sin ventas {t.enPeriodo}: todavía no hay horas que mirar.</p>
          )}
        </div>
      )}
      {detalle === null && <p className="nota-cayla">No se pudieron leer las ventas por hora ahora. Lo demás de esta pantalla sí está al día.</p>}

      {res.meta === null && (
        <p className="nota-cayla">
          Sin meta de la sede no hay qué repartir: cárgala en <b>Configuración ▸ Tiendas y caja</b> y la meta de cada persona se calcula sola, por sus horas
          programadas. Mientras tanto, esta pantalla muestra lo vendido.
        </p>
      )}
      {res.meta !== null && personas.length > 0 && !porHoras && (
        <p className="nota-cayla">
          {nombre} no tiene horarios cargados en Dynamic: la meta se reparte en <b>partes iguales</b> entre quienes marcaron asistencia.
        </p>
      )}

      {/* Cómo va cada persona */}
      <section className="space-y-3" aria-label={t.tabla}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="label-cayla text-[11px] font-bold text-taupe">{t.tabla}</h2>
          <Chip tono="neutro" versalitas={false}>
            Editan la líder de la sede y el Admin
          </Chip>
        </div>

        {personas.length === 0 ? (
          <div className="card-cayla p-5">
            <p className="text-sm text-tinta/75">
              <b>{nombre} todavía no tiene personal cargado en Dynamic.</b> Sin eso no hay quién atendió ni horas programadas: no hay a quién repartirle la meta.
            </p>
          </div>
        ) : (
          <Tabla>
            <Encabezado columnas={columnas} plantilla={PLANTILLA} />
            {filas.map((p) => {
              const c = columnaDePersona(p, vista);
              const av = avance(c.vendido, c.meta);
              const turno = vista === "hoy" ? turnoDeHoy(p) : null;
              const ritmo = vista === "hoy" && ahoraMin !== null ? ritmoDelTurno(p, ahoraMin) : null;
              const lectura = vista === "hoy" ? lecturaDeRitmo(c.vendido, c.meta, ritmo) : null;
              const marcaRitmo = ritmo !== null && ritmo > 0 ? Math.round(ritmo * 100) : null;
              const permiso = puedeEditarMeta({
                personaFilaId: p.personaId,
                personaCuentaId,
                esAdmin,
                metaSedeMes: resMes.meta,
                metaAutoMes: p.metaAutoMes,
              });
              return (
                <div key={p.personaId} role="row" className={`fila-cayla grid gap-x-4 gap-y-1 px-5 py-3 sm:items-center ${PLANTILLA}`}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-tinta">
                      <span className="font-medium">{p.nombre}</span>
                      {p.esEncargada && (
                        <Chip tono="pizarra" versalitas={false}>
                          Encargada
                        </Chip>
                      )}
                      {personaCuentaId === p.personaId && (
                        <Chip tono="neutro" versalitas={false}>
                          tú
                        </Chip>
                      )}
                    </p>
                    {vista === "hoy" && (
                      <p className="text-xs text-taupe">{turno ?? (porHoras ? "Sin turno cargado hoy" : "")}</p>
                    )}
                  </div>
                  <p className="tabular-nums text-sm text-tinta">
                    <span className="mr-1 text-xs text-taupe sm:hidden">Vendió</span>
                    {SOLES.format(c.vendido)}
                    <small className="block text-xs text-taupe">{c.ventas > 0 ? `${c.ventas} ${plural(c.ventas, "venta", "ventas")}` : " "}</small>
                  </p>
                  <p className="tabular-nums text-sm text-tinta">
                    <span className="mr-1 text-xs text-taupe sm:hidden">Meta</span>
                    {c.meta !== null ? SOLES.format(c.meta) : "—"}
                    <small className="block text-xs text-taupe">
                      {c.meta === null ? (vista === "hoy" ? "Sin parte hoy" : "Sin parte") : p.metaAjustadaMes !== null ? <Chip tono="ambar" versalitas={false}>Ajustada</Chip> : p.base === "horas" ? "por horas" : "partes iguales"}
                    </small>
                  </p>
                  <div className="min-w-0">
                    {av !== null ? (
                      <>
                        <BarraAvance pct={av} marca={vista === "mes" ? res.tocabaPct : marcaRitmo} />
                        <p className="mt-1 text-xs tabular-nums text-taupe">
                          {av} %{lectura && <> · {lectura}</>}
                          {marcaRitmo !== null && marcaRitmo < 100 && <> · ritmo {marcaRitmo} %</>}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-taupe">{c.vendido > 0 ? "Sin meta" : "—"}</p>
                    )}
                  </div>
                  <div className="sm:text-right">
                    <BotonCompacto
                      variante="fila"
                      icono={<Pencil aria-hidden strokeWidth={1.75} />}
                      disabled={!permiso.puede}
                      title={permiso.puede ? `Cambiar la meta de ${p.nombre}` : permiso.motivo}
                      aria-label={`Cambiar la meta de ${p.nombre}`}
                      onClick={() => setEditando(p)}
                    >
                      Meta
                    </BotonCompacto>
                  </div>
                </div>
              );
            })}
            <div className={`${TABLA.pie} flex flex-wrap items-center justify-between gap-x-4 gap-y-1`}>
              {asignacion.tipo === "sin_meta" ? (
                <span>Sin meta de la sede no hay qué repartir.</span>
              ) : (
                <span>
                  Asignado a {personas.length === 1 ? "1 persona" : `las ${personas.length}`}: <b className="tabular-nums text-tinta">{SOLES.format(asignacion.asignado)}</b> de{" "}
                  <b className="tabular-nums text-tinta">{SOLES.format(asignacion.metaSede)}</b> de la sede
                  {asignacion.tipo === "cuadra" && " · cuadra"}
                  {asignacion.tipo === "faltan" && ` · faltan ${SOLES.format(asignacion.diferencia)} por asignar`}
                  {asignacion.tipo === "pasa" && ` · se pasa por ${SOLES.format(-asignacion.diferencia)}`}
                </span>
              )}
              <span>{porHoras ? "Reparto por horas programadas (turnos de Dynamic)" : "Sin horarios cargados: partes iguales entre quienes marcaron asistencia"}</span>
            </div>
          </Tabla>
        )}
      </section>

      <GraficoVentasMeta
        titulo="Ventas contra la meta"
        semana={grafico.semana}
        mes={grafico.mes}
        inicial={vista === "mes" ? "mes" : "semana"}
        etiquetas={{
          ventas: "Ventas de la sede",
          meta: "Meta del día",
          ventasAcum: "Ventas acumuladas",
          metaAcum: "Meta acumulada",
          tooltip: "Ventas",
          deMeta: "la meta de",
          aria: "Ventas de la sede",
        }}
      />

      <Historial cambios={historial} />

      {editando && (
        <EditarMetaModal
          key={editando.personaId}
          persona={editando}
          ubicacionId={ubicacionId}
          ubicacionNombre={nombre}
          mes={mes}
          mesEtiqueta={mesEtiqueta}
          metaSedeMes={resMes.meta}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function BotonOrden({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title="Ordenar por esta columna"
      className={`text-xs ${activo ? "font-semibold text-tinta" : "font-normal text-taupe"} hover:text-tinta`}
    >
      {children}
      {activo && <span aria-hidden> ↓</span>}
    </button>
  );
}

function Historial({ cambios }: { cambios: CambioMeta[] }) {
  return (
    <details className="card-cayla p-5">
      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 text-sm text-tinta">
        <span>Cambios de meta ({cambios.length})</span>
        <Chip tono="neutro" versalitas={false}>
          no se borran
        </Chip>
      </summary>
      <ul className="mt-3 divide-y divide-sand">
        {cambios.length === 0 && <li className="py-2 text-sm text-taupe">Todavía nadie cambió una meta este mes.</li>}
        {cambios.map((c) => {
          const { dia, hora } = diaYHoraLima(c.creadoEn);
          const motivo = c.motivo === "otro" && c.detalle ? `Otro: ${c.detalle}` : (ETIQUETA_MOTIVO[c.motivo] ?? c.motivo);
          return (
            <li key={c.id} className="grid grid-cols-[5.5rem_1fr] gap-3 py-2 text-sm">
              <span className="text-xs tabular-nums text-taupe">
                {dia} · {hora}
              </span>
              <div>
                <p className="text-tinta">
                  <span className="font-medium">{c.persona}</span>:{" "}
                  <span className="tabular-nums">
                    {SOLES.format(c.metaAntes)} → {c.meta === null ? "automática" : SOLES.format(c.meta)}
                  </span>{" "}
                  <span className="text-taupe">al mes</span>
                </p>
                <p className="text-xs text-taupe">
                  {c.cambiadoPor} · {motivo}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
