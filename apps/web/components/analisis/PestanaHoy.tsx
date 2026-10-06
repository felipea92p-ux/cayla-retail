"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono, TRAZO_PERCHA } from "@/components/analisis/iconos";
import { Ayuda, ChipEstado, COLOR_ESTADO, Cuenta, NombreCorto, nombreLargo, TilePrenda, TipRico, type Estado } from "@/components/analisis/piezas";
import type { PrendaAnalisis, VistaAnalisis } from "@/lib/analisis-tipos";
import { hrefReponerPiso } from "@/lib/analisis-acciones";
import { diasQueQuedan, esTallaUnica, META_SE_VENDE_LO_QUE_LLEGA, plural, PRENDAS_EN_LISTA, vendioDe10 } from "@/lib/analisis-reglas";
import {
  caminosDeHoy,
  carrilesDeCinta,
  cintaFlujo,
  columnasFlujo,
  ejeCinta,
  estadoLlegadas,
  estadoQuieta,
  estadosDelFlujo,
  etiquetaFlujo,
  FLUJO,
  geometriaFlujo,
  listaTip,
  miniMariposa,
  paraReponerPiso,
  partesPorCategoria,
  pastillaFlujo,
  puntosDeCinta,
  px,
  quietasHoy,
  seAcabanHoy,
  SEGUNDOS_PUNTO,
  textoDiasQueQuedan,
  textoPastilla,
  titulosFlujo,
  todosLosCaminos,
  type BandaFlujo,
  type CaminoHoy,
  type CaminosHoy,
} from "@/lib/analisis-hoy";
import { MAX_VARIANTES_EN_URL } from "@/lib/existencias-prendas";

// Análisis v4 (ADR-0357): la pestaña «Hoy», como la maqueta aprobada por Felipe (2026-10-06): cuatro tarjetas que responden una
// pregunta cada una (tocar una lleva a su pestaña; tocar una prenda abre su ficha) y «Qué hacer hoy», el flujo de prendas que entran
// y salen de la tienda, de alto fijo, que bajo 760 px se vuelve una lista. Todo es de la tienda elegida arriba: la comparación de las
// tres tiendas vive en CAYLA Global (decisión 3, act. 2026-10-06). Las cuentas viven en `lib/analisis-hoy.ts`; aquí solo se dibuja.
//
// Lo que filtra el buscador: las prendas (las listas y los caminos). Las cifras de la tienda (lo que se vende por categoría, lo
// que llega) son de toda la tienda.

const ids = (prendas: readonly Pick<PrendaAnalisis, "varianteId">[]): string => prendas.map((p) => p.varianteId).join(" ");

const AYUDA_FLUJO =
  "Lo que se acaba aparece para comprar. Si otra tienda la tiene, verás cuántas están en otra tienda; en la ficha de cada prenda ves cuánto vende cada tienda y decides si pedirla. El número es cuántas prendas son.";

