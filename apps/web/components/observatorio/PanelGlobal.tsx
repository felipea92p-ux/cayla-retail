"use client";

// El panel de la derecha con toda CAYLA (ADR-0322): «De un vistazo» (tickets, ticket medio y prendas), el ranking de las
// tiendas por % de la meta (se reordena deslizándose) y la diferencia de cada una contra el periodo anterior.

import type { CSSProperties, ReactNode } from "react";
import { useFlip } from "@/lib/useFlip";
import type { Calculo } from "@/lib/observatorio-reglas";
import { Cifra, Spark, ancho, fmt, useArranque, useObs } from "./piezas";

export type FilaRanking = { calculo: Calculo; sigla: string; ciudad: string; tip: () => ReactNode };

const i = (n: number) => ({ "--i": n }) as CSSProperties;

export function PanelGlobal({
  todas,
  ranking,
  orden,
  textoVs,
  onEnfocar,
  onPasar,
}: {
  todas: Calculo;
  /** Las tiendas ya ordenadas por % de la meta. */
  ranking: readonly FilaRanking[];
  /** El orden fijo de las tiendas (el del control de arriba), para las diferencias. */
  orden: readonly string[];
  textoVs: string;
  onEnfocar: (id: string) => void;
  onPasar: (id: string) => void;
}) {
  const a = useArranque();
  const { mostrarTip } = useObs();
  const flip = useFlip(ranking.map((f) => f.calculo.foco).join(","), 700);
  const mx = Math.max(110, ...ranking.map((f) => f.calculo.pct ?? 0));
  const deltas = [...ranking].sort((x, y) => orden.indexOf(x.calculo.foco) - orden.indexOf(y.calculo.foco));
  const mxDelta = Math.max(20, ...deltas.map((f) => Math.abs(f.calculo.delta ?? 0)));
  const tipDe = (contenido: () => ReactNode) => ({
    "data-tip": "",
    onPointerMove: (ev: { clientX: number; clientY: number }) => mostrarTip(contenido(), ev.clientX, ev.clientY),
  });

  return (
    <div className="o-pn global">
      <div style={i(0)}>
        <div className="o-tcab">
          <span className="o-lbl">De un vistazo</span>
        </div>
        <div className="o-kp">
          <div>
            <span className="o-lbl">Tickets</span>
            <b>
              <Cifra v={todas.tickets} f="n" />
            </b>
            <Spark valores={todas.barrasTickets} />
          </div>
          <div>
            <span className="o-lbl">Ticket medio</span>
            <b>{todas.medio ? <Cifra v={todas.medio} /> : "—"}</b>
            <small>{todas.ppt ? `${fmt("d", todas.ppt)} prendas por ticket` : "sin ventas"}</small>
          </div>
          <div>
            <span className="o-lbl">Prendas</span>
            <b>
              <Cifra v={todas.prendas} f="n" />
            </b>
            <Spark valores={todas.barrasPrendas} />
          </div>
        </div>
      </div>
      <div className="o-raya" style={i(1)} />
      <div style={i(2)}>
        <div className="o-tcab">
          <span className="o-lbl">Ranking · % de la meta</span>
          <span className="o-lbl tenue">toca una tienda</span>
        </div>
        <div className="o-rk">
          {ranking.map((f, n) => (
            <button
              key={f.calculo.foco}
              ref={flip(f.calculo.foco)}
              type="button"
              className="o-rk-f"
              onClick={() => onEnfocar(f.calculo.foco)}
              onPointerEnter={() => onPasar(f.calculo.foco)}
              onFocus={() => onPasar(f.calculo.foco)}
              {...tipDe(f.tip)}
            >
              <span className="o-rk-n">{n + 1}</span>
              <span className="o-rk-s">
                {f.sigla}
                <small>{f.ciudad}</small>
              </span>
              <span className="o-rk-b">
                <i className="o-anima" style={ancho(a, ((f.calculo.pct ?? 0) / mx) * 100, 400 + n * 120)} />
                <em style={{ left: `${((100 / mx) * 100).toFixed(1)}%` }} />
              </span>
              <span className="o-rk-v">
                {f.calculo.pct === null ? "—" : <Cifra v={f.calculo.pct} f="p" />}
                <small>{fmt("s", f.calculo.total)}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="o-raya" style={i(3)} />
      <div style={i(4)}>
        <div className="o-tcab">
          <span className="o-lbl">{textoVs}</span>
        </div>
        <div className="o-dl">
          {deltas.map((f, n) => {
            const v = f.calculo.delta ?? 0;
            return (
              <div key={f.calculo.foco} className="o-dl-f" {...tipDe(f.tip)}>
                <span>{f.sigla}</span>
                <span className="eje izq">{v < 0 && <i className="o-anima" style={ancho(a, (-v / mxDelta) * 100, 300 + n * 110)} />}</span>
                <span className="eje der">{v > 0 && <i className="o-anima" style={ancho(a, (v / mxDelta) * 100, 300 + n * 110)} />}</span>
                <span className="v">{f.calculo.delta === null ? "—" : <Cifra v={v} f="v" />}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
