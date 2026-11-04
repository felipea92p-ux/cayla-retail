"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { Buscador } from "@/components/ui/Buscador";
import { ariaDelBuscador, ListaSugerencias, type Sugerencia } from "@/components/ui/ListaSugerencias";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { useTablaViva, type FiltroDeAfuera } from "@/components/ui/TablaViva";
import { descargarCsv } from "@/lib/exportar-csv";
import type { SedeDeRendimiento } from "@/lib/rendimiento";
import { sumarDias } from "@/lib/fechas-lima";
import { minutosEnLima, primerDiaDelMes, resumenDeSede, type LecturaRitmo } from "@/lib/rendimiento-meta-reglas";
import {
  diasDelEje,
  filasPorPersona,
  fraseDelEquipo,
  interpretarBusqueda,
  loQueSeBaja,
  nombreCoincide,
  medirEquipo,
  medirGrupo,
  PRESETS,
  presetDeTramo,
  serieDeFilas,
  simuladorDeCierre,
  cierreSimulado,
  tramoDePreset,
  tramoEnPalabras,
  type IntencionBusqueda,
  type Preset,
  type Tramo,
} from "@/lib/rendimiento-vista-reglas";
import { hayFiltrosPuestos, type FiltrosVivos, type OrdenViva } from "@/lib/tabla-viva-reglas";
import { CifrasRendimiento } from "./CifrasRendimiento";
import { FilaAbierta } from "./FilaAbierta";
import { GraficoRendimiento, type ModoGrafico } from "./GraficoRendimiento";
import { DetalleRendimiento } from "./DetalleRendimiento";
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

/** Lo que «Deshacer» devuelve: cómo se estaba mirando la pantalla. La tienda no entra: al cambiar de tienda se empieza de nuevo. */
type VistaMesa = { tramo: Tramo; filtros: FiltrosVivos; orden: OrdenViva | null; modo: ModoGrafico; mesPasado: boolean; busqueda: string };

function tituloDeIntencion(x: IntencionBusqueda): string {
  if (x.tipo === "persona") return x.nombre;
  if (x.tipo === "lectura") return `Quienes van ${x.lectura.toLowerCase()}`;
  if (x.tipo === "tramo") return x.texto.replace(/^./, (c) => c.toUpperCase());
  if (x.tipo === "sede") return x.nombre;
  if (x.tipo === "modo") return x.texto;
  return "Comparar con el mes pasado";
}
function detalleDeIntencion(x: IntencionBusqueda): string {
  if (x.tipo === "persona") return "Ver solo a esta persona";
  if (x.tipo === "lectura") return `${x.cuantas} ${x.cuantas === 1 ? "persona" : "personas"}`;
  if (x.tipo === "tramo") return "Elegir estos días";
  if (x.tipo === "sede") return "Ir a esta tienda";
  return "En el gráfico";
}