export function PestanaHoy() {
  const { datos, prendas, q, liquidarDesde } = useAnalisis();
  const buscando = q.trim() !== "";
  const acaba = seAcabanHoy(prendas, liquidarDesde);
  const quietas = quietasHoy(prendas, liquidarDesde);
  const vendio = vendioDe10(datos.prendas);
  const partes = partesPorCategoria(datos.prendas);
  const mariposa = miniMariposa(partes);

  return (
    <>
      <div className="instrumentos">
        <Instrumento i={0} vista="acaba" pregunta="¿Qué se acaba?" est={acaba.length ? "urg" : buscando ? null : "bien"}>
          <ListaAcaba prendas={acaba} />
        </Instrumento>
        <Instrumento i={1} vista="nose" pregunta="¿Qué no se mueve?" est={quietas.length ? "ate" : buscando ? null : "bien"}>
          <ListaQuietas prendas={quietas} />
        </Instrumento>
        <Instrumento i={2} vista="pedir" pregunta="¿Se vende lo que llega?" est={estadoLlegadas(vendio)}>
          <div className="i-vis">
            <Perchas n={vendio} meta={META_SE_VENDE_LO_QUE_LLEGA} />
          </div>
          {vendio === null ? (
            <div className="i-num">
              <b className="palabras">Sin llegadas</b>
              <span>en 30 días</span>
            </div>
          ) : (
            <div className="i-num">
              <b>
                <Cuenta valor={vendio} /> de 10
              </b>
              <span>
                de lo que llegó
                <br />
                en 30 días
              </span>
            </div>
          )}
        </Instrumento>
        <Instrumento i={3} vista="pedir" pregunta="¿Qué pedir?" est="info">
          <div className="i-vis">{mariposa.filas.length > 0 && <MiniMariposa filas={mariposa.filas} max={mariposa.max} />}</div>
          <div className="i-num">
            {partes.length === 0 ? (
              <>
                <b className="palabras">Sin ventas</b>
                <span>en 30 días</span>
              </>
            ) : (
              <b className="palabras">
                {mariposa.piden.length === 0 ? (
                  "Todo parejo"
                ) : mariposa.piden.length === 1 ? (
                  mariposa.piden[0]
                ) : (
                  <>
                    {mariposa.piden[0]} y<br />
                    {mariposa.piden[1]}
                  </>
                )}
              </b>
            )}
          </div>
        </Instrumento>
      </div>
      <QueHacer />
    </>
  );
}

// ───────────────────────── Las cuatro tarjetas ─────────────────────────

/** Una tarjeta-pregunta: toda la tarjeta lleva a su pestaña (`irA`). Sin estado (`est` null), no lleva insignia. */
function Instrumento({ i, vista, pregunta, est, children }: { i: number; vista: VistaAnalisis; pregunta: string; est: Estado | null; children: ReactNode }) {
  const { irA } = useAnalisis();
  return (
    <article className="tarjeta inst entra" style={{ ["--i" as string]: i }} role="button" tabIndex={0} onClick={() => irA(vista)}>
      <div className="i-top">
        <span className="i-q">{pregunta}</span>
        {est && <ChipEstado est={est} />}
      </div>
      {children}
    </article>
  );
}

/** Una prenda de las listas cortas: abre su ficha y NO la pestaña de la tarjeta (para el clic). */
function FilaCinco({ prenda, children }: { prenda: PrendaAnalisis; children: ReactNode }) {
  const { abrirFicha } = useAnalisis();
  return (
    <div
      className="l5"
      role="button"
      tabIndex={0}
      data-ps={prenda.varianteId}
      data-tip={nombreLargo(prenda)}
      onClick={(e) => {
        e.stopPropagation();
        abrirFicha(prenda.varianteId);
      }}
    >
      <TilePrenda prenda={prenda} tamano={26} />
      <span className="nm">
        <NombreCorto prenda={prenda} />
      </span>
      {children}
    </div>
  );
}

const VerTodas = ({ n }: { n: number }) => (
  <div className="ver5">
    {n === 1 ? "Ver la prenda" : `Ver las ${n} prendas`} <Icono nombre="sigue" />
  </div>
);

/** «¿Qué se acaba?»: las 5 más urgentes con su plazo; con 7 o con 700 mide lo mismo. */
function ListaAcaba({ prendas }: { prendas: PrendaAnalisis[] }) {
  const { q } = useAnalisis();
  if (prendas.length === 0) return <p className="b-nota">{q.trim() ? "Nada con esta búsqueda." : "Nada se está acabando."}</p>;
  return (
    <>
      <div className="lista5">
        {prendas.slice(0, PRENDAS_EN_LISTA).map((p) => {
          const d = textoDiasQueQuedan(diasQueQuedan(p) ?? 0);
          return (
            <FilaCinco key={p.varianteId} prenda={p}>
              <span className="es" style={{ ["--c" as string]: COLOR_ESTADO[d.est] }}>
                <Icono nombre={d.agotada ? "agotado" : "reloj"} />
                {d.texto}
              </span>
            </FilaCinco>
          );
        })}
      </div>
      <VerTodas n={prendas.length} />
    </>
  );
}

