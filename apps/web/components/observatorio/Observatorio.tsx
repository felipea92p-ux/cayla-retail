"use client";

// Observatorio: el Inicio de las cuentas Admin (ADR-0322; maqueta aprobada: docs/maquetas/inicio-admin-v3-2026-10/). Quien
// no vende y quiere ver cómo va el negocio: cuánto se vendió contra la meta, el mapa de las tiendas (al elegir una, el mapa
// se acerca a su departamento y el panel de la derecha muestra su detalle), el Taller y lo que hay por revisar.
//
// Las cuentas son puras (`lib/observatorio-reglas.ts`): al cambiar de periodo o de tienda no se vuelve a la base. Cada 30 s
// (con la pestaña a la vista) se lee de nuevo `/api/observatorio`: una venta nueva hace una onda en su tienda y entra al
// ticker. El panel de una tienda se pide al acercarse (o al pasar el mouse por su nombre) y queda guardado.
//
// Movimiento (ADR-0136, con las excepciones de señal de ADR-0322): la entrada en cascada, el zoom, las cifras que cuentan o
// ruedan y los trazos que se dibujan responden a una acción o a la llegada; el latido de las tiendas con caja abierta, el
// cometa del traslado en camino y el halo de lo urgente se repiten porque son señales. Todo se apaga con
// `prefers-reduced-motion`.

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as EventoPuntero, type ReactNode, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { CIUDAD_DE_TIENDA } from "@/lib/observatorio-mapa";
import {
  ABRE,
  calcular,
  hora12,
  rankear,
  textoDelPeriodo,
  textoVsDe,
  ventanaDe,
  ventasNuevas,
  type AvisoObs,
  type Calculo,
  type DatosObservatorio,
  type DatosTienda,
  type Periodo,
  type TallerObs,
  type TiendaObs,
} from "@/lib/observatorio-reglas";
import { Ic } from "./iconos";
import { Mapa, type TiendaEnMapa } from "./Mapa";
import { PanelGlobal } from "./PanelGlobal";
import { PanelTienda, TABS, type Tab } from "./PanelTienda";
import { PorRevisar, TallerTarjeta } from "./Abajo";
import { Cifra, ObsCtx, Odometro, Segmento, ancho, fmt, useArranque, useReducido, type ContextoObs } from "./piezas";

const ORDEN_MAPA = ["TRU", "AQP", "LIM"];
const i = (n: number) => ({ "--i": n }) as CSSProperties;
const PERIODOS: readonly (readonly [Periodo, string])[] = [
  ["hoy", "Hoy"],
  ["7d", "7 días"],
  ["30d", "30 días"],
];
const TEXTO_VENTANA: Record<Periodo, string> = { hoy: "hoy", "7d": "en 7 días", "30d": "en 30 días" };

type ManijaTip = { mostrar: (c: ReactNode, x: number, y: number) => void; ocultar: () => void };

/** El tooltip: uno solo, en el `body` (dentro de `.obs` la contención de su container query lo dejaría mal ubicado). */
function Tip({ manija }: { manija: RefObject<ManijaTip | null> }) {
  // En el servidor no hay `body`: el portal se arma recién en el navegador.
  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [estado, setEstado] = useState<{ c: ReactNode; x: number; y: number; on: boolean }>({ c: null, x: 0, y: 0, on: false });
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(manija, () => ({
    mostrar: (c, x, y) => setEstado({ c, x, y, on: true }),
    ocultar: () => setEstado((e) => (e.on ? { ...e, on: false } : e)),
  }), []);
  useLayoutEffect(() => {
    const t = el.current;
    if (!t || !estado.on) return;
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    let lx = estado.x + 14;
    let ly = estado.y - h - 12;
    if (lx + w > window.innerWidth - 8) lx = estado.x - w - 14;
    if (ly < 8) ly = estado.y + 16;
    t.style.left = `${lx}px`;
    t.style.top = `${ly}px`;
  });
  if (!montado) return null;
  return createPortal(
    <div ref={el} className={`o-tip ${estado.on ? "on" : ""}`} role="tooltip">
      {estado.c}
    </div>,
    document.body
  );
}

