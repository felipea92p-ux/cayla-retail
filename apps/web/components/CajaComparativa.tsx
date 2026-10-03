"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useCountUp } from "@/lib/useCountUp";
import {
  curvaAcumulada,
  horaTexto,
  horasComparadas,
  mejorYPeorHora,
  metodosComparados,
  valorEn,
  veredicto,
  type HoraComparada,
  type PagoDelDia,
} from "@/lib/caja-comparativa-reglas";

// Caja compara hoy contra ayer (ADR-0319; maqueta `docs/maquetas/caja-comparativa-2026-10/`, diseño A). Solo dibuja: toda la
// cuenta vive en `lib/caja-comparativa-reglas.ts`. `ahoraMin` (minuto del día en Lima) lo renueva el panel cada minuto, y con
// él se recalcula TODO: el titular, el anillo, el punto del gráfico y la hora en curso. Movimiento (ADR-0136): cada efecto
// responde a algo (cifras que cuentan al cambiar, línea que se revela al abrir, barras que crecen); nada en bucle.

const soles = (n: number) => "S/ " + Math.round(n).toLocaleString("es-PE");
const COLOR_METODO: Record<string, string> = {
  efectivo: "var(--color-metodo-efectivo)",
  yape: "var(--color-metodo-yape)",
  tarjeta: "var(--color-metodo-tarjeta)",
  plin: "var(--color-metodo-plin)",
  transferencia: "var(--color-metodo-transferencia)",
};
const NOMBRE_METODO: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", tarjeta: "Tarjeta", plin: "Plin", transferencia: "Transferencia" };

type Props = { hoy: readonly PagoDelDia[]; ayer: readonly PagoDelDia[]; ahoraMin: number; horaCierreMin: number | null };

function Cuenta({ valor, formato }: { valor: number; formato: (n: number) => string }) {
  return <>{formato(useCountUp(valor))}</>;
}