/** «¿Qué no se mueve?»: las 5 que más esperan, con sus días (en rojo desde los 3 meses). */
function ListaQuietas({ prendas }: { prendas: PrendaAnalisis[] }) {
  const { q, liquidarDesde } = useAnalisis();
  if (prendas.length === 0) return <p className="b-nota">{q.trim() ? "Nada con esta búsqueda." : `Nada lleva ${liquidarDesde} días sin venderse.`}</p>;
  return (
    <>
      <div className="lista5">
        {prendas.slice(0, PRENDAS_EN_LISTA).map((p) => {
          const dias = p.diasSinVender ?? 0;
          const est = estadoQuieta(dias);
          return (
            <FilaCinco key={p.varianteId} prenda={p}>
              <span className="es dias" style={{ ["--c" as string]: COLOR_ESTADO[est] }}>
                <Icono nombre={est} />
                <b>{dias}</b> días
              </span>
            </FilaCinco>
          );
        })}
      </div>
      <VerTodas n={prendas.length} />
    </>
  );
}

/** «¿Se vende lo que llega?»: 10 perchas, llenas las que se vendieron, y la meta punteada. Sin llegadas, vacías y sin meta. */
function Perchas({ n, meta }: { n: number | null; meta: number }) {
  const llenas = n ?? 0;
  return (
    <div className="perchas" role="img" aria-label={n === null ? "Sin llegadas en 30 días" : `${n} de 10, meta ${meta}`}>
      {Array.from({ length: 10 }, (_, k) => (
        <svg
          key={k}
          className={`${k < llenas ? "si" : "no"} po`}
          style={{ ["--d" as string]: k }}
          viewBox="0 0 24 24"
          fill={k < llenas ? "currentColor" : "none"}
          fillOpacity={0.14}
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {TRAZO_PERCHA}
        </svg>
      ))}
      {n !== null && (
        <span className="meta-m" style={{ left: meta * 22 - 2 }}>
          <span>meta {meta}</span>
        </span>
      )}
    </div>
  );
}

/** «¿Qué pedir?»: la mariposa chica, se vende (izquierda) ↔ tienes (derecha); ▲ la que pide más. */
function MiniMariposa({ filas, max }: { filas: ReturnType<typeof miniMariposa>["filas"]; max: number }) {
  return (
    <div className="mini-mar">
      {filas.map((c, k) => (
        <div key={c.categoria} className="mm" data-tip={`${c.categoria}: ${c.vende} de cada 100 ventas · ${c.tiene} de cada 100 prendas que tienes`}>
          <span className="l">
            <i className="cxd" style={{ ["--d" as string]: k, ["--n" as string]: c.vende / max }} />
          </span>
          <span className={`c ${c.pideMas ? "corto" : ""}`}>
            {c.pideMas ? "▲ " : ""}
            {c.categoria}
          </span>
          <span className="r">
            <i className="cx" style={{ ["--d" as string]: k, ["--n" as string]: c.tiene / max }} />
          </span>
        </div>
      ))}
      <div className="mm" style={{ color: "var(--color-tinta-60)" }}>
        <span style={{ textAlign: "right" }}>se vende</span>
        <span />
        <span>tienes</span>
      </div>
    </div>
  );
}

// ───────────────────────── Qué hacer hoy ─────────────────────────

