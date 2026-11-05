"use client";

// La ventaja (ADR-0322, act. 2026-11-05; Felipe eligió «A · La ventaja»): al apretar «vs», la pestaña Ritmo deja de encimar dos
// curvas que siempre suben y dibuja UNA línea: cuántos soles le lleva esta tienda a la otra en cada momento. Por encima de
// «Parejas» va adelante; por debajo, detrás. Las cuentas y las frases, puras, viven en `observatorio-reglas.ts`.

import { useRef, type CSSProperties, type PointerEvent as EventoPuntero } from "react";
import { indiceCercano, solesConSigno, type NombresVentaja, type Ventaja } from "@/lib/observatorio-reglas";
import { AreaVidrio, Revela, Trazo, fmt, useArranque, useObs } from "./piezas";

/** Lo que dice la ventaja en palabras, en el lugar de la leyenda. */
export function TitularVentaja({ frase }: { frase: { titular: string; detalle: string | null; metas: string | null } }) {
  return (
    <p className="o-vent" aria-live="polite">
      <b>{frase.titular}</b>
      {frase.detalle && ` ${frase.detalle}`}
      {frase.metas && <small>{frase.metas}</small>}
    </p>
  );
}

/** A partir de dónde la cifra del final ya no cabe a la derecha de su punto. */
const CIFRA_A_LA_IZQUIERDA = 0.72;

export function GraficoVentaja({
  v,
  nombres,
  ejes,
  momento,
}: {
  v: Ventaja;
  nombres: NombresVentaja;
  ejes: readonly (readonly [number, string])[];
  /** Cómo se llama el punto `j`: «16 oct», «3:00 p. m.». */
  momento: (j: number) => string;
}) {
  const a = useArranque();
  const { mostrarTip, ocultarTip } = useObs();
  const grafRef = useRef<HTMLDivElement>(null);
  const cruzRef = useRef<HTMLElement>(null);

  const valores = v.serie.map((p) => p[1]);
  const alto = Math.max(0, ...valores);
  const bajo = Math.min(0, ...valores);
  // Aire arriba y abajo: ahí van los nombres de cada lado y la cifra del final.
  const aire = (alto - bajo || 1) * 0.22;
  const Y = (soles: number) => ((alto + aire - soles) / (alto - bajo + 2 * aire)) * 100;
  const pts = v.serie.map(([x, s]) => [x * 100, Y(s)] as const);
  const cero = Y(0);
  const [xFin, sFin] = v.serie[v.serie.length - 1];

  // La cifra va del lado libre de la línea: si la línea viene subiendo, encima; si viene bajando, debajo.
  const antes = valores[Math.max(0, valores.length - 1 - Math.ceil(valores.length * 0.2))];
  const lugarCifra = xFin > CIFRA_A_LA_IZQUIERDA ? (antes <= sFin ? " izq-arriba" : " izq-abajo") : "";
  const punto: CSSProperties = {
    left: a.listo ? `${(xFin * 100).toFixed(2)}%` : "0%",
    top: `${(a.listo ? Y(sFin) : cero).toFixed(2)}%`,
    transitionDelay: a.demora(400),
  };

  const rivalCorto = nombres.rival ?? "las otras";
  const hayVentas = v.estado !== "sin-ventas";
  const hayQuienVaAdelante = v.estado === "adelante" || v.estado === "detras";

  const cruz = (e: EventoPuntero) => {
    const g = grafRef.current;
    if (!g) return;
    const r = g.getBoundingClientRect();
    const j = indiceCercano(v.serie, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
    const [x, s] = v.serie[j];
    if (cruzRef.current) cruzRef.current.style.left = `${x * 100}%`;
    const empatados = Math.round(s) === 0;
    mostrarTip(
      <>
        <div className="cab">{momento(j)}</div>
        <div className="fila f">
          <i />
          {empatados ? (
            <b>Parejas</b>
          ) : (
            <>
              <b>{fmt("s", Math.abs(s))}</b>&nbsp;{s > 0 ? nombres.propia : rivalCorto} adelante
            </>
          )}
        </div>
        <div className="fila d">
          <i />
          {fmt("s", v.propia[j])}&nbsp;{nombres.propia}
        </div>
        <div className="fila d">
          <i />
          {fmt("s", v.rival[j])}&nbsp;{nombres.rival ?? "promedio de las otras"}
        </div>
      </>,
      e.clientX,
      e.clientY
    );
  };

  return (
    <div className="o-graf o-ritmo" ref={grafRef} data-ventaja={v.estado}>
      <Revela key={v.serie.length}>
        <Trazo pts={[[0, cero], [100, cero]]} tipo="l" className="cero" />
        {hayVentas && (
          <>
            <AreaVidrio pts={pts} base={cero} />
            <Trazo pts={pts} tipo="l" className="ln f" />
          </>
        )}
      </Revela>
      {hayVentas && (
        <>
          <span className="o-vent-lado arriba">{nombres.propia} adelante</span>
          <span className="o-vent-lado abajo">{rivalCorto.charAt(0).toUpperCase() + rivalCorto.slice(1)} adelante</span>
        </>
      )}
      {hayQuienVaAdelante && (
        <span className={`o-vent-cero o-anima${sFin > 0 ? " bajo" : ""}`} style={{ top: `${cero.toFixed(2)}%` }}>
          Parejas
        </span>
      )}
      {hayVentas && (
        <>
          <span className="pt o-anima" style={punto} />
          <span className={`pt-l o-anima${lugarCifra}`} style={punto}>
            {solesConSigno(sFin)}
          </span>
          <div className="capa" onPointerMove={cruz} onPointerLeave={ocultarTip} />
          <i className="cruz" ref={cruzRef} />
        </>
      )}
      <div className="eje">
        {ejes.map(([x, t]) => (
          <span key={t} style={{ left: `${x * 100}%` }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
