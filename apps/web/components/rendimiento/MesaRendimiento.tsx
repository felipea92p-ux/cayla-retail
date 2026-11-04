"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { useTablaViva, type FiltroDeAfuera } from "@/components/ui/TablaViva";
import type { SedeDeRendimiento } from "@/lib/rendimiento";
import { sumarDias } from "@/lib/fechas-lima";
import { minutosEnLima, primerDiaDelMes, resumenDeSede, type LecturaRitmo } from "@/lib/rendimiento-meta-reglas";
import {
  diasDelEje,
  filasPorPersona,
  fraseDelEquipo,
  medirEquipo,
  medirGrupo,
  PRESETS,
  presetDeTramo,
  serieDeFilas,
  simuladorDeCierre,
  cierreSimulado,
  tramoDePreset,
  tramoEnPalabras,
  type Preset,
  type Tramo,
} from "@/lib/rendimiento-vista-reglas";
import { hayFiltrosPuestos, type FiltrosVivos, type OrdenViva } from "@/lib/tabla-viva-reglas";
import { CifrasRendimiento } from "./CifrasRendimiento";
import { FilaAbierta } from "./FilaAbierta";
import { GraficoRendimiento, type ModoGrafico } from "./GraficoRendimiento";
import { PanelRendimiento } from "./PanelRendimiento";
import { SedesConAnillo } from "./SedesConAnillo";
import { TablaRendimiento, useColumnasRendimiento } from "./TablaRendimiento";
import { useFocoPersona } from "./useFocoPersona";
import { useLuzLiquida } from "./useLuzLiquida";

/* ====================================================================
   La mesa de Rendimiento (ADR-0610; maqueta docs/maquetas/rendimiento-superpoderes-2026-11/): todo sale de UN solo estado —la tienda, los días, las
   personas—, y lo que se toca en una pieza se acomoda en las demás. Todo vive en el navegador: el servidor ya leyó todas las tiendas, así que cambiar de
   tienda o de días no pide nada, no prende el loader y no mueve la vista (Felipe, 2026-09-29 y 2026-10-03). Las cuentas son de `rendimiento-vista-reglas.ts`.
   ==================================================================== */

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });

