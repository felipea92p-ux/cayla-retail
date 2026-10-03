"use client";

// El mapa del Observatorio (ADR-0322), con el motor de la maqueta aprobada. Su estado vive fuera de React (`estado`): la
// «caja» que se quiere mostrar y el contorno. El viewBox se calcula en cada cuadro con la proporción real del espacio
// (`ajustar`), así el mapa llena su lado de la tarjeta aunque las columnas se estén reacomodando. Al elegir una tienda, el
// zoom interpola la caja (el ancho en escala logarítmica, para que se sienta parejo) y transforma el contorno del Perú en el
// del departamento, punto por punto; entre dos tiendas se aleja a mitad de camino. Los marcadores se escalan con el zoom
// para conservar su tamaño en pantalla, y las etiquetas (HTML encima) se ubican en % del encuadre.
//
// React dibuja; el cuadro a cuadro lo escribe `aplicar` directo en el DOM (viewBox, contorno, marcadores, etiquetas), sin
// volver a pintar la pantalla 60 veces por segundo.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BORDE_DE_ETIQUETAS,
  CAJA_PAIS,
  CIUDAD_DE_TIENDA,
  TALLER_EN_EL_PAIS,
  TALLER_EN_LIMA,
  ajustar,
  arcoEntre,
  cajaDe,
  cajaIntermedia,
  esEntreTiendas,
  formaDe,
  interpolarForma,
  nombreDeDepartamento,
  poligono,
  posicionDeTienda,
  proyectar,
  trazoDeCuadricula,
  type Caja,
  type FocoMapa,
  type Punto,
  type SiglaConMapa,
} from "@/lib/observatorio-mapa";
import type { RutaObs } from "@/lib/observatorio-reglas";
import { Ic } from "./iconos";
import { Cifra, Odometro, ancho, useArranque, useObs } from "./piezas";

export type TiendaEnMapa = {
  id: string;
  sigla: SiglaConMapa;
  total: number;
  pct: number | null;
  abierta: boolean;
  tip: () => ReactNode;
};

export type VentaEnMapa = { id: string; hora: string; sigla: string; monto: string; nueva: boolean };