/** El tooltip de un camino: su verbo y cuántas, y una línea por prenda con su color (las primeras 8; el resto, contado). */
function ListaTip({ titulo, prendas }: { titulo: string; prendas: readonly PrendaAnalisis[] }) {
  const { mostradas, resto } = listaTip(prendas);
  return (
    <>
      <b>{titulo}</b>
      <span className="tl">
        {mostradas.map((p) => (
          <span key={p.varianteId}>
            <i style={{ ["--prenda" as string]: p.colorHex ?? "var(--color-grafico-neutro)" }} data-color-dato />
            {[p.nombre, p.color, esTallaUnica(p.talla) ? null : p.talla].filter(Boolean).join(" · ")}
          </span>
        ))}
        {resto > 0 && <span>y {resto} más</span>}
      </span>
    </>
  );
}

const tituloTip = (c: CaminoHoy): string => `${c.verbo} · ${c.prendas.length} ${plural(c.prendas.length, "prenda", "prendas")}`;

/**
 * El tooltip dentro de una pieza del dibujo (una cinta, una pastilla). En SVG un `<span>` no puede ir suelto (el navegador lo saca
 * del dibujo al leer la página): va en un `foreignObject` oculto, con la misma clase que `TipRico`, y el tooltip de la pantalla lo
 * copia igual.
 */
function TipSvg({ children }: { children: ReactNode }) {
  return (
    <foreignObject className="tip-rico" width={0} height={0} display="none">
      {children}
    </foreignObject>
  );
}

type AlIr = (camino: CaminoHoy, el: Element) => void;

/** Enter o espacio sobre una pieza del dibujo que se toca como botón (un `<g>` no tiene `click()`: no sirve el de la pantalla). */
const teclaSvg = (accion: (el: Element) => void) => (e: KeyboardEvent<SVGGElement>) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  accion(e.currentTarget);
};

function QueHacer() {
  const { prendas, q, liquidarDesde, irA, datos } = useAnalisis();
  const caminos = caminosDeHoy(prendas, liquidarDesde, datos.sedes);
  const hay = todosLosCaminos(caminos).length > 0;
  const buscando = q.trim() !== "";
  const reponer = paraReponerPiso(prendas);

  // Tocar un camino lleva a su grupo en el carril. Antes, suelta el resaltado y el tooltip: la pieza tocada desaparece al cambiar
  // de pestaña y ya no avisaría que el mouse salió de ella.
  const alIr: AlIr = (camino, el) => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    irA(camino.vista, { foco: camino.grupo });
  };

  return (
    <section className="tarjeta bloque entra" style={{ ["--i" as string]: 5 }} aria-label="Qué hacer hoy">
      <div className="b-cab">
        <h3 className="b-tit">Qué hacer hoy</h3>
        {hay ? (
          <span className="b-nota">
            {estadosDelFlujo(caminos).map((e) => (
              <ChipEstado key={e} est={e} />
            ))}
            <span className="sep-v" />
            Toca un camino para ver sus prendas
            <Ayuda texto={AYUDA_FLUJO} />
          </span>
        ) : (
          !buscando && (
            <span className="b-nota">
              <ChipEstado est="bien" />
            </span>
          )
        )}
      </div>
      {hay ? (
        <div className="fl-env">
          <FlujoSvg caminos={caminos} alIr={alIr} />
          <FlujoLista caminos={caminos} alIr={alIr} />
        </div>
      ) : (
        <p className={`hoy-nada${buscando ? "" : " bien"}`}>
          <Icono nombre={buscando ? "lupa" : "check"} />
          {buscando ? "Nada urgente con esta búsqueda." : reponer.length ? "Nada que comprar, mandar ni liquidar." : "Hoy no hay nada urgente."}
        </p>
      )}
      <ReponerPiso lista={reponer} />
    </section>
  );
}