export function MesaRendimiento({
  sedes,
  inicialId,
  sesionId,
  hoy,
  personaCuentaId,
  esAdmin,
  rankings,
}: {
  sedes: SedeDeRendimiento[];
  inicialId: string;
  sesionId: string;
  hoy: string;
  personaCuentaId: string | null;
  esAdmin: boolean;
  rankings: Record<string, ReactNode>;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useLuzLiquida(raiz);
  useFocoPersona(raiz);
  const [activaId, setActivaId] = useState(inicialId);
  const [tramo, setTramo] = useState<Tramo>(() => tramoDePreset("mes", hoy));
  const [filtros, setFiltros] = useState<FiltrosVivos>({});
  const [orden, setOrden] = useState<OrdenViva | null>({ clave: "avance", dir: "desc" });
  const [porDia, setPorDia] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoGrafico>("dia");
  const [mesPasado, setMesPasado] = useState(false);
  const [diaVivo, setDiaVivo] = useState<string | null>(null);
  // «Ver cómo fue»: el mes se repite día a día. Mientras tanto, el tramo crece solo; al llegar a hoy, se detiene (no es un bucle).
  const [repitiendo, setRepitiendo] = useState(false);
  // La fila abierta; al cerrarse se queda un momento, para que se recoja en vez de desaparecer.
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const reloj = useRef(0);
  function alternarFila(id: string) {
    window.clearTimeout(reloj.current);
    if (abierta !== id) {
      if (abierta) setCerrando(null);
      setAbierta(id);
      return;
    }
    setCerrando(id);
    reloj.current = window.setTimeout(() => {
      setAbierta((a) => (a === id ? null : a));
      setCerrando(null);
    }, 300);
  }
  // La hora de Lima solo se conoce en el navegador: sin esto, el servidor y el navegador pintarían distinto (D-159).
  const [ahoraMin, setAhoraMin] = useState<number | null>(null);
  useEffect(() => {
    const poner = () => setAhoraMin(minutosEnLima());
    poner();
    const id = window.setInterval(poner, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const activa = sedes.find((s) => s.ubicacionId === activaId) ?? sedes[0];
  const filas = useMemo(() => activa?.personaDias ?? [], [activa]);
  const medidas = useMemo(() => medirEquipo({ personas: activa?.personas ?? [], filas, tramo, hoy, ahoraMin }), [activa, filas, tramo, hoy, ahoraMin]);
  const colores = useMemo(() => new Map(medidas.map((m, i) => [m.personaId, `var(--color-persona-${i % 6})`])), [medidas]);

  const preset = presetDeTramo(tramo, hoy);
  const tramoTexto = tramoEnPalabras(tramo, hoy);
  // Sin ninguna meta en la tienda no hay nada de qué leer un ritmo: la tabla no dibuja esa columna ni la de la meta.
  const conMeta = medidas.some((m) => m.meta !== null);
  const columnas = useColumnasRendimiento({ personas: activa?.personas ?? [], filas, colores, tramo, hoy, esHoy: preset === "hoy", personaCuentaId, conMeta, diaVivo, abiertaId: abierta });
  const tabla = useTablaViva({ filas: medidas, columnas, control: { filtros, orden, onFiltros: setFiltros, onOrden: setOrden } });
  const vistas = tabla.visibles;
  const hayFiltro = hayFiltrosPuestos(tabla.filtros);
  const elegidas = useMemo(() => medidas.filter((m) => (tabla.filtros.persona ?? []).includes(m.nombre)).map((m) => m.personaId), [medidas, tabla.filtros]);
  const grupos = (tabla.filtros.lectura ?? []) as readonly LecturaRitmo[];
  const idsVistos = useMemo(() => new Set(vistas.map((m) => m.personaId)), [vistas]);
  const grupo = useMemo(
    () => medirGrupo({ medidas: hayFiltro ? vistas : medidas, tramo, hoy, serieTienda: hayFiltro ? null : (activa?.serie ?? null) }),
    [hayFiltro, vistas, medidas, tramo, hoy, activa],
  );
  const serieGrupo = useMemo(() => (hayFiltro ? serieDeFilas(filas, (id) => id !== null && idsVistos.has(id)) : (activa?.serie ?? [])), [hayFiltro, filas, idsVistos, activa]);
  const trazo = useMemo(() => {
    let suma = 0;
    return serieGrupo.filter((d) => d.fecha >= tramo.desde && d.fecha <= tramo.hasta).map((d) => (suma += d.total));
  }, [serieGrupo, tramo]);

  const quien = !hayFiltro ? (activa?.nombre.replace(/^Tienda\s+/, "") ?? "") : vistas.length === 1 ? (vistas[0].nombre.split(" ")[0] ?? vistas[0].nombre) : `${vistas.length} personas`;
  const frase = fraseDelEquipo(hayFiltro ? vistas : medidas) ?? (grupo.meta === null ? `${quien} todavía no tiene meta: aquí se ve lo vendido, sin inventar cuánto tocaba.` : `${quien} lleva ${SOLES.format(grupo.vendido)} ${tramoTexto}.`);

  const eje = useMemo(() => diasDelEje(hoy), [hoy]);
  const serieCierre = useMemo(() => serieGrupo.filter((d) => d.fecha >= primerDiaDelMes(hoy)), [serieGrupo, hoy]);
  const simulador = useMemo(() => simuladorDeCierre(serieCierre, hoy), [serieCierre, hoy]);

  useEffect(() => {
    if (!repitiendo) return;
    if (tramo.hasta >= hoy) {
      setRepitiendo(false);
      return;
    }
    const t = window.setTimeout(() => setTramo((x) => ({ desde: x.desde, hasta: sumarDias(x.hasta, 1) })), 340);
    return () => window.clearTimeout(t);
  }, [repitiendo, tramo, hoy]);

  function repetir() {
    if (repitiendo) {
      setRepitiendo(false);
      return;
    }
    setDiaVivo(null);
    const inicio = primerDiaDelMes(hoy);
    setTramo({ desde: inicio, hasta: inicio });
    setRepitiendo(true);
  }

  function elegirSede(id: string) {
    if (id === activaId) return;
    setActivaId(id);
    setFiltros({});
    setAbierta(null);
    setCerrando(null);
    setPorDia(null);
    setRepitiendo(false);
    const url = new URL(window.location.href);
    url.searchParams.set("sede", id);
    window.history.replaceState(null, "", url);
  }
  // Días elegidos a mano: entran a la frase, a las píldoras y a «Limpiar todo», como cualquier filtro de la tabla.
  const deAfuera: FiltroDeAfuera[] = preset === "mes" ? [] : [{ clave: "dias", pildora: `Días: ${tramoTexto}`, frase: tramoTexto, quitar: () => setTramo(tramoDePreset("mes", hoy)) }];
  const ventasSinPersona = filas.filter((f) => f.personaId === null && f.fecha >= tramo.desde && f.fecha <= tramo.hasta).reduce((s, f) => s + f.total, 0);

  if (!activa) return null;
  const vistaAbajo = preset === "hoy" ? "hoy" : preset === "semana" ? "semana" : "mes";
  const hayPanel = activa.panelDisponible && activa.personaDias !== null;
  const metaSedeMes = resumenDeSede(activa.serie, "mes", hoy).meta;
  const porId = filasPorPersona(filas);

  return (
    <div ref={raiz} className="mesa mesa-marco">
      <div className="mesa-herramientas mesa-entra" style={{ "--i": 0 } as CSSProperties}>
        {sedes.length > 1 && <SedesConAnillo sedes={sedes} activaId={activa.ubicacionId} sesionId={sesionId} hoy={hoy} onElegir={elegirSede} />}
        <div data-guia="rendimiento.periodo">
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Período"
            valor={preset ?? ""}
            opciones={PRESETS.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta }))}
            onCambio={(c) => setTramo(tramoDePreset(c as Preset, hoy))}
          />
        </div>
      </div>

      <p key={frase} className="mesa-frase" data-cambia="" aria-live="polite">
        {frase}
      </p>

      <div id="panel-tienda" role={sedes.length > 1 ? "tabpanel" : undefined} aria-label={sedes.length > 1 ? activa.nombre : undefined} className="mesa">
        <CifrasRendimiento
          key={activa.ubicacionId}
          grupo={grupo}
          quien={quien}
          tramoTexto={tramoTexto}
          trazo={trazo}
          serieMes={serieCierre}
          hoy={hoy}
          medidas={medidas}
          colores={colores}
          elegidas={elegidas}
          gruposElegidos={grupos}
          porDia={porDia}
          onPorDia={(v) => {
            setPorDia(v);
            if (v !== null) setModo("suma");
          }}
          onPersona={(id) => {
            const m = medidas.find((x) => x.personaId === id);
            if (m) tabla.alternar("persona", m.nombre);
          }}
          onGrupo={(l) => tabla.alternar("lectura", l)}
        />

        {hayPanel && (
          <GraficoRendimiento
            dias={eje}
            hoy={hoy}
            filas={filas}
            medidas={vistas}
            colores={colores}
            esLaTienda={!hayFiltro}
            tramo={tramo}
            onTramo={(t) => {
              setRepitiendo(false);
              setTramo(t);
            }}
            modo={modo}
            onModo={setModo}
            mesPasado={mesPasado}
            onMesPasado={setMesPasado}
            repitiendo={repitiendo}
            onRepetir={repetir}
            cierre={
              simulador
                ? {
                    valor: cierreSimulado(simulador, porDia ?? simulador.ritmoPorDia),
                    meta: simulador.metaMes,
                    desdeHoy: simulador.vendido,
                    simulado: porDia !== null,
                  }
                : null
            }
            onDia={setDiaVivo}
            onPersona={(m) => tabla.alternar("persona", m.nombre)}
          />
        )}

        {hayPanel && (
          <TablaRendimiento
            tabla={tabla} hoy={hoy} cola={preset === "mes" ? "este mes" : undefined} deAfuera={deAfuera}
            ventasSinPersona={hayFiltro ? 0 : ventasSinPersona}
            abierta={(m) => abierta === m.personaId}
            onAbrir={(m) => alternarFila(m.personaId)}
            debajoDeFila={(m, i) =>
              abierta === m.personaId ? (
                <FilaAbierta
                  medida={m}
                  persona={activa.personas.find((p) => p.personaId === m.personaId) ?? null}
                  personas={activa.personas}
                  filas={porId.get(m.personaId) ?? []}
                  ubicacionId={activa.ubicacionId}
                  ubicacionNombre={activa.nombre}
                  hoy={hoy}
                  tramo={tramo}
                  ahoraMin={ahoraMin}
                  metaSedeMes={metaSedeMes}
                  color={colores.get(m.personaId)}
                  personaCuentaId={personaCuentaId}
                  esAdmin={esAdmin}
                  cerrando={cerrando === m.personaId}
                  guiar={i === 0}
                  onDia={(fecha) => setTramo((t) => (t.desde === fecha && t.hasta === fecha ? tramoDePreset("mes", hoy) : { desde: fecha, hasta: fecha }))}
                  onCerrar={() => alternarFila(m.personaId)}
                />
              ) : null
            }
          />
        )}

        {activa.panelDisponible ? (
          <PanelRendimiento
            key={`${activa.ubicacionId}-${vistaAbajo}`}
            ubicacionId={activa.ubicacionId}
            nombre={activa.nombre}
            hoy={hoy}
            serie={activa.serie}
            detalle={activa.detalle}
            personas={activa.personas}
            historial={activa.historial}
            vistaInicial={vistaAbajo}
            personaCuentaId={personaCuentaId}
            esAdmin={esAdmin}
            sinCabecera
          />
        ) : (
          <p className="nota-cayla">No se pudieron leer las metas de cada persona. Los rankings del mes sí están al día.</p>
        )}
        {rankings[activa.ubicacionId]}
      </div>
    </div>
  );
}