// La cuadrícula cubre mucho más que el Perú, para que el mapa llene cualquier proporción sin que se vean bordes; la fina
// solo se ve acercada.
const RETICULA = trazoDeCuadricula(2, -104, -50, 16, -36);
const RETICULA_FINA = (() => {
  let d = "";
  for (let lon = -83.5; lon <= -67; lon += 1) d += `M${proyectar(lon, 0)[0].toFixed(1)} ${proyectar(0, 2)[1].toFixed(0)}V${proyectar(0, -20)[1].toFixed(0)}`;
  for (let lat = 1; lat >= -19; lat -= 1) {
    if (lat % 2 === 0) continue;
    d += `M${proyectar(-84, 0)[0].toFixed(0)} ${proyectar(0, lat)[1].toFixed(1)}H${proyectar(-66, 0)[0].toFixed(0)}`;
  }
  return d;
})();
const PERU_ENTERO = poligono(formaDe("TODAS"));
const igual = (a: Caja, b: Caja) => a.every((v, i) => Math.abs(v - b[i]) < 0.01);
const suave = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function Mapa({
  tiendas,
  focoMapa,
  zoom,
  rutas,
  taller,
  ultima,
  ondas,
  onEnfocar,
  onPasar,
}: {
  tiendas: readonly TiendaEnMapa[];
  focoMapa: FocoMapa;
  /** ¿Hay una tienda elegida? (puede no tener lugar en el mapa: entonces se queda el país). */
  zoom: boolean;
  rutas: readonly RutaObs[];
  taller: { texto: string; tip: () => ReactNode } | null;
  ultima: VentaEnMapa | null;
  ondas: readonly { id: string; tienda: string }[];
  onEnfocar: (id: string) => void;
  onPasar: (id: string) => void;
}) {
  const { reducido, rapido, mostrarTip } = useObs();
  const a = useArranque();
  const cajaRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const formaRef = useRef<SVGPathElement>(null);
  const [inicial] = useState(() => {
    const vb = ajustar(cajaDe(focoMapa), 0.9);
    return { vb: vb.map((v) => v.toFixed(2)).join(" "), k: vb[2] / ajustar(CAJA_PAIS, 0.9)[2], d: poligono(formaDe(focoMapa)) };
  });
  const estado = useRef<{ caja: Caja; pts: Punto[]; fin: Caja; id: number; pintada: Punto[] | null } | null>(null);
  if (estado.current === null) estado.current = { caja: cajaDe(focoMapa), pts: formaDe(focoMapa), fin: cajaDe(focoMapa), id: 0, pintada: null };

  const aplicar = useCallback(() => {
    const box = cajaRef.current;
    const sv = svgRef.current;
    const e = estado.current;
    if (!box || !sv || !e) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    const vb = ajustar(e.caja, h / w);
    const k = vb[2] / ajustar(CAJA_PAIS, h / w)[2];
    sv.setAttribute("viewBox", vb.map((v) => v.toFixed(2)).join(" "));
    if (formaRef.current && e.pintada !== e.pts) {
      formaRef.current.setAttribute("d", poligono(e.pts));
      e.pintada = e.pts;
    }
    sv.querySelectorAll<SVGGElement>(".marca").forEach((m) => m.setAttribute("transform", `translate(${m.dataset.x} ${m.dataset.y}) scale(${k.toFixed(4)})`));
    sv.querySelectorAll<SVGCircleElement>(".cometa").forEach((c) => c.setAttribute("r", (3.4 * k).toFixed(2)));
    box.querySelectorAll<HTMLElement>("[data-ux]").forEach((el) => {
      const x = ((Number(el.dataset.ux) - vb[0]) / vb[2]) * 100;
      const y = ((Number(el.dataset.uy) - vb[1]) / vb[3]) * 100;
      if (el.dataset.ancla === "der") {
        el.style.right = `${(100 - x).toFixed(2)}%`;
        el.style.left = "auto";
      } else el.style.left = `${x.toFixed(2)}%`;
      el.style.top = `${y.toFixed(2)}%`;
    });
  }, []);

  // Después de cada pintada (las etiquetas nuevas toman su lugar) y cada vez que cambia el tamaño del espacio.
  useLayoutEffect(() => {
    aplicar();
  });
  useEffect(() => {
    const box = cajaRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => aplicar());
    ro.observe(box);
    return () => ro.disconnect();
  }, [aplicar]);

  // El zoom: de la caja y el contorno de ahora a los del foco nuevo.
  useLayoutEffect(() => {
    const e = estado.current;
    if (!e) return;
    const cN = cajaDe(focoMapa);
    const pN = formaDe(focoMapa);
    if (igual(e.fin, cN)) return;
    if (reducido || rapido) {
      e.id++;
      e.caja = cN;
      e.pts = pN;
      e.fin = cN;
      aplicar();
      return;
    }
    const cP = e.caja;
    const pP = e.pts;
    const id = ++e.id;
    e.fin = cN;
    const alejar = esEntreTiendas(cP, cN);
    const ms = alejar ? 1900 : 1500;
    const t0 = performance.now();
    let cuadro = 0;
    const paso = (t: number) => {
      if (e.id !== id) return;
      const x = Math.min(1, (t - t0) / ms);
      const k = suave(x);
      e.caja = x >= 1 ? cN : cajaIntermedia(cP, cN, k, alejar);
      e.pts = x < 1 ? interpolarForma(pP, pN, k) : pN;
      aplicar();
      if (x < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
    // `reducido` y `rapido` se leen al momento del zoom: no lo disparan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoMapa, aplicar]);

  const sigla = focoMapa === "TODAS" ? null : focoMapa;
  const vmax = Math.max(1, ...tiendas.map((t) => t.total));
  const radio = (t: TiendaEnMapa) => (sigla === t.sigla ? 24 : 8 + 20 * Math.sqrt(t.total / vmax));
  const enMapa = (s: string): s is SiglaConMapa => s === "TRU" || s === "AQP" || s === "LIM";
  const arcos = [...new Map(rutas.filter((r) => enMapa(r.origen) && enMapa(r.destino) && r.origen !== r.destino).map((r) => [`${r.origen}-${r.destino}`, r])).values()];
  const tipDe = (contenido: () => ReactNode) => ({
    "data-tip": "",
    onPointerMove: (ev: { clientX: number; clientY: number }) => mostrarTip(contenido(), ev.clientX, ev.clientY),
  });
  const transformInicial = ([x, y]: Punto) => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${inicial.k.toFixed(4)})`;

  return (
    <div className="o-mapa" ref={cajaRef}>
      <svg ref={svgRef} viewBox={inicial.vb} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Mapa de las tiendas">
        <defs>
          <radialGradient id="o-tierra" cx="55%" cy="40%" r="75%">
            <stop offset="0" style={{ stopColor: "var(--o-tierra)" }} />
            <stop offset="1" style={{ stopColor: "var(--o-tierra2)" }} />
          </radialGradient>
          <filter id="o-halo" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>
        <path className="ret" d={RETICULA} />
        <path className="ret2" d={RETICULA_FINA} />
        <text className="mar" x="70" y="752">
          Océano Pacífico
        </text>
        <path className="forma" ref={formaRef} d={inicial.d} />
        {!zoom &&
          tiendas.map((t) => {
            const [x, y] = posicionDeTienda(t.sigla);
            return <line key={`g${t.id}`} className="guia" x1={BORDE_DE_ETIQUETAS + 6} y1={y} x2={x - radio(t) - 10} y2={y} />;
          })}
        {arcos.map((r) => {
          const d = arcoEntre(posicionDeTienda(r.origen as SiglaConMapa), posicionDeTienda(r.destino as SiglaConMapa));
          // Acercado a una tienda, solo quedan los traslados que la tocan.
          return (
            <g key={`${r.origen}-${r.destino}`} className={`ruta ${sigla && r.origen !== sigla && r.destino !== sigla ? "oculta" : ""}`}>
              <path className={`arco ${r.enCamino ? "" : "prep"}`} d={d} />
              {r.enCamino && <path className="estela" pathLength={1} d={d} />}
              {r.enCamino && !reducido && (
                <circle className="cometa" r={3.4}>
                  <animateMotion dur="3.4s" repeatCount="indefinite" path={d} />
                </circle>
              )}
            </g>
          );
        })}
        {taller && (
          <>
            {/* Acercado a una tienda, el Taller del país se esconde (acercado a Lima se ve en su lugar, el de abajo): en otro
                departamento caería sobre el nombre, sin decir nada. */}
            <g className={`marca ${sigla ? "oculta" : ""}`} data-x={TALLER_EN_EL_PAIS[0].toFixed(1)} data-y={TALLER_EN_EL_PAIS[1].toFixed(1)} transform={transformInicial(TALLER_EN_EL_PAIS)} {...tipDe(taller.tip)}>
              <rect className="taller" x="-6" y="-6" width="12" height="12" rx="2" />
            </g>
            <g className={`marca ${sigla === "LIM" ? "" : "oculta"}`} data-x={TALLER_EN_LIMA[0].toFixed(1)} data-y={TALLER_EN_LIMA[1].toFixed(1)} transform={transformInicial(TALLER_EN_LIMA)} {...tipDe(taller.tip)}>
              <rect className="taller" x="-7" y="-7" width="14" height="14" rx="2.5" />
            </g>
          </>
        )}
        {tiendas.map((t, d) => {
          const p = posicionDeTienda(t.sigla);
          const f = sigla === t.sigla;
          const r = radio(t);
          const radioDe = (v: number, dl: number): CSSProperties => ({ r: a.listo ? `${v.toFixed(1)}px` : "0px", transitionDelay: a.demora(dl) }) as CSSProperties;
          return (
            <g
              key={t.id}
              className={`marca ${zoom && !f ? "otra" : ""}`}
              data-x={p[0].toFixed(1)}
              data-y={p[1].toFixed(1)}
              transform={transformInicial(p)}
              onClick={() => onEnfocar(t.id)}
              onPointerEnter={() => onPasar(t.id)}
              style={{ cursor: "pointer" }}
              {...tipDe(t.tip)}
            >
              <g className="nodo-g" style={{ "--d": d } as CSSProperties}>
                <circle className="glow o-anima" style={radioDe(r * 1.9, 1100 + d * 160)} />
                {t.abierta && <circle className="latido" r={r.toFixed(1)} />}
                <circle className="anf o-anima" style={radioDe(r + 8, 1100 + d * 160)} />
                <circle
                  className={`anr o-anima ${(t.pct ?? 0) >= 100 ? "ok" : ""}`}
                  pathLength={100}
                  style={{ r: `${(r + 8).toFixed(1)}px`, strokeDasharray: a.listo ? `${Math.min(100, t.pct ?? 0).toFixed(1)} 100` : "0 100", transitionDelay: a.demora(1500 + d * 160) } as CSSProperties}
                />
                <circle className={`nodo o-anima ${f ? "f" : ""}`} style={radioDe(r, 1100 + d * 160)} />
                {!reducido && ondas.filter((o) => o.tienda === t.id).map((o) => <circle key={o.id} className="onda" r={r.toFixed(1)} />)}
              </g>
            </g>
          );
        })}
      </svg>

      {zoom ? (
        <>
          {sigla && (
            <div className="o-dep">
              <span>Departamento</span>
              <b>{nombreDeDepartamento(sigla)}</b>
            </div>
          )}
          <button type="button" className="o-volver" onClick={() => onEnfocar("TODAS")}>
            <Ic n="chevL" t="s" /> Toda CAYLA
          </button>
          {sigla && (
            <span className="o-ciudad" data-ux={posicionDeTienda(sigla)[0].toFixed(1)} data-uy={posicionDeTienda(sigla)[1].toFixed(1)}>
              <b>{sigla}</b>
              <span>{CIUDAD_DE_TIENDA[sigla].ciudad}</span>
            </span>
          )}
          {sigla === "LIM" && taller && (
            <span className="o-ciudad o-ciudad-taller" data-ux={TALLER_EN_LIMA[0].toFixed(1)} data-uy={TALLER_EN_LIMA[1].toFixed(1)}>
              <b>Taller</b>
              <span>{taller.texto}</span>
            </span>
          )}
          {sigla && (
            <div className="o-ubic" aria-hidden="true">
              <svg viewBox={CAJA_PAIS.join(" ")}>
                <path className="pe" d={PERU_ENTERO} />
                <path className="dp" d={poligono(formaDe(sigla))} />
              </svg>
            </div>
          )}
        </>
      ) : (
        <>
          {tiendas.map((t, d) => (
            <button
              key={`e${t.id}`}
              type="button"
              className="o-et"
              data-ux={BORDE_DE_ETIQUETAS}
              data-uy={posicionDeTienda(t.sigla)[1].toFixed(1)}
              data-ancla="der"
              style={{ "--d": d } as CSSProperties}
              onClick={() => onEnfocar(t.id)}
              onPointerEnter={() => onPasar(t.id)}
              onFocus={() => onPasar(t.id)}
              {...tipDe(t.tip)}
            >
              <span className="o-lbl">
                {t.sigla}
                <span className="ciu"> · {CIUDAD_DE_TIENDA[t.sigla].ciudad}</span>
              </span>
              <b>
                <Odometro v={t.total} retraso={1300 + d * 160} />
              </b>
              <span className="p">
                <i>
                  <i className="o-anima" style={ancho(a, t.pct ?? 0, 1600 + d * 160)} />
                </i>
                {t.pct === null ? "sin meta" : <Cifra v={t.pct} f="p" retraso={1600 + d * 160} />}
              </span>
            </button>
          ))}
          {taller && (
            <span className="o-et-t" data-ux={(TALLER_EN_EL_PAIS[0] + 14).toFixed(1)} data-uy={TALLER_EN_EL_PAIS[1].toFixed(1)}>
              Taller<b>{taller.texto}</b>
            </span>
          )}
          {ultima && (
            <div className="o-tk">
              <span className="o-punto late" />
              <span key={ultima.id} className={ultima.nueva ? "nuevo" : ""}>
                {ultima.hora} · {ultima.sigla} · <b>+{ultima.monto}</b>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
