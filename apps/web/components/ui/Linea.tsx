"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/* ====================================================================
   La línea — una sola pieza (ADR-0358, ronda 14, Felipe eligió P1 el 2026-10-15)

   Cómo va algo en el tiempo, casi siempre contra una referencia: lo vendido hoy contra ayer (Caja), el mes contra la meta (Rendimiento),
   lo vendido contra el plan (el plan de campaña), el costo de una prenda compra a compra (la ficha de un proveedor).
   · Lo de hoy en TINTA (2,5 px) con un área suave debajo; la referencia (ayer, la meta, el plan) en TAUPE punteado, siempre igual; lo que
     viene («si sigue así») en tinta suave punteada.
   · Tres rayas de fondo con sus montos (`ejes`) y las marcas de tiempo que pasa la pantalla; el último punto con su `cifra` en serif.
   · Al pasar el mouse, una guía salta al punto más cercano (o recorre cualquier momento, `continuo`) y un globito dice lo que pasa la
     pantalla (`leer`). Lo que está bien o mal (vas arriba o abajo de ayer) lo dice la frase de la pantalla, no el color de la línea.
   · Se dibuja de izquierda a derecha una vez al verse (900 ms), el área aparece detrás y el punto final con su cifra al llegar.
   · `escalones`: el valor se queda quieto hasta el punto siguiente y salta ahí (un costo, que solo cambia cuando llega mercadería). Con
     `marcas`, cada salto lleva su número (①②③) y lo que pasó en dos palabras; el número se toca y lleva a su detalle (la pestaña «Costo»
     del Historial de la prenda, 2026-10-24).
   En una fila de una lista, la mini es `<Sparkline>` (components/ui/Sparkline.tsx). Registro: docs/unificar/grafico.linea.md.
   Nunca una `<polyline>` ni un `<path>` de datos dibujados a mano.
   ==================================================================== */

export type PuntoLinea = { x: number; y: number };

/** Un número sobre la línea que se toca: dice qué pasó en ese punto y lleva a su detalle. */
export type MarcaLinea = {
  x: number;
  y: number;
  n: number;
  /** Lo que pasó, en dos palabras («↑ subió S/ 1.61»): encima del número (debajo si `tono` es «baja»). */
  texto: string;
  /** Sube en ámbar, baja en verde, el resto en taupe: lo que el número le hizo a la línea. */
  tono?: "sube" | "baja" | "neutro";
  /** El número elegido: lleno de tinta. */
  activa?: boolean;
  /** Para el lector de pantalla: «Compra 2, 14 oct: subió S/ 1.61». */
  etiqueta: string;
  onElegir?: () => void;
};

type Props = {
  /** Lo de hoy (lo vendido, el costo): la línea de tinta con su área. Puede llegar solo hasta «ahora». */
  serie: readonly PuntoLinea[];
  /** Ayer, la meta, el plan: taupe punteado. */
  referencia?: readonly PuntoLinea[] | null;
  /** «Si sigue así»: sigue desde el último punto, en tinta suave punteada. */
  proyeccion?: readonly PuntoLinea[] | null;
  /** El tramo de tiempo del eje x. */
  desde: number;
  hasta: number;
  /** El piso y el techo del eje y (de fábrica, de cero al mayor valor, redondeado). */
  minY?: number;
  maxY?: number;
  /** Las marcas de tiempo bajo el gráfico; `fuerte` la de hoy. */
  marcasX?: readonly { x: number; texto: string; fuerte?: boolean }[];
  /** Cómo se escribe un monto del eje («1,2 mil»). */
  formatoY?: (v: number) => string;
  /** Tres rayas de fondo con sus montos (de fábrica, sí). */
  ejes?: boolean;
  /** El área suave debajo de la línea (de fábrica, sí). */
  area?: boolean;
  /** Un punto en cada dato (las compras de un proveedor). */
  puntos?: boolean;
  /** El valor se queda quieto hasta el punto siguiente y salta ahí (un costo). */
  escalones?: boolean;
  /** Números que se tocan sobre la línea. */
  marcas?: readonly MarcaLinea[];
  /** La raya punteada vertical de «ahora», con su texto. */
  ahora?: { x: number; texto: string } | null;
  /** La cifra del último punto, en serif. */
  cifra?: string | null;
  /** La cifra al final de la referencia («15,500 · meta»). */
  cifraReferencia?: { valor: string; texto: string } | null;
  /** El globito al pasar el mouse: qué dice en ese momento. Sin `leer`, no hay guía. */
  leer?: (x: number) => ReactNode;
  /** La guía recorre cualquier momento (de fábrica, salta al punto más cercano). */
  continuo?: boolean;
  /** Hasta dónde llega la guía (de fábrica, `hasta`): en Caja, hasta «ahora». */
  guiaHasta?: number;
  /** Alto del gráfico en px (de fábrica 200). */
  alto?: number;
  /** Lo que le dice al lector de pantalla. */
  etiqueta: string;
  /** Lo que se escribe si la serie está vacía («Sin ventas todavía este mes»). */
  vacio?: string;
  className?: string;
};