/** El flujo: a la izquierda lo que llega (Compra), al centro tu tienda, a la derecha lo que sale (Manda) o se rebaja (Liquidar). */
function FlujoSvg({ caminos, alIr }: { caminos: CaminosHoy; alIr: AlIr }) {
  const { datos } = useAnalisis();
  const { izq, der } = columnasFlujo(caminos);
  const g = geometriaFlujo(izq, der);
  const titulos = titulosFlujo(caminos);
  const { W, H, LX, NW, CX0, CX1, RX } = FLUJO;
  const medio = (CX0 + CX1) / 2;
  const encima = useCaminoEncima();
  const activoIzq = g.izq.find((b) => b.camino.clave === encima.clave);
  const activoDer = g.der.find((b) => b.camino.clave === encima.clave);
  return (
    <svg className="fl-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Qué hacer hoy: qué prendas te llegan y cuáles salen de tu tienda">
      {titulos.izq && (
        <text className="fl-cab" x={LX + NW} y={14} textAnchor="end">
          {titulos.izq}
        </text>
      )}
      {titulos.der && (
        <text className="fl-cab" x={RX} y={14}>
          {titulos.der}
        </text>
      )}
      {g.franjaIzq && <Franja franja={g.franjaIzq} lado="izq" />}
      {g.franjaDer && <Franja franja={g.franjaDer} lado="der" />}
      {g.izq.map((b, i) => (
        <Cinta key={b.camino.clave} banda={b} i={i} lado="izq" alIr={alIr} encima={encima} />
      ))}
      {g.der.map((b, i) => (
        <Cinta key={b.camino.clave} banda={b} i={i} lado="der" alIr={alIr} encima={encima} />
      ))}
      {/* Los puntos van entre las cintas y los nodos: entran a «Tu tienda» por debajo y salen de ella. */}
      {activoIzq && <PuntosCinta key={`pt-${activoIzq.camino.clave}`} banda={activoIzq} lado="izq" />}
      {activoDer && <PuntosCinta key={`pt-${activoDer.camino.clave}`} banda={activoDer} lado="der" />}
      {[...g.izq.map((b) => ({ b, x: LX })), ...g.der.map((b) => ({ b, x: RX }))].map(({ b, x }) => (
        <rect key={`nodo-${b.camino.clave}`} x={x} y={px(b.y0)} width={NW} height={px(b.y1 - b.y0)} rx={3} fill={COLOR_ESTADO[b.camino.est]} />
      ))}
      <rect x={CX0} y={px(g.centro.y)} width={CX1 - CX0} height={px(g.centro.alto)} rx={14} fill="var(--color-tinta)" />
      <text className="fl-centro" x={medio} y={px(g.centro.y + g.centro.alto / 2 + 2)} textAnchor="middle" style={{ fill: "var(--color-crema)" }}>
        Tu tienda
      </text>
      <text className="fl-sub" x={medio} y={px(g.centro.y + g.centro.alto / 2 + 20)} textAnchor="middle" style={{ fill: "var(--color-crema)" }}>
        {datos.sede.ciudad}
      </text>
      {g.izq.map((b) => (
        <Pastilla key={`p-${b.camino.clave}`} banda={b} lado="izq" alIr={alIr} encima={encima} />
      ))}
      {g.der.map((b) => (
        <Pastilla key={`p-${b.camino.clave}`} banda={b} lado="der" alIr={alIr} encima={encima} />
      ))}
      {g.izq.map((b) => (
        <Etiqueta key={`e-${b.camino.clave}`} banda={b} lado="izq" alIr={alIr} encima={encima} />
      ))}
      {g.der.map((b) => (
        <Etiqueta key={`e-${b.camino.clave}`} banda={b} lado="der" alIr={alIr} encima={encima} />
      ))}
    </svg>
  );
}

/** Qué camino tiene el mouse o el foco encima, y cómo se avisa. */
type CaminoEncima = { clave: string | null; entra: (clave: string) => void; sale: () => void };

/**
 * El camino que tiene el mouse (o el foco) encima. Salir espera un momento antes de soltarlo: al pasar de la cinta a su pastilla o a
 * su etiqueta (que están encima de la cinta) llega un «sale» y enseguida un «entra», y los puntos no deben reiniciarse.
 */
