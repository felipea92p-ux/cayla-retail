"use client";

import { useId, useState } from "react";

// El gráfico del spike (`barras()` de marco.js) con su recuadro al pasar el mouse O al llegar con el teclado (Tab): una
// serie en tinta; el rojo marca SOLO la semana bajo el mínimo y siempre con su texto («bajo el mínimo»), nunca el color
// solo. SVG sin librerías. Las medidas y las clases `fin-grafico-*` son las de `BarrasFin` (kit, F5), para que los dos
// gráficos de Reportes se vean iguales; este suma el recuadro, que necesita estado (por eso es cliente).

export type BarraSemana = {
  nombre: string;
  valor: number;
  mala?: boolean;
  malaTexto?: string;
  /** El recuadro: un título en negrita y sus líneas. También es lo que lee un lector de pantalla. */
  titulo: string;
  lineas: string[];
};

export function GraficoSemanas({
  barras,
  alto = 190,
  ancho = 640,
  umbral,
  umbralTexto,
  etiqueta,
  etiquetaValor,
}: {
  barras: BarraSemana[];
  alto?: number;
  ancho?: number;
  umbral?: number;
  umbralTexto?: string;
  etiqueta: string;
  etiquetaValor: (v: number) => string;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const idTip = useId();
  const W = ancho;
  const pad = { t: 34, r: 12, b: 46, l: 12 };
  const max = Math.max(0, ...barras.map((b) => b.valor), umbral ?? 0);
  const min = Math.min(0, ...barras.map((b) => b.valor));
  const y = (v: number) => pad.t + ((max - v) / (max - min || 1)) * (alto - pad.t - pad.b);
  const bw = barras.length ? (W - pad.l - pad.r) / barras.length : 0;
  const geo = barras.map((b, i) => {
    const x = pad.l + i * bw + bw * 0.2;
    const w = bw * 0.6;
    const y0 = y(0);
    const y1 = y(b.valor);
    const arriba = Math.min(y0, y1);
    const h = Math.max(2, Math.abs(y1 - y0));
    return { x, w, y0, arriba, h };
  });
  const tip = activa !== null ? barras[activa] : null;
  const g = activa !== null ? geo[activa] : null;

  return (
    <div className="fin-grafico">
      <div className="fin-grafico-lienzo" onMouseLeave={() => setActiva(null)}>
        <svg viewBox={`0 0 ${W} ${alto}`} role="group" aria-label={etiqueta}>
          <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="fin-grafico-base" />
          {umbral != null && <line x1={pad.l} x2={W - pad.r} y1={y(umbral)} y2={y(umbral)} className="fin-grafico-umbral" />}
          {barras.map((b, i) => {
            const { x, w, y0, arriba, h } = geo[i]!;
            const rr = Math.min(4, w / 2, h);
            // Extremo del dato redondeado, anclado a la línea base.
            const d =
              b.valor >= 0
                ? `M${x},${y0} V${arriba + rr} q0,-${rr} ${rr},-${rr} h${w - 2 * rr} q${rr},0 ${rr},${rr} V${y0} Z`
                : `M${x},${y0} V${arriba + h - rr} q0,${rr} ${rr},${rr} h${w - 2 * rr} q${rr},0 ${rr},-${rr} V${y0} Z`;
            const ly = b.valor >= 0 ? arriba - 7 : arriba + h + 14;
            const ly2 = b.valor >= 0 ? ly - 14 : ly + 13;
            return (
              <g
                key={`${b.nombre}-${i}`}
                className={`fin-grafico-barra ${b.mala ? "fin-grafico-mala" : ""}`}
                tabIndex={0}
                role="img"
                aria-label={`${b.titulo}. ${b.lineas.join(". ")}${b.mala && b.malaTexto ? `. ${b.malaTexto}` : ""}`}
                aria-describedby={activa === i ? idTip : undefined}
                onMouseEnter={() => setActiva(i)}
                onFocus={() => setActiva(i)}
                onBlur={() => setActiva((a) => (a === i ? null : a))}
              >
                <rect x={pad.l + i * bw} y={pad.t - 10} width={bw} height={alto - pad.t - pad.b + 20} fill="transparent" />
                <path d={d} />
                <text x={x + w / 2} y={ly} textAnchor="middle" className="fin-grafico-valor">
                  {etiquetaValor(b.valor)}
                </text>
                {b.mala && b.malaTexto && (
                  <text x={x + w / 2} y={ly2} textAnchor="middle" className="fin-grafico-valor">
                    {b.malaTexto}
                  </text>
                )}
                <text x={x + w / 2} y={alto - 6} textAnchor="middle" className="fin-grafico-eje">
                  {b.nombre}
                </text>
              </g>
            );
          })}
        </svg>
        {tip && g && (
          <div
            id={idTip}
            role="tooltip"
            className="fin-grafico-tip"
            style={{
              left: `clamp(0px, calc(${((g.x + g.w / 2) / W) * 100}% - 110px), calc(100% - 220px))`,
              // Encima de la barra, sin taparla ni tapar su valor (ni «bajo el mínimo»).
              top: `${((g.arriba - (tip.mala && tip.malaTexto ? 36 : 22)) / alto) * 100}%`,
              transform: "translateY(-100%)",
            }}
          >
            <b>{tip.titulo}</b>
            {tip.lineas.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        )}
      </div>
      {umbral != null && umbralTexto && (
        <p className="fin-grafico-leyenda">
          <i />
          {umbralTexto}
        </p>
      )}
    </div>
  );
}