/** El tope «redondo» de un eje: 1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 o 10 por una potencia de diez. */
export function topeRedondo(mx: number): number {
  const mag = 10 ** Math.floor(Math.log10(Math.max(mx, 1)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * mag).find((t) => t >= mx) ?? mx;
}

const montoCorto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} mil` : Math.round(v).toLocaleString("es-PE"));

/** El valor de una línea en el momento `x` (interpolado entre sus dos puntos vecinos; con `escalones`, el del último punto que pasó). */
export function valorEnLinea(puntos: readonly PuntoLinea[], x: number, escalones = false): number | null {
  if (puntos.length === 0) return null;
  if (escalones) return [...puntos].reverse().find((p) => p.x <= x)?.y ?? puntos[0]!.y;
  if (x <= puntos[0]!.x) return puntos[0]!.y;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]!, b = puntos[i]!;
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return puntos[puntos.length - 1]!.y;
}

export function Linea({
  serie,
  referencia = null,
  proyeccion = null,
  desde,
  hasta,
  minY = 0,
  maxY,
  marcasX = [],
  formatoY = montoCorto,
  ejes = true,
  area = true,
  puntos = false,
  escalones = false,
  marcas = [],
  ahora = null,
  cifra = null,
  cifraReferencia = null,
  leer,
  continuo = false,
  guiaHasta,
  alto = 200,
  etiqueta,
  vacio,
  className = "",
}: Props) {
  // El gráfico mide su ancho real: el texto y los puntos conservan su tamaño en vez de encogerse con el dibujo.
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.floor(el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [guia, setGuia] = useState<number | null>(null);

  const todos = [...serie, ...(referencia ?? []), ...(proyeccion ?? [])].map((p) => p.y);
  const techo = maxY ?? topeRedondo(Math.max(1, ...todos));
  const W = Math.max(ancho, 1);
  const H = alto;
  const angosto = W < 420;
  const L = ejes ? (angosto ? 36 : 44) : 8;
  const R = cifra || cifraReferencia ? (angosto ? 52 : 64) : 12;
  const T = 16;
  const B = marcasX.length > 0 ? 24 : 8;
  const X = (x: number) => L + (hasta === desde ? 0 : ((x - desde) / (hasta - desde)) * (W - L - R));
  const Y = (v: number) => T + (H - T - B) * (1 - (v - minY) / Math.max(techo - minY, 1e-9));
  const camino = (ps: readonly PuntoLinea[], escalon = false) =>
    ps.map((p, i) => (i === 0 ? `M${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}` : escalon ? `H${X(p.x).toFixed(1)} V${Y(p.y).toFixed(1)}` : `L${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`)).join(" ");
  const ultimo = serie.at(-1) ?? null;
  const finRef = referencia?.at(-1) ?? null;

  function alMover(e: React.PointerEvent<SVGSVGElement>) {
    if (!leer) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const xv = desde + ((px - L) / (W - L - R)) * (hasta - desde);
    const tope = guiaHasta ?? hasta;
    if (continuo) return setGuia(Math.max(desde, Math.min(tope, xv)));
    // Salta al punto más cercano entre los de la serie y los de la referencia (los días que faltan también se leen).
    const xs = [...serie, ...(referencia ?? [])].map((p) => p.x).filter((x) => x <= tope);
    if (xs.length === 0) return;
    setGuia(xs.reduce((m, x) => (Math.abs(x - xv) < Math.abs(m - xv) ? x : m), xs[0]!));
  }

  const gSerie = guia === null || !ultimo || guia > ultimo.x ? null : valorEnLinea(serie, guia, escalones);
  const gRef = guia === null || !referencia ? null : valorEnLinea(referencia, guia);
  const contenido = guia === null || !leer ? null : leer(guia);
  const yGlobo = guia === null ? 0 : Math.min(...[gSerie, gRef].filter((v): v is number => v !== null).map(Y), H);

  return (
    <div ref={caja} className={`linea-cayla relative ${className}`} style={{ height: H }}>
      {ancho > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={etiqueta}
          className="block overflow-visible"
          onPointerMove={alMover}
          onPointerLeave={() => setGuia(null)}
        >
          {ejes &&
            [minY, minY + (techo - minY) / 2, techo].map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="linea-rejilla" />
                <text x={L - 6} y={Y(v) + 3.5} textAnchor="end" className="linea-eje">
                  {formatoY(v)}
                </text>
              </g>
            ))}
          {marcasX.map((m) => (
            <text key={`${m.x}-${m.texto}`} x={X(m.x)} y={H - 6} textAnchor="middle" className={`linea-eje ${m.fuerte ? "linea-eje-fuerte" : ""}`}>
              {m.texto}
            </text>
          ))}
          {ahora && (
            <g>
              <line x1={X(ahora.x)} x2={X(ahora.x)} y1={T} y2={H - B} className="linea-ahora" />
              <text x={X(ahora.x) + 5} y={T + 8} className="linea-eje linea-eje-fuerte">
                {ahora.texto}
              </text>
            </g>
          )}
          {referencia && referencia.length > 1 && <path d={camino(referencia)} className="linea-referencia" />}
          {finRef && cifraReferencia && (
            <g>
              <circle cx={X(finRef.x)} cy={Y(finRef.y)} r={4} className="linea-punto-ref" />
              <text x={X(finRef.x) + 8} y={Y(finRef.y) + 3.5} className="linea-cifra-chica">
                {cifraReferencia.valor}
              </text>
              <text x={X(finRef.x) + 8} y={Y(finRef.y) + 15} className="linea-eje">
                {cifraReferencia.texto}
              </text>
            </g>
          )}
          {proyeccion && proyeccion.length > 1 && <path d={camino(proyeccion)} className="linea-proyeccion" />}
          {serie.length > 0 && ultimo ? (
            <>
              {area && serie.length > 1 && (
                <path d={`${camino(serie, escalones)} L${X(ultimo.x).toFixed(1)},${Y(minY).toFixed(1)} L${X(serie[0]!.x).toFixed(1)},${Y(minY).toFixed(1)} Z`} className="linea-area" />
              )}
              {serie.length > 1 && <path d={camino(serie, escalones)} pathLength={1} className="linea-trazo" />}
              {puntos &&
                serie.map((p, i) => (
                  <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={guia === p.x ? 6.5 : 4.5} className="linea-punto" style={{ "--i": i } as CSSProperties} />
                ))}
              {!puntos && <circle cx={X(ultimo.x)} cy={Y(ultimo.y)} r={4.5} className="linea-punto-fin" />}
              {cifra && (
                <text x={X(ultimo.x) + 9} y={Y(ultimo.y) + 5} className="linea-cifra">
                  {cifra}
                </text>
              )}
              {marcas.map((m, i) => (
                <g
                  key={m.n}
                  role="button"
                  tabIndex={0}
                  aria-label={m.etiqueta}
                  aria-pressed={!!m.activa}
                  className={`linea-marca linea-marca-${m.tono ?? "neutro"} ${m.activa ? "linea-marca-activa" : ""}`}
                  style={{ "--i": i } as CSSProperties}
                  onClick={m.onElegir}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      m.onElegir?.();
                    }
                  }}
                >
                  <circle cx={X(m.x)} cy={Y(m.y)} r={20} className="linea-marca-toque" />
                  <circle cx={X(m.x)} cy={Y(m.y)} r={12} className="linea-marca-fondo" />
                  <text x={X(m.x)} y={Y(m.y) + 4} textAnchor="middle" className="linea-marca-n">
                    {m.n}
                  </text>
                  <text x={X(m.x)} y={m.tono === "baja" ? Y(m.y) + 30 : Y(m.y) - 20} textAnchor="middle" className="linea-marca-texto">
                    {m.texto}
                  </text>
                </g>
              ))}
            </>
          ) : (
            vacio && (
              <text x={L + 10} y={Y(minY + (techo - minY) * 0.85)} className="linea-eje">
                {vacio}
              </text>
            )
          )}
          {guia !== null && (
            <g aria-hidden>
              <line x1={X(guia)} x2={X(guia)} y1={T} y2={H - B} className="linea-guia" />
              {gRef !== null && <circle cx={X(guia)} cy={Y(gRef)} r={4} className="linea-punto-ref" />}
              {gSerie !== null && <circle cx={X(guia)} cy={Y(gSerie)} r={5} className="linea-punto-fin" />}
            </g>
          )}
        </svg>
      )}
      {contenido !== null && guia !== null && (
        <div role="tooltip" className="linea-globo" style={{ left: Math.min(Math.max(X(guia), 90), W - 90), top: yGlobo }}>
          {contenido}
        </div>
      )}
    </div>
  );
}
