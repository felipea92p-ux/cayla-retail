"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import type { SedeDeRendimiento } from "@/lib/rendimiento";
import { minutosEnLima, primerDiaDelMes, type LecturaRitmo } from "@/lib/rendimiento-meta-reglas";
import {
  fraseDelEquipo,
  medirEquipo,
  medirGrupo,
  PRESETS,
  presetDeTramo,
  serieDeFilas,
  tramoDePreset,
  tramoEnPalabras,
  type Preset,
  type Tramo,
} from "@/lib/rendimiento-vista-reglas";
import { CifrasRendimiento } from "./CifrasRendimiento";
import { PanelRendimiento } from "./PanelRendimiento";
import { SedesConAnillo } from "./SedesConAnillo";
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
  const [activaId, setActivaId] = useState(inicialId);
  const [tramo, setTramo] = useState<Tramo>(() => tramoDePreset("mes", hoy));
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<LecturaRitmo[]>([]);
  const [porDia, setPorDia] = useState<number | null>(null);
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

  const hayFiltro = elegidas.length > 0 || grupos.length > 0;
  const vistas = useMemo(
    () => medidas.filter((m) => (elegidas.length === 0 || elegidas.includes(m.personaId)) && (grupos.length === 0 || (m.lectura !== null && grupos.includes(m.lectura)))),
    [medidas, elegidas, grupos],
  );
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

  const preset = presetDeTramo(tramo, hoy);
  const tramoTexto = tramoEnPalabras(tramo, hoy);
  const quien = !hayFiltro ? (activa?.nombre.replace(/^Tienda\s+/, "") ?? "") : vistas.length === 1 ? (vistas[0].nombre.split(" ")[0] ?? vistas[0].nombre) : `${vistas.length} personas`;
  const frase = fraseDelEquipo(hayFiltro ? vistas : medidas) ?? (grupo.meta === null ? `${quien} todavía no tiene meta: aquí se ve lo vendido, sin inventar cuánto tocaba.` : `${quien} lleva ${SOLES.format(grupo.vendido)} ${tramoTexto}.`);

  function elegirSede(id: string) {
    if (id === activaId) return;
    setActivaId(id);
    setElegidas([]);
    setGrupos([]);
    setPorDia(null);
    const url = new URL(window.location.href);
    url.searchParams.set("sede", id);
    window.history.replaceState(null, "", url);
  }
  const alternar = <T,>(lista: T[], x: T) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);

  if (!activa) return null;
  const vistaAbajo = preset === "hoy" ? "hoy" : preset === "semana" ? "semana" : "mes";

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
          serieMes={serieGrupo.filter((d) => d.fecha >= primerDiaDelMes(hoy))}
          hoy={hoy}
          medidas={medidas}
          colores={colores}
          elegidas={elegidas}
          gruposElegidos={grupos}
          porDia={porDia}
          onPorDia={setPorDia}
          onPersona={(id) => setElegidas((l) => alternar(l, id))}
          onGrupo={(l) => setGrupos((g) => alternar(g, l))}
        />

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