/** El titular: lo primero que se lee. Contra el día COMPLETO de ayer (sin metas diarias, Felipe 2026-10-02). */
export function VeredictoCaja({ hoy, ayer, ahoraMin }: Omit<Props, "horaCierreMin">) {
  const v = useMemo(() => veredicto(hoy, ayer, ahoraMin), [hoy, ayer, ahoraMin]);
  const pct = Math.min(100, v.pctDelDiaDeAyer);
  const C = 2 * Math.PI * 54;
  // El anillo se llena una vez montado (transición CSS), no se dibuja ya lleno.
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setLleno(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  // Una sola idea, en soles y hablándole a quien vende: cuánto falta para igualar ayer y cómo va a esta hora. Sin dos porcentajes
  // distintos (el del día y el de la hora) que se lean como una contradicción.
  const difHora = v.hoy - v.ayerAEstaHora;
  return (
    <section className="cmp-heroe anim-sube" style={{ "--i": 0 } as CSSProperties} aria-label="Cómo vas contra ayer">
      <div className="min-w-0">
        <p className="cmp-sobre">Hoy contra ayer · a las {horaTexto(ahoraMin)}</p>
        <h2 className="cmp-frase">
          {v.ayerDia === 0 ? (
            <>Ayer no hubo ventas con las que compararte</>
          ) : v.superado ? (
            <>
              Ya <em>superaste</em> lo que vendiste ayer
            </>
          ) : (
            <>
              Te faltan <em><Cuenta valor={v.falta} formato={soles} /></em> para igualar ayer
            </>
          )}
        </h2>
        {v.ayerDia > 0 && (
          <p className="cmp-det">
            Ayer vendiste <b>{soles(v.ayerDia)}</b> en todo el día.
            {v.superado ? (
              <> Hoy ya llevas <b>{soles(v.hoy - v.ayerDia)}</b> más.</>
            ) : v.ayerAEstaHora > 0 ? (
              <>
                {" "}A esta hora ya llevabas <b>{soles(v.ayerAEstaHora)}</b>: hoy vas{" "}
                <b>{Math.abs(Math.round(difHora)) === 0 ? "igual" : `${soles(Math.abs(difHora))} ${difHora > 0 ? "por encima" : "por debajo"}`}</b>.
              </>
            ) : null}
          </p>
        )}
        <p className="cmp-chips">
          <span>Vendido hoy <b><Cuenta valor={v.hoy} formato={soles} /></b></span>
          <span>Ventas <b>{v.ticketsHoy}</b></span>
          <span>Venta promedio <b>{soles(v.ticketPromedio)}</b></span>
        </p>
      </div>
      <div className="cmp-anillo" role="img" aria-label={`Llevas ${soles(v.hoy)} de los ${soles(v.ayerDia)} de ayer`}>
        <svg viewBox="0 0 132 132" aria-hidden>
          <circle cx="66" cy="66" r="54" fill="none" strokeWidth="10" className="cmp-anillo-pista" />
          <circle cx="66" cy="66" r="54" fill="none" strokeWidth="10" className="cmp-anillo-arco" strokeDasharray={C} strokeDashoffset={lleno ? C * (1 - pct / 100) : C} />
        </svg>
        <div className="cmp-anillo-centro">
          <b className="cmp-anillo-monto"><Cuenta valor={v.hoy} formato={soles} /></b>
          <span>de {soles(v.ayerDia)}<br />de ayer</span>
        </div>
      </div>
    </section>
  );
}

/** Clientes y ticket: qué mueve la diferencia. */
export function ClientesYTicket({ hoy, ayer, ahoraMin }: Omit<Props, "horaCierreMin">) {
  const v = useMemo(() => veredicto(hoy, ayer, ahoraMin), [hoy, ayer, ahoraMin]);
  const tpAyer = v.ticketsAyerAEstaHora > 0 ? v.ayerAEstaHora / v.ticketsAyerAEstaHora : 0;
  return (
    <div className="card-cayla anim-sube p-5" style={{ "--i": 2 } as CSSProperties}>
      <p className="text-sm font-bold text-tinta">Ventas hechas</p>
      <p className="text-xs text-tinta/50">Hoy, comparado con ayer a esta misma hora</p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="label-cayla text-[10.5px] text-tinta/50">Número de ventas</p>
          <p className="font-display text-[34px] leading-tight tabular-nums text-tinta"><Cuenta valor={v.ticketsHoy} formato={(n) => String(Math.round(n))} /></p>
          <Delta a={v.ticketsHoy} b={v.ticketsAyerAEstaHora} />
          <p className="mt-1 text-[12.5px] text-tinta/65">ayer a esta hora: {v.ticketsAyerAEstaHora}</p>
        </div>
        <div>
          <p className="label-cayla text-[10.5px] text-tinta/50">Cuánto vale cada venta</p>
          <p className="font-display text-[34px] leading-tight tabular-nums text-tinta"><Cuenta valor={v.ticketPromedio} formato={soles} /></p>
          <Delta a={v.ticketPromedio} b={tpAyer} />
          <p className="mt-1 text-[12.5px] text-tinta/65">ayer a esta hora: {soles(tpAyer)}</p>
        </div>
      </div>
    </div>
  );
}

/** ▲ verde si sube, ▼ ámbar si baja. «Aún no llegas» no es «vas mal»: por eso ámbar y no rojo. */
function Delta({ a, b }: { a: number; b: number }) {
  if (!b) return null;
  const p = ((a - b) / b) * 100;
  const r = Math.round(Math.abs(p));
  if (r < 1) return <span className="cmp-delta cmp-delta-eq">= igual</span>;
  return <span className={`cmp-delta ${p > 0 ? "cmp-delta-sube" : "cmp-delta-baja"}`}>{p > 0 ? "▲" : "▼"} {r} %</span>;
}

/** Venta acumulada del día: hoy (hasta ahora) contra ayer (día completo), con la brecha sombreada y un cursor que lee cada hora. */
export function GraficoAcumulado({ hoy, ayer, ahoraMin, horaCierreMin }: Props) {
  const curva = useMemo(() => curvaAcumulada(hoy, ayer, ahoraMin, horaCierreMin), [hoy, ayer, ahoraMin, horaCierreMin]);
  // El gráfico mide su ancho real: así en el celular el texto y los puntos conservan su tamaño en vez de encogerse con el dibujo.
  const [ancho, setAncho] = useState(640);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(260, Math.min(640, Math.round(el.getBoundingClientRect().width))));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = ancho, H = 240, L = ancho < 420 ? 36 : 44, R = 14, T = 16, B = 26;
  const pasoHoras = ancho < 420 ? 240 : 120;
  const max = Math.max(4000, Math.ceil(Math.max(...curva.hoy.map((p) => p.monto), ...curva.ayer.map((p) => p.monto), 1) / 2000) * 2000);
  const x = (m: number) => L + ((m - curva.desdeMin) / (curva.hastaMin - curva.desdeMin)) * (W - L - R);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const trazo = (pts: { minuto: number; monto: number }[]) => pts.map((q, i) => `${i ? "L" : "M"}${x(q.minuto).toFixed(1)} ${y(q.monto).toFixed(1)}`).join("");
  const ultimo = curva.hoy[curva.hoy.length - 1]!;
  const ayerAhora = valorEn(curva.ayer, ahoraMin);

  // La brecha: entre las dos líneas, verde donde vas arriba y ámbar donde vas abajo.
  const brecha = curva.hoy.slice(1).map((b, i) => {
    const a = curva.hoy[i]!;
    const ra = valorEn(curva.ayer, a.minuto), rb = valorEn(curva.ayer, b.minuto);
    const sube = (a.monto - ra + b.monto - rb) / 2 >= 0;
    return { puntos: `${x(a.minuto)},${y(a.monto)} ${x(b.minuto)},${y(b.monto)} ${x(b.minuto)},${y(rb)} ${x(a.minuto)},${y(ra)}`, sube };
  });

  const [revelado, setRevelado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setRevelado(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  const [cursor, setCursor] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const alMover = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const m = curva.desdeMin + ((px - L) / (W - L - R)) * (curva.hastaMin - curva.desdeMin);
    // El cursor solo recorre lo que ya pasó: llega hasta la hora actual, donde está el punto de hoy.
    setCursor(Math.max(curva.desdeMin, Math.min(ahoraMin, m)));
  };
  const cH = cursor === null ? null : valorEn(curva.hoy, cursor);
  const cA = cursor === null ? null : valorEn(curva.ayer, cursor);

  const horas: number[] = [];
  for (let m = curva.desdeMin; m <= curva.hastaMin; m += pasoHoras) horas.push(m);
  const lineas = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

  return (
    <div className="card-cayla anim-sube p-5" style={{ "--i": 4 } as CSSProperties}>
      <p className="text-sm font-bold text-tinta">Venta acumulada del día</p>
      <p className="text-xs text-tinta/50">Pasa el mouse por la línea: cada hora te dice cuánto ganas o pierdes</p>
      <div ref={caja} className="relative mt-2">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-visible" role="img" aria-label="Venta acumulada por hora, hoy contra ayer" onMouseMove={alMover} onMouseLeave={() => setCursor(null)}>
          <defs>
            <clipPath id="cmp-revelar"><rect x="0" y="0" height={H} width={revelado ? W : 0} className="cmp-revelar" /></clipPath>
          </defs>
          {lineas.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-sand)" />
              <text x={L - 8} y={y(v) + 3} textAnchor="end" className="cmp-eje">{v >= 1000 ? `${(v / 1000).toLocaleString("es-PE")} mil` : v}</text>
            </g>
          ))}
          {horas.map((m) => <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="cmp-eje">{m / 60}h</text>)}
          <g clipPath="url(#cmp-revelar)">
            {brecha.map((b, i) => <polygon key={i} points={b.puntos} fill={b.sube ? "color-mix(in srgb, var(--color-verde) 22%, transparent)" : "color-mix(in srgb, var(--color-grafico-baja) 24%, transparent)"} />)}
            <path d={trazo(curva.ayer)} fill="none" stroke="var(--color-taupe)" strokeWidth="2.5" strokeDasharray="6 5" />
            <path d={trazo(curva.hoy)} fill="none" stroke="var(--color-tinta)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1={x(ahoraMin)} x2={x(ahoraMin)} y1={T} y2={H - B} stroke="var(--color-tinta)" strokeOpacity=".35" strokeDasharray="2 3" />
            <text x={x(ahoraMin) + 5} y={T + 8} className="cmp-eje cmp-eje-ahora">ahora {horaTexto(ahoraMin)}</text>
            <circle cx={x(ultimo.minuto)} cy={y(ultimo.monto)} r="5.5" fill="var(--color-tinta)" stroke="var(--color-papel)" strokeWidth="2" />
            <circle cx={x(ahoraMin)} cy={y(ayerAhora)} r="4.5" fill="var(--color-papel)" stroke="var(--color-taupe)" strokeWidth="2" />
          </g>
          {cursor !== null && cH !== null && cA !== null && (
            <g>
              <line x1={x(cursor)} x2={x(cursor)} y1={T} y2={H - B} stroke="var(--color-tinta)" strokeOpacity=".35" />
              <circle cx={x(cursor)} cy={y(cH)} r="5" fill="var(--color-tinta)" />
              <circle cx={x(cursor)} cy={y(cA)} r="4.5" fill="var(--color-papel)" stroke="var(--color-taupe)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {cursor !== null && cH !== null && cA !== null && (
          <div className="cmp-tip" style={{ left: `${(x(cursor) / W) * 100}%`, top: `${(y(cH) / H) * 100}%` } as CSSProperties}>
            <span className="opacity-65">hasta las {horaTexto(cursor)}</span>
            <span>Hoy <b>{soles(cH)}</b></span>
            <span>Ayer <b>{soles(cA)}</b></span>
            <b className={cH >= cA ? "cmp-tip-sube" : "cmp-tip-baja"}>{cH >= cA ? "▲ +" : "▼ −"}{soles(Math.abs(cH - cA))}</b>
          </div>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta/65">
        <span><i className="cmp-leyenda" style={{ borderColor: "var(--color-tinta)" }} />Hoy, hasta ahora</span>
        <span><i className="cmp-leyenda cmp-leyenda-raya" style={{ borderColor: "var(--color-taupe)" }} />Ayer, día completo</span>
        <span><i className="cmp-cuadro" style={{ background: "color-mix(in srgb, var(--color-verde) 30%, transparent)" }} />hoy vas por encima de ayer</span>
        <span><i className="cmp-cuadro" style={{ background: "color-mix(in srgb, var(--color-grafico-baja) 32%, transparent)" }} />hoy vas por debajo de ayer</span>
      </p>
    </div>
  );
}