export function MesaRendimiento({
  sedes,
  inicialId,
  sesionId,
  hoy,
  tramoInicial,
  modoInicial,
  personaCuentaId,
  esAdmin,
  rankings,
}: {
  sedes: SedeDeRendimiento[];
  inicialId: string;
  sesionId: string;
  hoy: string;
  tramoInicial: Tramo;
  modoInicial: ModoGrafico;
  personaCuentaId: string | null;
  esAdmin: boolean;
  rankings: Record<string, ReactNode>;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useLuzLiquida(raiz);
  useFocoPersona(raiz);
  const [activaId, setActivaId] = useState(inicialId);
  const [tramo, setTramo] = useState<Tramo>(tramoInicial);
  const [filtros, setFiltros] = useState<FiltrosVivos>({});
  const [orden, setOrden] = useState<OrdenViva | null>({ clave: "avance", dir: "desc" });
  const [porDia, setPorDia] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoGrafico>(modoInicial);
  const [busqueda, setBusqueda] = useState("");
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [sugerida, setSugerida] = useState(0);
  // «Deshacer»: cada cambio de lo que se mira guarda cómo estaba. Mover la barra o escribir no; soltar la barra, sí.
  const [historia, setHistoria] = useState<VistaMesa[]>([]);
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
  const encontradas = useMemo(() => medidas.filter((m) => nombreCoincide(m.nombre, busqueda)), [medidas, busqueda]);
  const colores = useMemo(() => new Map(medidas.map((m, i) => [m.personaId, `var(--color-persona-${i % 6})`])), [medidas]);

  const preset = presetDeTramo(tramo, hoy);
  const tramoTexto = tramoEnPalabras(tramo, hoy);
  // Sin ninguna meta en la tienda no hay nada de qué leer un ritmo: la tabla no dibuja esa columna ni la de la meta.
  const conMeta = medidas.some((m) => m.meta !== null);
  const columnas = useColumnasRendimiento({ personas: activa?.personas ?? [], filas, colores, tramo, hoy, esHoy: preset === "hoy", personaCuentaId, conMeta, diaVivo, abiertaId: abierta });
  const arrastre = useRef<VistaMesa | null>(null);
  const vistaActual = (): VistaMesa => ({ tramo, filtros, orden, modo, mesPasado, busqueda });
  const guardar = (v: VistaMesa = vistaActual()) => setHistoria((h) => [...h.slice(-39), v]);
  const tabla = useTablaViva({
    filas: encontradas,
    columnas,
    control: {
      filtros,
      orden,
      onFiltros: (f) => {
        guardar();
        setFiltros(f);
      },
      onOrden: (o) => {
        guardar();
        setOrden(o);
      },
    },
  });
  const vistas = tabla.visibles;
  const hayFiltro = hayFiltrosPuestos(tabla.filtros) || busqueda.trim() !== "";
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

  function deshacer() {
    const v = historia.at(-1);
    if (!v) return;
    setHistoria((h) => h.slice(0, -1));
    setRepitiendo(false);
    setTramo(v.tramo);
    setFiltros(v.filtros);
    setOrden(v.orden);
    setModo(v.modo);
    setMesPasado(v.mesPasado);
    setBusqueda(v.busqueda);
  }
  function ponerTramo(t: Tramo) {
    guardar();
    setRepitiendo(false);
    setTramo(t);
  }

  // Lo que se mira queda en la dirección, para compartirlo o recargar en lo mismo. Sin navegar: ni pide nada a la base ni mueve la vista.
  useEffect(() => {
    if (repitiendo) return;
    const url = new URL(window.location.href);
    const esMes = presetDeTramo(tramo, hoy) === "mes";
    url.searchParams.delete("vista");
    if (esMes) {
      url.searchParams.delete("desde");
      url.searchParams.delete("hasta");
    } else {
      url.searchParams.set("desde", tramo.desde);
      url.searchParams.set("hasta", tramo.hasta);
    }
    if (modo === "dia") url.searchParams.delete("modo");
    else url.searchParams.set("modo", modo);
    window.history.replaceState(null, "", url);
  }, [tramo, modo, repitiendo, hoy]);

  // Las teclas de la pantalla. «/» lo pone el buscador. Nunca mientras se escribe o hay una hoja abierta.
  const teclas = useRef({ tramo, abierta, eje: [] as readonly string[], hoy, hayFiltro, limpiar: () => {}, cerrar: () => {}, mover: (_: Tramo) => {} });
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.defaultPrevented || el?.closest?.("input, textarea, [contenteditable], [role=dialog], [role=listbox]")) return;
      const t = teclas.current;
      if (e.key === "Escape") {
        if (t.abierta) t.cerrar();
        else if (t.hayFiltro || presetDeTramo(t.tramo, t.hoy) !== "mes") t.limpiar();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (el?.closest?.("[role=radiogroup], [role=tablist]") || presetDeTramo(t.tramo, t.hoy) === "mes") return;
      const a = t.eje.indexOf(t.tramo.desde);
      const b = t.eje.indexOf(t.tramo.hasta);
      const paso = e.key === "ArrowRight" ? 1 : -1;
      if (a < 0 || b < 0 || a + paso < 0 || t.eje[b + paso] === undefined || t.eje[b + paso] > t.hoy) return;
      e.preventDefault();
      t.mover({ desde: t.eje[a + paso], hasta: t.eje[b + paso] });
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);
  useEffect(() => {
    teclas.current = {
      tramo,
      abierta,
      eje,
      hoy,
      hayFiltro,
      cerrar: () => {
        if (abierta) alternarFila(abierta);
      },
      limpiar: () => {
        guardar();
        setFiltros({});
        setBusqueda("");
        setRepitiendo(false);
        setTramo(tramoDePreset("mes", hoy));
      },
      mover: setTramo,
    };
  });

  // Lo que puede querer decir lo que se escribió.
  const intenciones = useMemo(
    () => interpretarBusqueda(busqueda, { medidas, sedes: sedes.map((s) => ({ ubicacionId: s.ubicacionId, nombre: s.nombre })), activaId: activa?.ubicacionId ?? "", hoy }),
    [busqueda, medidas, sedes, activa, hoy],
  );
  const listaAbierta = buscadorAbierto && busqueda.trim() !== "";
  const sugerencias: Sugerencia[] = intenciones.map((x, i) => ({
    clave: `${x.tipo}-${i}`,
    titulo: tituloDeIntencion(x),
    detalle: detalleDeIntencion(x),
  }));
  function aplicar(x: IntencionBusqueda | undefined) {
    if (!x) return;
    setBuscadorAbierto(false);
    if (x.tipo === "sede") {
      setBusqueda("");
      elegirSede(x.ubicacionId);
      return;
    }
    // Lo escrito era la pregunta, no parte de lo que se miraba: «Deshacer» no lo trae de vuelta.
    guardar({ ...vistaActual(), busqueda: "" });
    setBusqueda("");
    setRepitiendo(false);
    if (x.tipo === "persona") {
      const m = medidas.find((p) => p.personaId === x.personaId);
      if (m) setFiltros((f) => ({ ...f, persona: [m.nombre] }));
    } else if (x.tipo === "lectura") setFiltros((f) => ({ ...f, lectura: [x.lectura] }));
    else if (x.tipo === "tramo") setTramo(x.tramo);
    else if (x.tipo === "modo") setModo(x.modo);
    else setMesPasado(true);
  }

  function repetir() {
    if (repitiendo) {
      setRepitiendo(false);
      return;
    }
    setDiaVivo(null);
    guardar();
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
    setHistoria([]);
    setBusqueda("");
    const url = new URL(window.location.href);
    url.searchParams.set("sede", id);
    window.history.replaceState(null, "", url);
  }
  // Días elegidos a mano: entran a la frase, a las píldoras y a «Limpiar todo», como cualquier filtro de la tabla.
  const deAfuera: FiltroDeAfuera[] = [
    ...(busqueda.trim() ? [{ clave: "busqueda", pildora: `Busca: «${busqueda.trim()}»`, frase: `con «${busqueda.trim()}»`, quitar: () => setBusqueda("") }] : []),
    ...(preset === "mes" ? [] : [{ clave: "dias", pildora: `Días: ${tramoTexto}`, frase: "", quitar: () => ponerTramo(tramoDePreset("mes", hoy)) }]),
  ];
  const ventasSinPersona = filas.filter((f) => f.personaId === null && f.fecha >= tramo.desde && f.fecha <= tramo.hasta).reduce((s, f) => s + f.total, 0);

  if (!activa) return null;
  const hayPanel = activa.panelDisponible && activa.personaDias !== null;
  const metaSedeMes = resumenDeSede(activa.serie, "mes", hoy).meta;
  const porId = filasPorPersona(filas);

  return (
    <div ref={raiz} className="mesa mesa-marco">
      <div className="mesa-herramientas mesa-entra" style={{ "--i": 0 } as CSSProperties}>
        {sedes.length > 1 && <SedesConAnillo sedes={sedes} activaId={activa.ubicacionId} sesionId={sesionId} hoy={hoy} onElegir={elegirSede} />}
        <div className="mesa-buscador" data-guia="rendimiento.buscador">
          <Buscador
            valor={busqueda}
            onCambio={(v) => {
              setBusqueda(v);
              setSugerida(0);
              setBuscadorAbierto(true);
            }}
            atajo
            etiqueta="Buscar en Rendimiento"
            placeholder="Alguien, «por debajo», «del 5 al 12»" // sugerir-fijo: enseña qué entiende este buscador; no depende de nada elegido antes
            onFocus={() => setBuscadorAbierto(true)}
            onBlur={() => setBuscadorAbierto(false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (intenciones.length > 0) setSugerida((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + intenciones.length) % intenciones.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                aplicar(intenciones[sugerida]);
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setBusqueda("");
                setBuscadorAbierto(false);
              }
            }}
            {...ariaDelBuscador("mesa-sugerencias", listaAbierta, intenciones.length > 0 ? sugerida : null)}
          />
          {listaAbierta &&
            (intenciones.length > 0 ? (
              <ListaSugerencias id="mesa-sugerencias" etiqueta="Lo que entendí" sugerencias={sugerencias} activa={sugerida} onActiva={setSugerida} onElegir={(i) => aplicar(intenciones[i])} className="mesa-sugerencias" />
            ) : (
              <p
                className="mesa-sugerencias mesa-sin-entender lista-flotante" // unificar-fijo: no es una lista: es la frase de cuando no se entendió nada
                role="status"
              >
                No entendí «{busqueda.trim()}». Prueba con un nombre, «por debajo», «día 10» o «del 5 al 12».
              </p>
            ))}
        </div>
        <div data-guia="rendimiento.periodo">
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Período"
            valor={preset ?? ""}
            opciones={PRESETS.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta }))}
            onCambio={(c) => ponerTramo(tramoDePreset(c as Preset, hoy))}
          />
        </div>
        {historia.length > 0 && (
          <span className="mesa-entra-rapido" data-guia="rendimiento.deshacer">
            <BotonDeshacer onClick={deshacer} title="Vuelve a como estaba antes de lo último que cambiaste" />
          </span>
        )}
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
            if (v !== null && modo !== "suma") {
              guardar();
              setModo("suma");
            }
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
            onTramo={(t, soltando) => {
              setRepitiendo(false);
              // Se guarda cómo estaba ANTES de arrastrar, una sola vez.
              if (!soltando && !arrastre.current) arrastre.current = vistaActual();
              if (soltando) {
                guardar(arrastre.current ?? vistaActual());
                arrastre.current = null;
              }
              setTramo(t);
            }}
            modo={modo}
            onModo={(m) => {
              guardar();
              setModo(m);
            }}
            mesPasado={mesPasado}
            onMesPasado={(v) => {
              guardar();
              setMesPasado(v);
            }}
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
          <div className="mesa-descarga" data-guia="rendimiento.descargar">
            <BotonDescargar
              chico
              onClick={() => {
                const { encabezados, filas: filasCsv } = loQueSeBaja(vistas, conMeta);
                descargarCsv(`rendimiento-${activa.nombre.replace(/^Tienda\s+/, "").toLowerCase()}-${tramo.desde}-a-${tramo.hasta}.csv`, encabezados, filasCsv);
              }}
            >
              Descargar lo que ves
            </BotonDescargar>
          </div>
        )}

        {hayPanel && (
          <TablaRendimiento
            tabla={tabla} hoy={hoy} total={medidas.length} cola={preset === "semana" ? "en los últimos 7 días" : tramoTexto} deAfuera={deAfuera}
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
                  onDia={(fecha) => ponerTramo(tramo.desde === fecha && tramo.hasta === fecha ? tramoDePreset("mes", hoy) : { desde: fecha, hasta: fecha })}
                  onCerrar={() => alternarFila(m.personaId)}
                />
              ) : null
            }
          />
        )}

        {!hayPanel && <p className="nota-cayla">No se pudo leer lo de cada persona. Lo de la tienda y los rankings del mes sí están al día.</p>}
        {activa.panelDisponible && (
          <DetalleRendimiento nombre={activa.nombre} personas={activa.personas} detalle={activa.detalle} historial={activa.historial} tramo={tramo} tramoTexto={tramoTexto} metaSedeMes={metaSedeMes} />
        )}
        {rankings[activa.ubicacionId]}
      </div>
    </div>
  );
}
