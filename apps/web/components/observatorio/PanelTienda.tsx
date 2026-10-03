"use client";

// El panel de una tienda (ADR-0322), a la derecha del mapa acercado: su cabecera (caja, turno, ‹ › para pasar de tienda),
// sus cifras y cuatro pestañas — Ritmo (el % de la meta acumulado contra el periodo anterior y, con un toque, contra CAYLA
// u otra tienda; y las horas pico de 4 semanas), Productos (qué categorías pesan y lo que más sale), Equipo (cuánto vendió
// cada integrante) y Stock (lo que se va a agotar, lo que no se mueve y sus traslados) — más los avisos de esa tienda.

import { useRef, type CSSProperties, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import { useFlip } from "@/lib/useFlip";
import {
  ABRE,
  fechaCorta,
  grillaPico,
  hora12,
  sumarDias,
  ventanaDe,
  type AvisoObs,
  type Calculo,
  type DatosTienda,
  type Periodo,
  type RutaObs,
  type TiendaObs,
} from "@/lib/observatorio-reglas";
import { Ic } from "./iconos";
import { Anillo, Cifra, Odometro, Revela, Segmento, Trazo, ancho, fmt, iniciales, useArranque, useObs, type Arranque } from "./piezas";

export type Tab = "ritmo" | "productos" | "equipo" | "stock";
export const TABS: readonly (readonly [Tab, string])[] = [
  ["ritmo", "Ritmo"],
  ["productos", "Productos"],
  ["equipo", "Equipo"],
  ["stock", "Stock"],
];

const i = (n: number) => ({ "--i": n }) as CSSProperties;
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function useTip() {
  const { mostrarTip } = useObs();
  return (contenido: () => ReactNode) => ({
    "data-tip": "",
    onPointerMove: (ev: { clientX: number; clientY: number }) => mostrarTip(contenido(), ev.clientX, ev.clientY),
  });
}

export function Rutas({ rutas }: { rutas: readonly RutaObs[] }) {
  return (
    <>
      {rutas.map((r, n) => (
        <div key={`${r.origen}-${r.destino}-${n}`} className="o-ruta">
          <span>{r.origen}</span>
          <span className={`via ${r.enCamino ? "camino" : "prep"}`}>{r.enCamino && <em />}</span>
          <span>{r.destino}</span>
          <small>{r.texto}</small>
        </div>
      ))}
    </>
  );
}

function NoSePudo({ que, onReintentar }: { que: string; onReintentar: () => void }) {
  return (
    <div className="o-fallo">
      <Ic n="alerta" />
      <b>No se pudo leer {que}</b>
      <span>No mostramos 0.</span>
      <button type="button" onClick={onReintentar}>
        Reintentar <Ic n="flecha" t="s" />
      </button>
    </div>
  );
}

function Esqueleto({ filas = 5 }: { filas?: number }) {
  return (
    <div className="o-esq" aria-hidden="true">
      {Array.from({ length: filas }, (_, n) => (
        <i key={n} />
      ))}
    </div>
  );
}

// ── Ritmo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Ritmo({
  tienda,
  c,
  cmp,
  cmpNombre,
  periodo,
  hoy,
  corte,
  textoVs,
  opcionesComparar,
  comparar,
  onComparar,
  datos,
  onReintentar,
}: {
  tienda: TiendaObs;
  c: Calculo;
  cmp: Calculo | null;
  cmpNombre: string;
  periodo: Periodo;
  hoy: string;
  corte: number;
  textoVs: string;
  opcionesComparar: readonly (readonly [string, string])[];
  comparar: string;
  onComparar: (v: string) => void;
  datos: DatosTienda | null | undefined;
  onReintentar: () => void;
}) {
  const a = useArranque();
  const { mostrarTip, ocultarTip } = useObs();
  const tip = useTip();
  const grafRef = useRef<HTMLDivElement>(null);
  const cruzRef = useRef<HTMLElement>(null);
  const enPct = c.meta !== null;
  const conCmp = cmp && (cmp.meta !== null) === enPct ? cmp : null;
  const mx = Math.max(enPct ? 110 : 1, ...c.curva.map((p) => p[1]), ...c.curvaAnterior.map((p) => p[1]), ...(conCmp ? conCmp.curva.map((p) => p[1]) : [0])) * 1.08;
  const Y = (v: number) => 100 - (v / mx) * 100;
  const valor = (v: number) => (enPct ? fmt("p", v) : fmt("s", v));
  const ultimo = c.curva[c.curva.length - 1];
  const ejes: [number, string][] =
    periodo === "hoy"
      ? [
          [0, "10 a. m."],
          [4 / 11, "2 p. m."],
          [8 / 11, "6 p. m."],
          [1, "9 p. m."],
        ]
      : periodo === "7d"
        ? [
            [0, fechaCorta(sumarDias(hoy, -6))],
            [1, fechaCorta(hoy)],
          ]
        : [
            [0, fechaCorta(sumarDias(hoy, -29))],
            [0.5, fechaCorta(sumarDias(hoy, -14))],
            [1, fechaCorta(hoy)],
          ];
  const pt = (v: [number, number]): CSSProperties => ({
    left: a.listo ? `${(v[0] * 100).toFixed(2)}%` : "0%",
    top: a.listo ? `${Y(v[1]).toFixed(2)}%` : "100%",
    transitionDelay: a.demora(400),
  });

  const cruz = (e: EventoPuntero) => {
    const g = grafRef.current;
    if (!g) return;
    const r = g.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    let j = 0;
    let mejor = 9;
    c.curva.forEach((p, n) => {
      const d = Math.abs(p[0] - x);
      if (d < mejor) {
        mejor = d;
        j = n;
      }
    });
    if (cruzRef.current) cruzRef.current.style.left = `${c.curva[j][0] * 100}%`;
    const cuando = periodo === "hoy" ? hora12(Math.min(ABRE + 60 * j, Math.max(corte, ABRE))) : j === 0 ? "Inicio" : fechaCorta(sumarDias(hoy, j - c.dias));
    const ant = c.curvaAnterior[j] ?? c.curvaAnterior[c.curvaAnterior.length - 1];
    const otro = conCmp ? (conCmp.curva[j] ?? conCmp.curva[conCmp.curva.length - 1]) : null;
    mostrarTip(
      <>
        <div className="cab">{cuando}</div>
        <div className="fila f">
          <i />
          <b>{valor(c.curva[j][1])}</b>&nbsp;{tienda.sigla}
        </div>
        <div className="fila d">
          <i />
          {valor(ant[1])}&nbsp;antes
        </div>
        {otro && (
          <div className="fila d">
            <i />
            {valor(otro[1])}&nbsp;{cmpNombre}
          </div>
        )}
      </>,
      e.clientX,
      e.clientY
    );
  };

  const grilla = datos ? grillaPico(datos.pico) : null;
  const mxPico = grilla ? Math.max(1, ...grilla.flat()) : 1;

  return (
    <>
      <div className="o-cmp">
        <div className="o-ley">
          <span>
            <i />
            {tienda.sigla}
          </span>
          <span>
            <i className="ant" />
            {textoVs.replace("vs ", "")}
          </span>
          {conCmp && (
            <span>
              <i className="cmp" />
              {cmpNombre}
            </span>
          )}
        </div>
        <Segmento valor={comparar} opciones={opcionesComparar} onValor={onComparar} chico etiqueta="Comparar el ritmo" />
      </div>
      <div className="o-graf o-ritmo" ref={grafRef}>
        <Revela key={c.curva.length}>
          {(enPct ? [25, 50, 75] : [mx * 0.25, mx * 0.5, mx * 0.75]).map((v) => (
            <line key={v} className="rej" x1="0" x2="100" y1={Y(v)} y2={Y(v)} />
          ))}
          {enPct && <line className="meta" x1="0" x2="100" y1={Y(100)} y2={Y(100)} />}
          <Trazo pts={c.curvaAnterior.map((p) => [p[0] * 100, Y(p[1])] as const)} tipo="l" className="ln ant" />
          {conCmp && <Trazo key={`cmp-${conCmp.foco}`} pts={conCmp.curva.map((p) => [p[0] * 100, Y(p[1])] as const)} tipo="l" className="ln cmp" />}
          <Trazo pts={c.curva.map((p) => [p[0] * 100, Y(p[1])] as const)} tipo="l" className="ln f" />
        </Revela>
        {enPct && (
          <span className="yl" style={{ top: `${Y(100)}%` }}>
            Meta
          </span>
        )}
        <span className="pt o-anima" style={pt(ultimo)} />
        <span className="pt-l o-anima" style={pt(ultimo)}>
          {valor(ultimo[1])}
        </span>
        <div className="capa" onPointerMove={cruz} onPointerLeave={ocultarTip} />
        <i className="cruz" ref={cruzRef} />
        <div className="eje">
          {ejes.map(([x, t]) => (
            <span key={t} style={{ left: `${x * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="o-tcab o-t-tcab">
        <span className="o-lbl">Horas pico · últimas 4 semanas</span>
      </div>
      {datos === null ? (
        <NoSePudo que="las horas pico" onReintentar={onReintentar} />
      ) : (
        <>
          <div className="o-hm">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, r) => (
              <HmFila key={r} d={d} r={r} fila={grilla ? grilla[r] : Array<number>(11).fill(0)} mx={mxPico} tip={tip} />
            ))}
            <span />
            {Array.from({ length: 11 }, (_, n) => {
              const h = 10 + n;
              return <span key={h}>{h % 2 === 0 ? (h === 12 ? "12" : h > 12 ? h - 12 : h) : ""}</span>;
            })}
          </div>
          <div className="o-hm-ley">
            menos
            <b />
            más
          </div>
        </>
      )}
    </>
  );
}

function HmFila({ d, r, fila, mx, tip }: { d: string; r: number; fila: readonly number[]; mx: number; tip: ReturnType<typeof useTip> }) {
  return (
    <>
      <span>{d}</span>
      {fila.map((v, c) => (
        <i
          key={c}
          style={{ "--p": `${(5 + (v / mx) * 68).toFixed(0)}%`, "--r": r, "--c": c } as CSSProperties}
          {...tip(() => (
            <>
              <b>{fmt("s", v)}</b> en promedio
              <br />
              {DIAS[r]} · {hora12((10 + c) * 60)}
            </>
          ))}
        />
      ))}
    </>
  );
}

// ── Productos ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function Productos({ datos, periodo, cat, onCat }: { datos: DatosTienda; periodo: Periodo; cat: string; onCat: (v: string) => void }) {
  const a = useArranque();
  const ventana = ventanaDe(periodo);
  const cats = [...datos.categorias[ventana]].sort((x, y) => y.s - x.s);
  const total = cats.reduce((s, x) => s + x.s, 0);
  const mxCat = Math.max(...cats.map((x) => x.s), 1);
  const todos = datos.productos[ventana];
  const lista = (cat === "todas" ? todos : todos.filter((p) => p.cat === cat)).slice(0, 5);
  const flip = useFlip(lista.map((p) => `${p.id}-${p.c}`).join(","), 700);
  if (!cats.length) return <p className="o-vacio">Sin ventas en este periodo.</p>;
  return (
    <>
      <div className="o-pills">
        {[["todas", "Todas"] as const, ...cats.map((x) => [x.cat, x.cat] as const)].map(([v, t]) => (
          <button key={v} type="button" className={`o-pill ${cat === v ? "on" : ""}`} onClick={() => onCat(v)}>
            {t}
          </button>
        ))}
      </div>
      <div className={`o-cats ${cat === "todas" ? "todas" : ""}`}>
        {cats.map((x, n) => (
          <button key={x.cat} type="button" className={`o-cat ${cat === x.cat ? "on" : ""}`} onClick={() => onCat(cat === x.cat ? "todas" : x.cat)}>
            <span>{x.cat}</span>
            <span className="pista">
              <i style={ancho(a, (x.s / mxCat) * 100, 200 + n * 80)} />
            </span>
            <b>{fmt("p", total ? (x.s / total) * 100 : 0)}</b>
          </button>
        ))}
      </div>
      <div className="o-tcab">
        <span className="o-lbl">Lo que más sale{cat === "todas" ? "" : ` · ${cat}`}</span>
      </div>
      <div className="o-prods">
        {lista.map((p) => (
          <div key={`${p.id}-${p.c}`} ref={flip(`${p.id}-${p.c}`)} className="o-prod">
            <span className="o-sw">
              {iniciales(p.n)}
              {/* El color de la prenda, tal como está en el catálogo (un dato, no un color del diseño). */}
              {p.hex && <i style={{ background: p.hex }} />}
            </span>
            <div>
              <b>{p.n}</b>
              <small>
                {p.c ? `${p.c} · ` : ""}
                {fmt("s", p.s)}
              </small>
            </div>
            <span className="u">
              <Cifra v={p.u} f="n" />
              <small> u.</small>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Equipo ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Equipo({ datos, periodo, tienda }: { datos: DatosTienda; periodo: Periodo; tienda: TiendaObs }) {
  const a = useArranque();
  const ventana = ventanaDe(periodo);
  const estado = new Map((tienda.turno ?? []).map((p) => [p.id, p.estado]));
  const eq = [...datos.equipo[ventana]];
  // Hoy también cuenta quien está en turno y todavía no vendió.
  if (periodo === "hoy") for (const p of tienda.turno ?? []) if (!eq.some((x) => x.id === p.id)) eq.push({ id: p.id, n: p.nombre, s: 0, t: 0 });
  const mx = Math.max(...eq.map((p) => p.s), 1);
  const flip = useFlip(eq.map((p) => p.id).join(","), 700);
  if (!eq.length) return <p className="o-vacio">{periodo === "hoy" ? "Nadie vendió todavía en esta sede." : "Sin ventas en este periodo."}</p>;
  return (
    <div className="o-eq">
      {eq.map((p, n) => (
        <div key={p.id} ref={flip(p.id)} className="o-eq-f">
          <span className="o-av">{iniciales(p.n)}</span>
          <span className="n">
            {p.n}
            <small>{periodo === "hoy" && estado.has(p.id) ? (estado.get(p.id) === "en_pausa" ? "en pausa" : "en turno") : ""}</small>
          </span>
          <span className="pista">
            <i className="o-anima" style={ancho(a, (p.s / mx) * 100, 200 + n * 110)} />
          </span>
          <span className="v">
            <Cifra v={p.s} />
            <small>
              {p.t} {p.t === 1 ? "ticket" : "tickets"}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Stock ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Stock({ datos }: { datos: DatosTienda }) {
  const a = useArranque();
  return (
    <>
      <div className="o-tcab">
        <span className="o-lbl">Por agotarse · días que alcanza</span>
      </div>
      {datos.agotar === null ? (
        <p className="o-vacio">No se pudo leer el ritmo de venta.</p>
      ) : datos.agotar.length === 0 ? (
        <p className="o-vacio">Nada se agota en las próximas dos semanas.</p>
      ) : (
        <div className="o-stk">
          {datos.agotar.map((x, n) => (
            <div key={`${x.nombre}-${x.variante}`} className="o-stk-f">
              <span>
                <b>{x.nombre}</b>
                <small>
                  {x.variante ? `${x.variante} · ` : ""}quedan {x.unidades}
                </small>
              </span>
              <span className="pista">
                <i className={`o-anima ${x.dias <= 2 ? "urg" : ""}`} style={ancho(a, (x.dias / 14) * 100, 200 + n * 110)} />
              </span>
              <span className="d">
                {x.dias} {x.dias === 1 ? "día" : "días"}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="o-stk-dos">
        <div className="o-quieto">
          <span className="o-lbl">Sin moverse 30 días</span>
          <b>{datos.quietas ? <Cifra v={datos.quietas.unidades} f="n" /> : "—"}</b>
          <small>
            {datos.quietas
              ? `prendas en la tienda · ${datos.quietas.variantes} ${datos.quietas.variantes === 1 ? "variante" : "variantes"}`
              : "no se pudo leer"}
          </small>
        </div>
        <div>
          <span className="o-lbl">Traslados</span>
          <div className="o-rutas arriba">
            {datos.traslados === null ? (
              <p className="o-vacio">No se pudieron leer.</p>
            ) : datos.traslados.length === 0 ? (
              <p className="o-vacio">Ninguno en curso.</p>
            ) : (
              <Rutas rutas={datos.traslados} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── El panel ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export function PanelTienda({
  tienda,
  ciudad,
  calculo: c,
  calculoDe,
  tiendas,
  periodo,
  hoy,
  corte,
  textoVs,
  datos,
  onReintentar,
  avisos,
  tab,
  dirTab,
  onTab,
  comparar,
  onComparar,
  cat,
  onCat,
  onEnfocar,
  onIrAviso,
}: {
  tienda: TiendaObs;
  ciudad: string;
  calculo: Calculo;
  calculoDe: (foco: string) => Calculo;
  tiendas: readonly TiendaObs[];
  periodo: Periodo;
  hoy: string;
  corte: number;
  textoVs: string;
  /** `undefined` = todavía llegando; `null` = no se pudo leer. */
  datos: DatosTienda | null | undefined;
  onReintentar: () => void;
  avisos: readonly AvisoObs[];
  tab: Tab;
  dirTab: "" | "de-der" | "de-izq";
  onTab: (t: Tab) => void;
  comparar: string;
  onComparar: (v: string) => void;
  cat: string;
  onCat: (v: string) => void;
  onEnfocar: (id: string) => void;
  onIrAviso: (clave: string) => void;
}) {
  const a: Arranque = useArranque();
  const n = tiendas.findIndex((t) => t.id === tienda.id);
  const anterior = tiendas[(n - 1 + tiendas.length) % tiendas.length];
  const siguiente = tiendas[(n + 1) % tiendas.length];
  const abierta = tienda.caja !== null && tienda.caja.desde <= corte;
  const cmp = comparar !== "nadie" && comparar !== tienda.id ? calculoDe(comparar) : null;
  const cmpNombre = comparar === "TODAS" ? "CAYLA" : (tiendas.find((t) => t.id === comparar)?.sigla ?? "");
  const opcionesComparar: (readonly [string, string])[] = [
    ["nadie", "Sola"],
    ["TODAS", "vs CAYLA"],
    ...tiendas.filter((t) => t.id !== tienda.id).map((t) => [t.id, `vs ${t.sigla}`] as const),
  ];
  const revisar = avisos.filter((x) => x.nivel !== "ok" && x.porTienda && (x.porTienda[tienda.id] ?? 0) > 0);

  let cuerpo: ReactNode;
  if (tab === "ritmo") {
    cuerpo = (
      <Ritmo
        tienda={tienda}
        c={c}
        cmp={cmp}
        cmpNombre={cmpNombre}
        periodo={periodo}
        hoy={hoy}
        corte={corte}
        textoVs={textoVs}
        opcionesComparar={opcionesComparar}
        comparar={comparar}
        onComparar={onComparar}
        datos={datos}
        onReintentar={onReintentar}
      />
    );
  } else if (datos === undefined) {
    cuerpo = <Esqueleto />;
  } else if (datos === null) {
    cuerpo = <NoSePudo que="el panel de la tienda" onReintentar={onReintentar} />;
  } else if (tab === "productos") {
    cuerpo = <Productos datos={datos} periodo={periodo} cat={cat} onCat={onCat} />;
  } else if (tab === "equipo") {
    cuerpo = <Equipo datos={datos} periodo={periodo} tienda={tienda} />;
  } else {
    cuerpo = <Stock datos={datos} />;
  }

  return (
    <div className="o-pn">
      <div className="o-t-cab" style={i(0)}>
        <div>
          <span className="o-lbl">
            {tienda.sigla} · {ciudad}
          </span>
          <h2>{tienda.nombre}</h2>
          <p>
            <span className={`o-punto ${abierta ? "late" : "no"}`} />
            {abierta && tienda.caja ? `Caja abierta · ${hora12(tienda.caja.desde)}` : "Caja cerrada"}
            {tienda.turno === null ? (
              <span>· no se pudo leer el turno</span>
            ) : (
              <>
                <span className="o-avs">
                  {tienda.turno.slice(0, 4).map((p) => (
                    <span key={p.id} className="o-av" title={p.nombre}>
                      {iniciales(p.nombre)}
                    </span>
                  ))}
                </span>
                {tienda.turno.length} en turno
              </>
            )}
          </p>
        </div>
        {tiendas.length > 1 && (
          <div className="o-t-nav">
            <button type="button" onClick={() => onEnfocar(anterior.id)} aria-label={`Ir a ${anterior.nombre}`} title={anterior.sigla}>
              <Ic n="chevL" t="s" />
            </button>
            <button type="button" onClick={() => onEnfocar(siguiente.id)} aria-label={`Ir a ${siguiente.nombre}`} title={siguiente.sigla}>
              <Ic n="chev" t="s" />
            </button>
            <button type="button" onClick={() => onEnfocar("TODAS")} aria-label="Volver a toda CAYLA">
              <Ic n="x" t="s" />
            </button>
          </div>
        )}
      </div>
      <div className="o-t-kpi" style={i(1)}>
        <span className="big">
          <Odometro key={tienda.id} v={c.total} />
        </span>
        <div className="o-t-an">
          <Anillo pct={c.pct} a={a} r={50} w={8} dl={500} />
          <b>
            {c.pct === null ? "—" : <Cifra v={c.pct} f="p" />}
            <small>{c.pct === null ? "sin meta" : "meta"}</small>
          </b>
        </div>
        <div className="o-t-mini">
          <div>
            Tickets
            <b>
              <Cifra v={c.tickets} f="n" />
            </b>
          </div>
          <div>
            Ticket medio<b>{c.medio ? fmt("s", c.medio) : "—"}</b>
          </div>
          <div>
            {textoVs}
            <b className={c.delta === null ? "" : c.delta >= 0 ? "ok" : "warn"}>{c.delta === null ? "—" : fmt("v", c.delta)}</b>
          </div>
        </div>
      </div>
      <div className="o-t-tabs" style={i(2)}>
        <Segmento valor={tab} opciones={TABS} onValor={onTab} etiqueta="Qué ver de la tienda" />
      </div>
      <div key={`${tienda.id}-${tab}`} className={`o-t-cuerpo nuevo ${dirTab}`} style={i(3)}>
        {cuerpo}
      </div>
      {revisar.length > 0 && (
        <div className="o-t-rev" style={i(4)}>
          <span className="o-lbl">Por revisar en {tienda.sigla}</span>
          {revisar.map((x) => (
            <button key={x.clave} type="button" className={x.nivel} onClick={() => onIrAviso(x.clave)}>
              <Ic n={x.icono} t="s" />
              <b>{x.porTienda?.[tienda.id]}</b> {x.corto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