/** Cómo te pagaron: la barra es hoy; la marca es lo que vendió ayer en TODO el día con ese medio. */
export function ComoTePagaron({ hoy, ayer }: Pick<Props, "hoy" | "ayer">) {
  const filas = useMemo(() => metodosComparados(hoy, ayer), [hoy, ayer]);
  const mx = Math.max(1, ...filas.map((f) => Math.max(f.hoy, f.ayerDia))) * 1.08;
  const [dentro, setDentro] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDentro(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="card-cayla anim-sube p-5" style={{ "--i": 5 } as CSSProperties}>
      <p className="text-sm font-bold text-tinta">Cómo te pagaron</p>
      <p className="text-xs text-tinta/50">Lo que cobraste hoy por cada medio, y lo que cobraste ayer en todo el día</p>
      {filas.length === 0 ? (
        <p className="mt-4 text-xs text-tinta/50">Sin ventas todavía.</p>
      ) : (
        <div className="mt-2">
          {filas.map((f, i) => (
            <div key={f.metodo} className="cmp-metodo">
              <span className="inline-flex items-center gap-1.5 text-[13px]"><i className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO[f.metodo] ?? "var(--color-taupe)" }} />{NOMBRE_METODO[f.metodo] ?? f.metodo}</span>
              <span className="cmp-pista">
                <span className="cmp-pista-barra" style={{ width: dentro ? `${(f.hoy / mx) * 100}%` : 0, background: COLOR_METODO[f.metodo] ?? "var(--color-taupe)", transitionDelay: `${i * 70}ms` }} />
                <span className="cmp-pista-marca" style={{ left: `${(f.ayerDia / mx) * 100}%` }} title="Dónde terminó ayer este medio" />
              </span>
              <span className="text-right text-[13px] tabular-nums"><b>{soles(f.hoy)}</b><br /><span className="text-[11.5px] text-tinta/60">ayer {soles(f.ayerDia)}</span></span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-tinta/65">La barra de color es hoy. La marca negra es dónde terminó ayer ese medio.</p>
    </div>
  );
}

/** Dónde ganas y dónde pierdes: cada hora de hoy menos la misma hora de ayer. La hora en curso va rayada y se compara por minutos. */
export function DondeGanasYPierdes({ hoy, ayer, ahoraMin }: Omit<Props, "horaCierreMin">) {
  const filas = useMemo(() => horasComparadas(hoy, ayer, ahoraMin), [hoy, ayer, ahoraMin]);
  const { mejor, peor } = mejorYPeorHora(filas);
  const mx = Math.max(1, ...filas.map((f) => Math.abs(f.diferencia)));
  const rotulo = (f: HoraComparada) => (f.enCurso ? `${f.hora}:00–${horaTexto(ahoraMin)}` : `${f.hora}–${f.hora + 1}h`);
  return (
    <div className="card-cayla anim-sube p-5" style={{ "--i": 6 } as CSSProperties}>
      <p className="text-sm font-bold text-tinta">Dónde ganas y dónde pierdes</p>
      <p className="text-xs text-tinta/65">Cada barra es una hora: lo que vendiste hoy en ella, menos lo que vendiste ayer en esa misma hora</p>
      <p className="mt-2 flex flex-wrap gap-x-4 text-xs font-semibold"><span className="text-verde-profundo">▲ Hacia arriba: vendiste más que ayer</span><span className="text-ambar">▼ Hacia abajo: vendiste menos que ayer</span></p>
      <div className="cmp-horas" style={{ gridTemplateColumns: `repeat(${filas.length}, minmax(0, 1fr))` }}>
        <div className="cmp-horas-eje" aria-hidden />
        {filas.map((f, i) => {
          const alto = Math.max(2, Math.round((Math.abs(f.diferencia) / mx) * 62));
          const sube = f.diferencia >= 0;
          return (
            <div key={f.hora} className="cmp-hora" title={`${rotulo(f)} · hoy ${soles(f.hoy)} · ayer ${soles(f.ayer)}`}>
              <div className="cmp-hora-mitad">
                {sube && <><span className="cmp-hora-val text-verde-profundo">+{Math.round(f.diferencia)}</span><span className={`cmp-barra cmp-barra-sube ${f.enCurso ? "cmp-barra-parcial" : ""}`} style={{ height: `${alto}%`, "--j": i } as CSSProperties} /></>}
              </div>
              <div className="cmp-hora-mitad cmp-hora-baja">
                {!sube && <><span className={`cmp-barra cmp-barra-baja ${f.enCurso ? "cmp-barra-parcial" : ""}`} style={{ height: `${alto}%`, "--j": i } as CSSProperties} /><span className="cmp-hora-val text-ambar">−{Math.round(-f.diferencia)}</span></>}
              </div>
              <span className="cmp-hora-rotulo">{rotulo(f)}{f.enCurso && <><br /><b className="text-taupe-profundo">en curso</b></>}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-tinta/65"><b>La barra rayada es la hora que aún no termina:</b> se compara solo hasta los mismos minutos de ayer.</p>
      <p className="mt-3 rounded-xl bg-hueso px-3.5 py-3 text-[13.5px] text-tinta">
        {mejor ? <>Tu mejor hora fue la de las <b>{mejor.hora}:00</b> (+{soles(mejor.diferencia)}). </> : <>Todavía no superas a ayer en ninguna hora. </>}
        {peor ? <>La más floja, las <b>{peor.hora}:00</b> (−{soles(-peor.diferencia)}).</> : <>No has cedido terreno en ninguna hora.</>}
      </p>
    </div>
  );
}

/** El tramo de comparativa de la pantalla de Caja: titular, referencia, clientes y ticket, gráfico, medios de pago y horas. */
export function ComparativaCaja({ hoy, ayer, ahoraMin, horaCierreMin, cajon, movimientos }: Props & { cajon: React.ReactNode; movimientos: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <VeredictoCaja hoy={hoy} ayer={ayer} ahoraMin={ahoraMin} />
      <div className="grid gap-3 @[900px]:grid-cols-2">
        {cajon}
        <ClientesYTicket hoy={hoy} ayer={ayer} ahoraMin={ahoraMin} />
      </div>
      <div className="grid gap-3 @[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <GraficoAcumulado hoy={hoy} ayer={ayer} ahoraMin={ahoraMin} horaCierreMin={horaCierreMin} />
        <ComoTePagaron hoy={hoy} ayer={ayer} />
      </div>
      <div className="grid gap-3 @[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <DondeGanasYPierdes hoy={hoy} ayer={ayer} ahoraMin={ahoraMin} />
        {movimientos}
      </div>
    </div>
  );
}
