"use client";

import { useEffect, useRef, useState } from "react";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { acumulado, avance, type DiaGrafico } from "@/lib/rendimiento-meta-reglas";

/* ====================================================================
   «Ventas contra la meta» (ADR-0286, spike docs/maquetas/rendimiento-meta-2026-09/)

   Semana | Mes; el mes se ve Acumulado (¿llego o no llego?) o Por día. Lo dibujan la líder (la tienda) y, más
   adelante, la integrante (solo lo suyo): por eso todo el texto llega por props.

   DOS DECISIONES DE FELIPE (2026-09-29) QUE ESTE ARCHIVO CUMPLE:
   · El gráfico NO crece con la pantalla: altura fija (200 px en computadora, 176 en celular) y ancho medido de su
     caja. En una pantalla grande las barras siguen delgadas y el texto no se agranda; solo gana aire.
   · Cambiar Semana | Mes no mueve la página: es estado local, no navegación.

   Sin meta cargada se dibujan solo las ventas y el encabezado lo dice: nunca una marca de meta en cero.
   ==================================================================== */

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

const ALTO_PC = 200;
const ALTO_CELULAR = 176;

/** El tope «redondo» del eje: 1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 o 10 por una potencia de diez. */
function tope(mx: number): number {
  const mag = 10 ** Math.floor(Math.log10(Math.max(mx, 1)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * mag).find((t) => t >= mx) ?? mx;
}

function useAnchoMedido() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(Math.floor(el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

type Etiquetas = {
  /** «Ventas de la sede» / «Tus ventas». */
  ventas: string;
  /** «Meta del día». */
  meta: string;
  /** «Ventas acumuladas». */
  ventasAcum: string;
  /** «Meta acumulada». */
  metaAcum: string;
  /** Lo que dice la primera columna del tooltip y de la tabla: «Ventas». */
  tooltip: string;
  /** «la meta de» → «72 % de la meta de S/ 30,000». */
  deMeta: string;
  /** Lectura para el lector de pantalla: «Ventas de la sede». */
  aria: string;
};

export function GraficoVentasMeta({
  titulo,
  semana,
  mes,
  inicial,
  etiquetas,
  nota,
}: {
  titulo: string;
  semana: DiaGrafico[];
  mes: DiaGrafico[];
  inicial: "semana" | "mes";
  etiquetas: Etiquetas;
  nota?: string;
}) {
  const [modo, setModo] = useState<"semana" | "mes">(inicial);
  const [sub, setSub] = useState<"acum" | "dia">("acum");
  const [ref, ancho] = useAnchoMedido();
  const [tip, setTip] = useState<{ i: number; x: number } | null>(null);

  const esMes = modo === "mes";
  const dias = esMes ? mes : semana;
  const alto = ancho > 0 && ancho < 520 ? ALTO_CELULAR : ALTO_PC;
  const total = dias.reduce((s, d) => s + (d.valor ?? 0), 0);
  const hayMeta = dias.some((d) => d.meta !== null);
  const meta = hayMeta ? dias.reduce((s, d) => s + (d.meta ?? 0), 0) : null;
  const acum = esMes && sub === "acum";
  const pct = avance(total, meta);

  return (
    <section className="space-y-3" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="label-cayla text-[11px] font-bold text-taupe">{titulo}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentoDeslizante
            etiqueta="Período del gráfico"
            valor={modo}
            onCambio={(k) => {
              setTip(null);
              setModo(k as "semana" | "mes");
            }}
            opciones={[
              { clave: "semana", etiqueta: "Semana" },
              { clave: "mes", etiqueta: "Mes" },
            ]}
          />
          {esMes && (
            <SegmentoDeslizante
              etiqueta="Cómo ver el mes"
              valor={sub}
              onCambio={(k) => {
                setTip(null);
                setSub(k as "acum" | "dia");
              }}
              opciones={[
                { clave: "acum", etiqueta: "Acumulado" },
                { clave: "dia", etiqueta: "Por día" },
              ]}
            />
          )}
        </div>
      </div>

      <div className="card-cayla p-5">
        <p className="text-sm text-tinta">
          <b className="font-display text-xl font-normal tabular-nums">{SOLES.format(total)}</b>{" "}
          <span className="text-taupe">{esMes ? "en el mes" : "en 7 días"}</span>
        </p>
        <p className="mt-0.5 text-xs text-taupe">
          {meta !== null && pct !== null ? `${pct} % de ${etiquetas.deMeta} ${SOLES.format(meta)}` : "Sin meta cargada: solo se ven las ventas"}
        </p>
        {nota && <p className="mt-0.5 text-xs text-taupe">{nota}</p>}

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-taupe" aria-label="Leyenda">
          {acum ? (
            <>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-4 bg-tinta" />
                {etiquetas.ventasAcum}
              </li>
              {hayMeta && (
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-taupe" />
                  {etiquetas.metaAcum}
                </li>
              )}
            </>
          ) : (
            <>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-3 w-2 rounded-t-sm bg-tinta" />
                {etiquetas.ventas}
              </li>
              {hayMeta && (
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-taupe" />
                  {etiquetas.meta}
                </li>
              )}
            </>
          )}
        </ul>

        {/* La caja mide el ancho real; la altura no cambia nunca con la pantalla. */}
        <div ref={ref} className="relative mt-2" style={{ height: alto }}>
          {ancho > 0 &&
            (acum ? (
              <Acumulado dias={mes} W={ancho} H={alto} etiquetas={etiquetas} hayMeta={hayMeta} onTip={setTip} />
            ) : (
              <Barras dias={dias} W={ancho} H={alto} esMes={esMes} etiquetas={etiquetas} onTip={setTip} />
            ))}
          {tip !== null && ancho > 0 && (
            <Tooltip dia={dias[tip.i]} x={tip.x} W={ancho} acumulado={acum ? acumuladoDe(mes, tip.i) : null} etiquetas={etiquetas} />
          )}
        </div>

        <details className="mt-3 text-xs text-taupe">
          <summary className="cursor-pointer select-none underline underline-offset-2 hover:no-underline">Ver como tabla</summary>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="w-full text-left tabular-nums">
              <thead>
                <tr className="text-taupe">
                  <th className="py-1 pr-3 font-normal">Día</th>
                  <th className="py-1 pr-3 text-right font-normal">{etiquetas.tooltip}</th>
                  <th className="py-1 text-right font-normal">Meta</th>
                </tr>
              </thead>
              <tbody>
                {dias.map((d) => (
                  <tr key={d.fecha} className="border-t border-sand text-tinta">
                    <td className="py-1 pr-3">{d.titulo}</td>
                    <td className="py-1 pr-3 text-right">{d.valor === null ? "—" : SOLES.format(d.valor)}</td>
                    <td className="py-1 text-right">{d.meta === null ? "—" : SOLES.format(d.meta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

function acumuladoDe(mes: DiaGrafico[], i: number): { ventas: number | null; meta: number } {
  const a = acumulado(mes);
  return { ventas: a.ventas[i], meta: a.meta[i] };
}

function Tooltip({
  dia,
  x,
  W,
  acumulado: ac,
  etiquetas,
}: {
  dia: DiaGrafico;
  x: number;
  W: number;
  acumulado: { ventas: number | null; meta: number } | null;
  etiquetas: Etiquetas;
}) {
  const ancho = 168;
  const izq = Math.min(Math.max(x - ancho / 2, 0), Math.max(W - ancho, 0));
  const lineas: string[] = [];
  if (ac) {
    lineas.push(`${etiquetas.ventasAcum}: ${ac.ventas === null ? "—" : SOLES.format(ac.ventas)}`);
    lineas.push(ac.meta > 0 ? `${etiquetas.metaAcum}: ${SOLES.format(ac.meta)}${ac.ventas !== null ? ` (${avance(ac.ventas, ac.meta)} %)` : ""}` : "Sin meta cargada");
  } else if (dia.valor === null) {
    lineas.push("Día por venir");
    lineas.push(dia.meta !== null ? `${etiquetas.meta}: ${SOLES.format(dia.meta)}` : "Sin meta cargada");
  } else {
    lineas.push(`${etiquetas.tooltip}: ${SOLES.format(dia.valor)}`);
    lineas.push(dia.meta !== null ? `${etiquetas.meta}: ${SOLES.format(dia.meta)} (${avance(dia.valor, dia.meta)} %)` : "Sin meta cargada");
  }
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-0 z-10 rounded-md bg-tinta px-2.5 py-1.5 text-[11px] leading-snug text-crema"
      style={{ left: izq, width: ancho }}
    >
      <b className="block font-semibold">
        {dia.titulo}
        {dia.hoy ? ", hasta ahora" : ""}
      </b>
      {lineas.map((l) => (
        <span key={l} className="block tabular-nums">
          {l}
        </span>
      ))}
    </div>
  );
}

const IZQ = 44;
const ARR = 20;
const ABAJO = 24;
const DER = 8;

function Ejes({ W, H, max, derecha = DER }: { W: number; H: number; max: number; derecha?: number }) {
  const ih = H - ARR - ABAJO;
  return (
    <>
      {[0, max / 2, max].map((v) => {
        const y = ARR + ih - (v / max) * ih;
        return (
          <g key={v}>
            <line x1={IZQ} x2={W - derecha} y1={y} y2={y} stroke="var(--color-sand)" strokeWidth={1} />
            <text x={IZQ - 6} y={y + 3.5} textAnchor="end" className="fill-taupe text-[10px] tabular-nums">
              {NUM.format(Math.round(v))}
            </text>
          </g>
        );
      })}
    </>
  );
}

function Barras({
  dias,
  W,
  H,
  esMes,
  etiquetas,
  onTip,
}: {
  dias: DiaGrafico[];
  W: number;
  H: number;
  esMes: boolean;
  etiquetas: Etiquetas;
  onTip: (t: { i: number; x: number } | null) => void;
}) {
  const iw = W - IZQ - DER;
  const ih = H - ARR - ABAJO;
  const n = dias.length;
  const slot = iw / n;
  const bw = Math.min(esMes ? 14 : 28, slot * (esMes ? 0.62 : 0.42));
  const max = tope(Math.max(...dias.map((d) => Math.max(d.valor ?? 0, d.meta ?? 0)), 100));
  const Y = (v: number) => ARR + ih - (v / max) * ih;
  const mejor = dias.reduce((b, d, i) => ((d.valor ?? 0) > (dias[b].valor ?? 0) ? i : b), 0);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${etiquetas.aria} ${esMes ? "por día del mes" : "de los últimos siete días"}, contra la meta de cada día`}>
      <Ejes W={W} H={H} max={max} />
      {dias.map((d, i) => {
        const cx = IZQ + slot * i + slot / 2;
        const x = cx - bw / 2;
        const val = d.valor ?? 0;
        const y = Y(val);
        const h = Math.max(0, Y(0) - y);
        const r = Math.min(4, h);
        return (
          <g key={d.fecha}>
            {h > 0 && (
              <path
                d={`M${x},${Y(0)} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${Y(0)} Z`}
                fill="var(--color-tinta)"
                opacity={d.hoy ? 0.62 : 1}
              />
            )}
            {d.meta !== null && (
              <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={Y(d.meta)} y2={Y(d.meta)} stroke="var(--color-taupe)" strokeWidth={2} strokeLinecap="round" />
            )}
            {d.etiqueta && (
              <text x={cx} y={H - 7} textAnchor="middle" className={`text-[10px] ${d.hoy ? "fill-tinta font-bold" : "fill-taupe"}`}>
                {d.etiqueta}
              </text>
            )}
            {val > 0 && (i === mejor || (!esMes && d.hoy)) && (
              <text x={cx} y={Y(Math.max(val, d.meta ?? 0)) - 7} textAnchor="middle" className="fill-tinta text-[10px] font-semibold tabular-nums">
                {NUM.format(Math.round(val))}
              </text>
            )}
            <rect
              x={IZQ + slot * i}
              y={ARR}
              width={slot}
              height={ih}
              fill="transparent"
              onMouseEnter={() => onTip({ i, x: cx })}
              onMouseMove={() => onTip({ i, x: cx })}
              onMouseLeave={() => onTip(null)}
            />
          </g>
        );
      })}
    </svg>
  );
}

function Acumulado({
  dias,
  W,
  H,
  etiquetas,
  hayMeta,
  onTip,
}: {
  dias: DiaGrafico[];
  W: number;
  H: number;
  etiquetas: Etiquetas;
  hayMeta: boolean;
  onTip: (t: { i: number; x: number } | null) => void;
}) {
  const R = 64;
  const iw = W - IZQ - R;
  const ih = H - ARR - ABAJO;
  const n = dias.length;
  const a = acumulado(dias);
  const fin = a.meta[n - 1] ?? 0;
  const vendidas = a.ventas.filter((v): v is number => v !== null);
  const ultimo = vendidas.at(-1) ?? 0;
  const max = tope(Math.max(fin, ultimo, 100));
  const X = (i: number) => IZQ + (n > 1 ? (i / (n - 1)) * iw : 0);
  const Y = (v: number) => ARR + ih - (v / max) * ih;
  const puntosVentas = vendidas.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
  // La cifra final va sobre el punto, salvo que la línea punteada de la meta pase pegada: entonces va debajo, para no pisarla.
  const metaEnEseDia = a.meta[vendidas.length - 1] ?? 0;
  const cercaDeLaMeta = hayMeta && vendidas.length > 0 && Math.abs(Y(metaEnEseDia) - Y(ultimo)) < 24;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${etiquetas.ventasAcum} del mes${hayMeta ? " contra la meta acumulada" : ""}`}>
      <Ejes W={W} H={H} max={max} derecha={R} />
      {dias.map((d, i) =>
        d.etiqueta ? (
          <text key={d.fecha} x={X(i)} y={H - 7} textAnchor="middle" className={`text-[10px] ${d.hoy ? "fill-tinta font-bold" : "fill-taupe"}`}>
            {d.etiqueta}
          </text>
        ) : null,
      )}
      {hayMeta && fin > 0 && (
        <>
          <polyline points={a.meta.map((m, i) => `${X(i)},${Y(m)}`).join(" ")} fill="none" stroke="var(--color-taupe)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
          <circle cx={X(n - 1)} cy={Y(fin)} r={4} fill="var(--color-taupe)" stroke="var(--color-papel)" strokeWidth={2} />
          <text x={X(n - 1) + 8} y={Y(fin) + 3} className="fill-tinta text-[10px] font-semibold tabular-nums">
            {NUM.format(Math.round(fin))}
          </text>
          <text x={X(n - 1) + 8} y={Y(fin) + 15} className="fill-taupe text-[10px]">
            meta
          </text>
        </>
      )}
      {ultimo > 0 ? (
        <>
          <polygon points={`${X(0)},${Y(0)} ${puntosVentas} ${X(vendidas.length - 1)},${Y(0)}`} fill="var(--color-tinta)" opacity={0.07} />
          <polyline points={puntosVentas} fill="none" stroke="var(--color-tinta)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={X(vendidas.length - 1)} cy={Y(ultimo)} r={4.5} fill="var(--color-tinta)" stroke="var(--color-papel)" strokeWidth={2} />
          <text x={X(vendidas.length - 1) - 8} y={Y(ultimo) + (cercaDeLaMeta ? 18 : -10)} textAnchor="end" className="fill-tinta text-[10px] font-semibold tabular-nums">
            {NUM.format(Math.round(ultimo))}
          </text>
        </>
      ) : (
        <text x={IZQ + 10} y={Y(max * 0.85)} className="fill-taupe text-xs">
          Sin ventas todavía este mes
        </text>
      )}
      {dias.map((d, i) => (
        <rect
          key={d.fecha}
          x={X(i) - iw / n / 2}
          y={ARR}
          width={iw / n}
          height={ih}
          fill="transparent"
          onMouseEnter={() => onTip({ i, x: X(i) })}
          onMouseMove={() => onTip({ i, x: X(i) })}
          onMouseLeave={() => onTip(null)}
        />
      ))}
    </svg>
  );
}