function useCaminoEncima(): CaminoEncima {
  const [clave, setClave] = useState<string | null>(null);
  const espera = useRef<number | null>(null);
  useEffect(() => () => {
    if (espera.current !== null) window.clearTimeout(espera.current);
  }, []);
  const entra = (c: string) => {
    if (espera.current !== null) window.clearTimeout(espera.current);
    espera.current = null;
    setClave(c);
  };
  const sale = () => {
    if (espera.current !== null) window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => setClave(null), 90);
  };
  return { clave, entra, sale };
}

const MOVIMIENTO_REDUCIDO = "(prefers-reduced-motion: reduce)";
const suscribirMovimiento = (avisar: () => void) => {
  const m = window.matchMedia(MOVIMIENTO_REDUCIDO);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
};
/** Si la persona pidió «reducir movimiento» (en el servidor, no se sabe: sin puntos). */
const useMovimientoReducido = (): boolean =>
  useSyncExternalStore(suscribirMovimiento, () => window.matchMedia(MOVIMIENTO_REDUCIDO).matches, () => true);

/**
 * Los puntos que corren por la cinta del camino que está bajo el mouse (Felipe, 2026-10-06): de la Compra hacia tu tienda, y de tu
 * tienda hacia la otra tienda o hacia «Liquidar», para que se lea hacia dónde van las prendas. Corren SOLO mientras el mouse o el foco
 * está encima (es la única pieza de Análisis que se repite; excepción escrita en ADR-0136, act. 2026-10-06 (b)) y con «reducir
 * movimiento» no se dibujan. Van espaciados por igual: cada uno arranca un tramo después del anterior.
 */
function PuntosCinta({ banda: b, lado }: { banda: BandaFlujo<CaminoHoy>; lado: "izq" | "der" }) {
  const reducido = useMovimientoReducido();
  if (reducido) return null;
  const { LX, NW, CX0, CX1, RX } = FLUJO;
  const { n, r } = puntosDeCinta(b.y1 - b.y0);
  const carriles = carrilesDeCinta(b.y1 - b.y0, r);
  const eje = (d: number) => (lado === "izq" ? ejeCinta(LX + NW, b.y0, b.y1, CX0, b.c0, b.c1, d) : ejeCinta(CX1, b.c0, b.c1, RX, b.y0, b.y1, d));
  const color = COLOR_ESTADO[b.camino.est];
  return (
    <g className="fl-puntos" aria-hidden pointerEvents="none">
      {Array.from({ length: n }, (_, k) => (
        <circle key={k} r={r} fill={color} stroke="var(--color-papel)" strokeWidth={1}>
          <animateMotion
            dur={`${SEGUNDOS_PUNTO}s`}
            begin={`-${((k * SEGUNDOS_PUNTO) / n).toFixed(2)}s`}
            repeatCount="indefinite"
            path={eje(carriles[k % carriles.length]!)}
          />
        </circle>
      ))}
    </g>
  );
}

/** El fondo de «Se quedan en tu tienda», de su título al último camino de la columna. */
function Franja({ franja, lado }: { franja: { texto: string; y: number; alto: number }; lado: "izq" | "der" }) {
  const { W, LX, NW, RX } = FLUJO;
  return (
    <>
      <rect
        x={lado === "izq" ? 0 : RX - 14}
        y={px(franja.y)}
        width={lado === "izq" ? LX + NW + 14 : W - RX + 14}
        height={px(franja.alto)}
        rx={10}
        fill="var(--color-hueso)"
        fillOpacity={0.75}
      />
      <text className="fl-cab" x={lado === "izq" ? LX + NW : RX} y={px(franja.y + 18)} textAnchor={lado === "izq" ? "end" : "start"}>
        {franja.texto}
      </text>
    </>
  );
}