export function Observatorio({
  datosIniciales,
  avisos,
  taller,
  focoInicial,
  tiendaInicial,
}: {
  datosIniciales: DatosObservatorio;
  avisos: readonly AvisoObs[];
  taller: TallerObs | null;
  /** La tienda elegida arriba (en una sede) o `"TODAS"` (en CAYLA Global, o parado en una sede que no es tienda). */
  focoInicial: string;
  /** El panel de esa tienda, ya leído por el servidor (`undefined` si abre en toda CAYLA). */
  tiendaInicial?: DatosTienda | null;
}) {
  const reducido = useReducido();
  const [datos, setDatos] = useState(datosIniciales);
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [foco, setFoco] = useState(() => (focoInicial === "TODAS" || datosIniciales.tiendas.some((t) => t.id === focoInicial) ? focoInicial : "TODAS"));
  const [tab, setTab] = useState<Tab>("ritmo");
  const [dirTab, setDirTab] = useState<"" | "de-der" | "de-izq">("");
  const [comparar, setComparar] = useState("TODAS");
  const [cat, setCat] = useState("todas");
  const [alerta, setAlerta] = useState<string | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [entrando, setEntrando] = useState(true);
  const [ondas, setOndas] = useState<{ id: string; tienda: string }[]>([]);
  const [nuevaId, setNuevaId] = useState<string | null>(null);
  const [tiendaDatos, setTiendaDatos] = useState<Record<string, DatosTienda | null>>(() =>
    tiendaInicial !== undefined && focoInicial !== "TODAS" ? { [focoInicial]: tiendaInicial } : {}
  );
  const pedidas = useRef(new Set<string>(tiendaInicial !== undefined && focoInicial !== "TODAS" ? [focoInicial] : []));
  const datosRef = useRef(datos);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);
  const heroeRef = useRef<HTMLElement>(null);
  const tipRef = useRef<ManijaTip | null>(null);
  const a = useArranque();

  const mostrarTip = useCallback((c: ReactNode, x: number, y: number) => tipRef.current?.mostrar(c, x, y), []);
  const ocultarTip = useCallback(() => tipRef.current?.ocultar(), []);
  const ctx: ContextoObs = useMemo(
    () => ({ entrando, rapido: replay !== null, reducido, mostrarTip, ocultarTip }),
    [entrando, replay, reducido, mostrarTip, ocultarTip]
  );

  // ── Datos ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    datosRef.current = datos;
  }, [datos]);
  // La página se volvió a pedir (cambio de sede arriba, «Reintentar»): lo del servidor es lo más fresco.
  const [inicialesVistos, setInicialesVistos] = useState(datosIniciales);
  if (inicialesVistos !== datosIniciales) {
    setInicialesVistos(datosIniciales);
    setDatos(datosIniciales);
  }

  const tiendas = useMemo(() => {
    const lugar = (t: TiendaObs) => (t.mapa ? ORDEN_MAPA.indexOf(t.mapa) : ORDEN_MAPA.length);
    return [...datos.tiendas].sort((x, y) => lugar(x) - lugar(y) || x.nombre.localeCompare(y.nombre));
  }, [datos.tiendas]);
  const corte = replay ?? datos.ahoraMin;
  const todas = useMemo(() => calcular(datos, "TODAS", periodo, corte), [datos, periodo, corte]);
  const porTienda = useMemo(() => new Map(tiendas.map((t) => [t.id, calcular(datos, t.id, periodo, corte)])), [datos, tiendas, periodo, corte]);
  const ranking = useMemo(() => rankear(datos, periodo, corte), [datos, periodo, corte]);
  const tienda = foco === "TODAS" ? null : (tiendas.find((t) => t.id === foco) ?? null);
  const zoom = tienda !== null;
  const c: Calculo = (tienda && porTienda.get(tienda.id)) || todas;
  const calculoDe = (f: string) => (f === "TODAS" ? todas : (porTienda.get(f) ?? calcular(datos, f, periodo, corte)));
  const textoVs = textoVsDe(periodo, datos.hoy);
  const ciudadDe = (t: TiendaObs) => (t.mapa ? CIUDAD_DE_TIENDA[t.mapa].ciudad : t.nombre);
  const siglas = useMemo(() => Object.fromEntries(tiendas.map((t) => [t.id, t.sigla])), [tiendas]);

  /** Pide el panel de una tienda. `silencioso`: vuelve a leer sin borrar lo que ya se ve (llegó una venta). */
  const pedir = useCallback(async (id: string, modo: "una-vez" | "silencioso" | "reintentar" = "una-vez") => {
    if (modo === "una-vez" && pedidas.current.has(id)) return;
    pedidas.current.add(id);
    if (modo === "reintentar")
      setTiendaDatos((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
    let leido: DatosTienda | null = null;
    try {
      const r = await fetch(`/api/observatorio/tienda?u=${encodeURIComponent(id)}`, { cache: "no-store", headers: { "x-espera": "no" } });
      leido = r.ok ? ((await r.json()) as { datos: DatosTienda | null }).datos : null;
    } catch {
      leido = null;
    }
    setTiendaDatos((d) => (leido === null && modo === "silencioso" && d[id] ? d : { ...d, [id]: leido }));
  }, []);

  // Cada 30 s, con la pestaña a la vista y fuera de «Repetir el día».
  useEffect(() => {
    let vigente = true;
    const leer = async () => {
      if (document.hidden || intervalo.current !== null) return;
      try {
        const r = await fetch("/api/observatorio", { cache: "no-store", headers: { "x-espera": "no" } });
        if (!r.ok || !vigente) return;
        const nuevo = ((await r.json()) as { datos: DatosObservatorio | null }).datos;
        if (!nuevo || !vigente) return;
        const llegaron = ventasNuevas(datosRef.current.hoyVentas, nuevo.hoyVentas);
        if (llegaron.length) {
          const marcas = llegaron.map((v) => ({ id: v.id, tienda: v.u }));
          setOndas((o) => [...o, ...marcas]);
          setTimeout(() => setOndas((o) => o.filter((x) => !marcas.some((m) => m.id === x.id))), 1700);
          setNuevaId(llegaron[llegaron.length - 1].id);
          for (const id of new Set(llegaron.map((v) => v.u))) if (pedidas.current.has(id)) void pedir(id, "silencioso");
        }
        setDatos(nuevo);
      } catch {
        // Sin red por un momento: la pantalla sigue con lo último que leyó y vuelve a probar en 30 s.
      }
    };
    const t = setInterval(leer, 30000);
    const alVolver = () => {
      if (!document.hidden) void leer();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vigente = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [pedir]);

  // ── Movimiento ────────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setEntrando(false), 3400);
    return () => clearTimeout(t);
  }, []);
  // Al cambiar de foco, la tarjeta vuelve a hacer su cascada (el panel entra desde la derecha, el nombre del departamento…).
  const focoPintado = useRef(foco);
  useLayoutEffect(() => {
    if (focoPintado.current === foco) return;
    focoPintado.current = foco;
    const el = heroeRef.current;
    if (!el || reducido) return;
    el.classList.remove("refoco");
    void el.offsetWidth;
    el.classList.add("refoco");
    const t = setTimeout(() => el.classList.remove("refoco"), 2200);
    return () => clearTimeout(t);
  }, [foco, reducido]);
  useEffect(() => {
    const ocultar = () => tipRef.current?.ocultar();
    window.addEventListener("scroll", ocultar, { passive: true });
    return () => window.removeEventListener("scroll", ocultar);
  }, []);
  useEffect(
    () => () => {
      if (intervalo.current) clearInterval(intervalo.current);
    },
    []
  );

  // ── Acciones ──────────────────────────────────────────────────────────────────────────────────────────────────────
  function enfocar(s: string) {
    if (replay !== null || s === foco) return;
    if (s !== "TODAS" && comparar === s) setComparar("TODAS");
    setCat("todas");
    setDirTab("");
    setAlerta(null);
    setFoco(s);
    if (s !== "TODAS") void pedir(s);
  }
  function ponerPeriodo(p: Periodo) {
    if (replay !== null || p === periodo) return;
    setPeriodo(p);
  }
  function ponerTab(t: Tab) {
    if (t === tab) return;
    const desde = TABS.findIndex((x) => x[0] === tab);
    const hasta = TABS.findIndex((x) => x[0] === t);
    setDirTab(hasta > desde ? "de-der" : "de-izq");
    setTab(t);
  }
  function abrirAviso(clave: string | null) {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (!reducido && doc.startViewTransition) doc.startViewTransition(() => flushSync(() => setAlerta(clave)));
    else setAlerta(clave);
  }
  function irAviso(clave: string) {
    setAlerta(clave);
    requestAnimationFrame(() => document.getElementById("o-revisar")?.scrollIntoView({ behavior: reducido ? "auto" : "smooth", block: "center" }));
  }
  function terminarRepeticion() {
    if (intervalo.current) clearInterval(intervalo.current);
    intervalo.current = null;
    setReplay(null);
  }
  function repetirDia() {
    if (periodo !== "hoy") return;
    if (intervalo.current) {
      terminarRepeticion();
      return;
    }
    const real = datos.ahoraMin;
    let t = Math.min(ABRE - 28, real);
    setAlerta(null);
    ocultarTip();
    setReplay(t);
    const paso = Math.max(3, Math.round((real - t) / 62));
    intervalo.current = setInterval(() => {
      t = Math.min(real, t + paso);
      setReplay(t);
      if (t >= real) terminarRepeticion();
    }, 110);
  }

  // La sede elegida arriba cambió (la página se volvió a pedir): el mapa va a esa tienda, o vuelve al país.
  const focoInicialPrevio = useRef(focoInicial);
  useEffect(() => {
    if (focoInicialPrevio.current === focoInicial) return;
    focoInicialPrevio.current = focoInicial;
    enfocar(datos.tiendas.some((t) => t.id === focoInicial) ? focoInicial : "TODAS");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoInicial]);

  // Escape vuelve al país; ← → pasan de tienda (nunca mientras se escribe ni con un modal abierto).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (foco === "TODAS" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "Escape") enfocar("TODAS");
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const n = tiendas.findIndex((x) => x.id === foco);
        const s = tiendas[(n + (e.key === "ArrowRight" ? 1 : tiendas.length - 1)) % tiendas.length];
        if (s) enfocar(s.id);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  });

  const mover = (e: EventoPuntero<HTMLDivElement>) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const luz = t.closest<HTMLElement>(".o-luz");
    if (luz) {
      const r = luz.getBoundingClientRect();
      luz.style.setProperty("--mx", `${e.clientX - r.left}px`);
      luz.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
    if (!t.closest("[data-tip]") && !t.closest(".capa")) ocultarTip();
  };

  // ── Lo que se pinta ───────────────────────────────────────────────────────────────────────────────────────────────
  const contenidoTienda = (t: TiendaObs): ReactNode => {
    const x = porTienda.get(t.id);
    if (!x) return null;
    return (
      <>
        <b>{fmt("s", x.total)}</b> · {t.nombre}
        <br />
        {x.pct === null || x.meta === null ? "sin meta configurada" : `${fmt("p", x.pct)} de ${fmt("s", x.meta)}`} · {x.tickets} {x.tickets === 1 ? "ticket" : "tickets"}
        <br />
        {x.delta === null ? "sin comparación" : `${fmt("v", x.delta)} ${textoVs}`}
        {foco !== t.id && (
          <>
            <br />
            <span className="suave">Toca para acercarte</span>
          </>
        )}
      </>
    );
  };
  const enMapa: TiendaEnMapa[] = tiendas.flatMap((t) => {
    if (!t.mapa) return [];
    const x = porTienda.get(t.id);
    return [{ id: t.id, sigla: t.mapa, total: x?.total ?? 0, pct: x?.pct ?? null, abierta: t.caja !== null && t.caja.desde <= corte, tip: () => contenidoTienda(t) }];
  });
  const traslados = avisos.find((x) => x.clave === "traslados")?.detalle;
  const rutas = traslados?.tipo === "rutas" ? traslados.rutas : [];
  const ultimaVenta = [...datos.hoyVentas].filter((v) => v.min <= corte).sort((x, y) => y.min - x.min)[0];
  const ultima = ultimaVenta
    ? { id: ultimaVenta.id, hora: hora12(ultimaVenta.min), sigla: siglas[ultimaVenta.u] ?? "", monto: fmt("s", ultimaVenta.s), nueva: ultimaVenta.id === nuevaId }
    : null;
  const tallerEnMapa = {
    texto: taller ? `${taller.enCurso} ${taller.enCurso === 1 ? "orden" : "órdenes"}` : "sin datos",
    tip: () =>
      taller ? (
        <>
          <b>Taller</b>
          <br />
          {taller.enCurso} {taller.enCurso === 1 ? "orden" : "órdenes"} en curso · {taller.atrasadas} {taller.atrasadas === 1 ? "atrasada" : "atrasadas"}
        </>
      ) : (
        <>
          <b>Taller</b>
          <br />
          No se pudo leer
        </>
      ),
  };
  const enFoco = tienda ? [tienda] : tiendas;
  const abiertas = enFoco.filter((t) => t.caja !== null && t.caja.desde <= corte).length;
  const filasRanking = ranking.flatMap((x) => {
    const t = tiendas.find((y) => y.id === x.foco);
    return t ? [{ calculo: x, sigla: t.sigla, ciudad: ciudadDe(t), tip: () => contenidoTienda(t) }] : [];
  });

  return (
    <ObsCtx.Provider value={ctx}>
      <div className={`obs ${entrando && !reducido ? "entrando" : ""} ${replay !== null ? "rapido" : ""}`} onPointerMove={mover} onPointerLeave={ocultarTip}>
        {/* Pide todo el ancho del <main> (`AppShell`: `has-[[data-ancho-completo]]`): el mapa llena la pantalla. */}
        <span hidden data-ancho-completo />
        <header className="o-cab">
          <div className="o-ent" style={i(0)}>
            <p className="o-sobre">
              <span className={`o-punto late ${abiertas ? "" : "no"}`} />
              <span className="o-lbl">
                {tienda ? tienda.nombre : "Toda CAYLA"} · {textoDelPeriodo(periodo, datos.hoy, corte)}
              </span>
            </p>
            <span className="o-total">
              <Odometro v={c.total} />
            </span>
            <div className="o-meter">
              <div className="pista">
                <i className="o-anima" style={ancho(a, c.pct ?? 0, 500)} />
                <em style={{ left: "100%" }} />
              </div>
              <div className="pie">
                {c.pct === null || c.meta === null ? (
                  <span>Sin meta configurada</span>
                ) : (
                  <>
                    <b>
                      <Cifra v={c.pct} f="p" />
                    </b>
                    <span>de {fmt("s", c.meta)}</span>
                  </>
                )}
                {c.delta === null ? (
                  <span className="o-chip">
                    <i />
                    Sin comparación
                  </span>
                ) : (
                  <span className={`o-chip ${c.delta >= 0 ? "ok" : "warn"}`}>
                    <i />
                    {fmt("v", c.delta)} {textoVs}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="o-ent" style={i(1)}>
            <div className="o-ctrl">
              <Segmento valor={periodo} opciones={PERIODOS} onValor={ponerPeriodo} etiqueta="Periodo" />
              <Segmento
                valor={foco}
                opciones={[
                  [
                    "TODAS",
                    <>
                      <span className="largo">Toda </span>CAYLA
                    </>,
                  ],
                  ...tiendas.map((t) => [t.id, t.sigla] as const),
                ]}
                onValor={enfocar}
                onPasar={(v) => {
                  if (v !== "TODAS") void pedir(v);
                }}
                etiqueta="Tienda"
              />
              <button
                type="button"
                className={`o-repetir ${replay !== null ? "va" : ""}`}
                onClick={repetirDia}
                disabled={periodo !== "hoy"}
                title={periodo !== "hoy" ? "Solo en «Hoy»" : "Ver el día de hoy otra vez, de la apertura a esta hora"}
              >
                <Ic n={replay !== null ? "pausa" : "play"} />
                <span>{replay !== null ? hora12(replay) : "Repetir el día"}</span>
              </button>
            </div>
          </div>
        </header>

        <section ref={heroeRef} className={`o-tj o-luz o-heroe o-ent ${zoom ? "zoom" : ""}`} style={i(2)}>
          <div className="o-hmapa">
            <Mapa
              tiendas={enMapa}
              focoMapa={tienda?.mapa ?? "TODAS"}
              zoom={zoom}
              rutas={rutas}
              taller={tallerEnMapa}
              ultima={ultima}
              ondas={ondas}
              onEnfocar={enfocar}
              onPasar={(id) => void pedir(id)}
            />
          </div>
          <div className="o-hpanel">
            {tienda ? (
              <PanelTienda
                tienda={tienda}
                ciudad={ciudadDe(tienda)}
                calculo={c}
                calculoDe={calculoDe}
                tiendas={tiendas}
                periodo={periodo}
                hoy={datos.hoy}
                corte={corte}
                textoVs={textoVs}
                datos={tiendaDatos[tienda.id]}
                onReintentar={() => void pedir(tienda.id, "reintentar")}
                avisos={avisos}
                tab={tab}
                dirTab={dirTab}
                onTab={ponerTab}
                comparar={comparar}
                onComparar={setComparar}
                cat={cat}
                onCat={setCat}
                onEnfocar={enfocar}
                onIrAviso={irAviso}
              />
            ) : (
              <PanelGlobal
                todas={todas}
                ranking={filasRanking}
                orden={tiendas.map((t) => t.id)}
                textoVs={textoVs}
                onEnfocar={enfocar}
                onPasar={(id) => void pedir(id)}
              />
            )}
          </div>
        </section>

        <div className="o-bajo">
          <TallerTarjeta taller={taller} ventana={ventanaDe(periodo)} textoVentana={TEXTO_VENTANA[periodo]} />
          <PorRevisar avisos={avisos} foco={foco} focoSigla={tienda?.sigla ?? null} siglas={siglas} abierta={alerta} onAbrir={abrirAviso} />
        </div>
      </div>
      <Tip manija={tipRef} />
    </ObsCtx.Provider>
  );
}