/** La cinta de un camino, entre su nodo y tu tienda. Se toca con el mouse; con el teclado, su pastilla y su etiqueta. */
function Cinta({ banda: b, i, lado, alIr, encima }: { banda: BandaFlujo<CaminoHoy>; i: number; lado: "izq" | "der"; alIr: AlIr; encima: CaminoEncima }) {
  const { LX, NW, CX0, CX1, RX } = FLUJO;
  const c = b.camino;
  const d = lado === "izq" ? cintaFlujo(LX + NW, b.y0, b.y1, CX0, b.c0, b.c1) : cintaFlujo(CX1, b.c0, b.c1, RX, b.y0, b.y1);
  return (
    <g onClick={(e) => alIr(c, e.currentTarget)} onMouseEnter={() => encima.entra(c.clave)} onMouseLeave={encima.sale}>
      <path
        className={`fl-cinta${lado === "der" ? " der" : ""}${c.primero ? " primera" : ""}`}
        style={{ ["--d" as string]: i }}
        d={d}
        fill={COLOR_ESTADO[c.est]}
        data-ps={ids(c.prendas)}
      />
      <TipSvg>
        <ListaTip titulo={tituloTip(c)} prendas={c.prendas} />
      </TipSvg>
    </g>
  );
}

/** «5 prendas» junto al nodo; el camino por donde empezar va lleno y dice «empieza aquí». */
function Pastilla({ banda: b, lado, alIr, encima }: { banda: BandaFlujo<CaminoHoy>; lado: "izq" | "der"; alIr: AlIr; encima: CaminoEncima }) {
  const c = b.camino;
  const texto = textoPastilla(c);
  const p = pastillaFlujo(texto, b.cy, lado);
  const ir = (el: Element) => alIr(c, el);
  return (
    <g
      className="fl-past"
      data-ps={ids(c.prendas)}
      role="button"
      tabIndex={0}
      aria-label={`${c.verbo}: ${texto}`}
      onClick={(e) => ir(e.currentTarget)}
      onKeyDown={teclaSvg(ir)}
      onMouseEnter={() => encima.entra(c.clave)}
      onMouseLeave={encima.sale}
      onFocus={() => encima.entra(c.clave)}
      onBlur={encima.sale}
    >
      <rect
        x={p.x}
        y={px(p.y)}
        width={p.w}
        height={p.h}
        rx={10}
        fill={c.primero ? "var(--color-tinta)" : "var(--color-papel)"}
        stroke={COLOR_ESTADO[c.est]}
        strokeWidth={1.2}
      />
      <text className="fl-num" x={px(p.x + p.w / 2)} y={px(p.y + 14)} textAnchor="middle" style={{ fill: c.primero ? "var(--color-crema)" : "var(--color-tinta)" }}>
        {texto}
      </text>
      <TipSvg>
        <ListaTip titulo={tituloTip(c)} prendas={c.prendas} />
      </TipSvg>
    </g>
  );
}

/**
 * El verbo del camino, sus tres primeras prendas (y «+N») y por qué. Vive en un `foreignObject`: nada de adentro debe crear su propia
 * capa (position, overflow que no es visible, transform, opacity), porque Safari la pinta fuera de lugar (ver `analisis-hoy.css`).
 */
function Etiqueta({ banda: b, lado, alIr, encima }: { banda: BandaFlujo<CaminoHoy>; lado: "izq" | "der"; alIr: AlIr; encima: CaminoEncima }) {
  const c = b.camino;
  const e = etiquetaFlujo(b.cy, lado);
  return (
    <foreignObject x={e.x} y={px(e.y)} width={e.w} height={e.h}>
      <div
        className={`fl-et ${lado}`}
        data-ps={ids(c.prendas)}
        role="button"
        tabIndex={0}
        onClick={(ev) => alIr(c, ev.currentTarget)}
        onMouseEnter={() => encima.entra(c.clave)}
        onMouseLeave={encima.sale}
        onFocus={() => encima.entra(c.clave)}
        onBlur={encima.sale}
      >
        <span className="fl-l1">
          <span className="est" style={{ color: COLOR_ESTADO[c.est] }}>
            <Icono nombre={c.est} />
          </span>
          <b>{c.verbo}</b>
          {c.prendas.slice(0, 3).map((p) => (
            <TilePrenda key={p.varianteId} prenda={p} tamano={17} />
          ))}
          {c.prendas.length > 3 && <span className="mas3">+{c.prendas.length - 3}</span>}
        </span>
        <span className="fl-l2">{c.motivo}</span>
        <TipRico>
          <ListaTip titulo={tituloTip(c)} prendas={c.prendas} />
        </TipRico>
      </div>
    </foreignObject>
  );
}

/** Bajo 760 px de ancho el flujo no cabe: los mismos caminos, en lista. */
function FlujoLista({ caminos, alIr }: { caminos: CaminosHoy; alIr: AlIr }) {
  const llegan = caminos.compra ? [caminos.compra] : [];
  const salen = [...caminos.manda, ...caminos.reb];
  return (
    <div className="fl-lista">
      {llegan.length > 0 && (
        <>
          <span className="fl-gr">Llegan a tu tienda</span>
          {llegan.map((c) => (
            <FilaCamino key={c.clave} camino={c} alIr={alIr} />
          ))}
        </>
      )}
      {salen.length > 0 && (
        <>
          <span className="fl-gr">Salen o se rebajan</span>
          {salen.map((c) => (
            <FilaCamino key={c.clave} camino={c} alIr={alIr} />
          ))}
        </>
      )}
    </div>
  );
}

function FilaCamino({ camino: c, alIr }: { camino: CaminoHoy; alIr: AlIr }) {
  return (
    <button type="button" className="fl-item" data-ps={ids(c.prendas)} onClick={(e) => alIr(c, e.currentTarget)}>
      <span className="est" style={{ color: COLOR_ESTADO[c.est] }}>
        <Icono nombre={c.est} />
      </span>
      <span>
        <b>{c.verbo}</b>
        <small>{c.motivo}</small>
        <span className="pts">
          {c.prendas.slice(0, 6).map((p) => (
            <i key={p.varianteId} style={{ ["--prenda" as string]: p.colorHex ?? "var(--color-grafico-neutro)" }} data-color-dato />
          ))}
        </span>
      </span>
      <span className="pil">
        <b>{c.prendas.length}</b>
      </span>
      <TipRico>
        <ListaTip titulo={tituloTip(c)} prendas={c.prendas} />
      </TipRico>
    </button>
  );
}

/**
 * «Repón el piso»: lo que se vende y no tiene nada colgado, pero sí en el almacén. Lleva a bajarlas (Existencias ▸ Reponer a piso)
 * si la cuenta ve Existencias; si no, solo lo dice. Sin prendas así, no se dibuja.
 */
function ReponerPiso({ lista }: { lista: PrendaAnalisis[] }) {
  const { acceso } = useAnalisis();
  if (lista.length === 0) return null;
  const n = lista.length;
  const href = hrefReponerPiso(lista.slice(0, MAX_VARIANTES_EN_URL), acceso);
  const contenido = (
    <>
      <span className="ic">
        <Icono nombre="piso" />
      </span>
      <b>Repón el piso</b>
      <span>
        {n} {plural(n, "prenda", "prendas")} · hay en tu almacén
      </span>
      {href && (
        <span className="ir">
          Reponer <Icono nombre="sigue" />
        </span>
      )}
      <TipRico>
        <ListaTip titulo={`Repón el piso · ${n} ${plural(n, "prenda", "prendas")}`} prendas={lista} />
      </TipRico>
    </>
  );
  return href ? (
    <Link href={href} className="fl-pie">
      {contenido}
    </Link>
  ) : (
    <div className="fl-pie fija">{contenido}</div>
  );
}
