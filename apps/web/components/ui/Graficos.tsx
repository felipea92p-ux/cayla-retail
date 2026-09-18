/* ====================================================================
   Gráficos del tablero de Caja (2026-09-18) — SVG puro, sin librería.

   No hay ninguna librería de charts instalada (ni recharts ni d3) y la
   maqueta de referencia tampoco usa ninguna: son 4 formas simples
   (sparkline, dona, barras, tendencia de 7 días) que no justifican una
   dependencia nueva. Todo es decorativo (`aria-hidden`) — cada gráfico
   vive siempre al lado de texto real (leyenda, tabla, cifra) que dice lo
   mismo sin depender del color, como pide la accesibilidad del rediseño.
   ==================================================================== */

export function Sparkline({ puntos, color }: { puntos: number[]; color: string }) {
  if (puntos.length < 2) return <div className="h-[26px]" aria-hidden />;
  const max = Math.max(...puntos, 0.0001);
  const min = Math.min(...puntos, 0);
  const rango = max - min || 1;
  const paso = 100 / (puntos.length - 1);
  const d = puntos.map((v, i) => `${i === 0 ? "M" : "L"}${(i * paso).toFixed(1)},${(24 - ((v - min) / rango) * 22).toFixed(1)}`).join(" ");

  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="h-[26px] w-full" aria-hidden style={{ color }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type SegmentoDona = { etiqueta: string; valor: number; color: string };

export function DonutChart({ segmentos, total }: { segmentos: SegmentoDona[]; total: number }) {
  const filtrados = segmentos.filter((s) => s.valor > 0);
  const suma = filtrados.reduce((a, s) => a + s.valor, 0);
  const RADIO = 15.9;
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

  let acumulado = 0;
  return (
    <svg width="140" height="140" viewBox="0 0 42 42" className="shrink-0" aria-hidden>
      <circle cx="21" cy="21" r={RADIO} fill="transparent" stroke="var(--color-sand)" strokeWidth="6" />
      {suma > 0 &&
        filtrados.map((s) => {
          const frac = s.valor / suma;
          const largo = frac * CIRCUNFERENCIA;
          const offset = -acumulado * CIRCUNFERENCIA;
          acumulado += frac;
          return (
            <circle
              key={s.etiqueta}
              cx="21"
              cy="21"
              r={RADIO}
              fill="transparent"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={`${largo} ${CIRCUNFERENCIA - largo}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          );
        })}
      <text x="21" y="19.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="var(--color-tinta)">
        S/{total.toFixed(0)}
      </text>
      <text x="21" y="25.5" textAnchor="middle" fontSize="3.6" fill="var(--color-tinta-60)">
        hoy
      </text>
    </svg>
  );
}

export function BarrasHorarias({
  puntos,
  horaActual,
}: {
  puntos: { hora: number; monto: number }[];
  horaActual: number;
}) {
  if (puntos.length === 0) {
    return <p className="py-8 text-center text-xs text-tinta/50">Sin ventas registradas todavía hoy.</p>;
  }
  const max = Math.max(...puntos.map((p) => p.monto), 0.0001);
  return (
    <div className="flex h-[120px] items-end gap-1.5">
      {puntos.map((p) => {
        const esActual = p.hora === horaActual;
        const alturaPct = Math.max(4, (p.monto / max) * 100);
        return (
          <div key={p.hora} className="group relative flex h-full flex-1 flex-col items-center justify-end">
            <div
              role="img"
              aria-label={`${p.hora}:00 — S/${p.monto.toFixed(2)}`}
              className={`w-full max-w-5 rounded-t rounded-b-sm transition-[height] duration-500 ${esActual ? "bg-rojo" : "bg-taupe/70"}`}
              style={{ height: `${alturaPct}%` }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded bg-tinta px-1.5 py-0.5 text-[10px] text-crema opacity-0 transition-opacity group-hover:opacity-100"
            >
              S/{p.monto.toFixed(0)}
            </span>
            <span className="mt-1.5 text-[9.5px] text-tinta/50">{p.hora}h</span>
          </div>
        );
      })}
    </div>
  );
}

export function TendenciaCierres({ dias }: { dias: { etiqueta: string; alturaPct: number; ok: boolean }[] }) {
  if (dias.length === 0) {
    return <p className="py-6 text-center text-xs text-tinta/50">Sin cierres todavía.</p>;
  }
  return (
    <div className="mb-1.5 flex h-[70px] items-end gap-2">
      {dias.map((d, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
          <div
            role="img"
            aria-label={d.ok ? "Cierre correcto" : "Diferencia en el cierre"}
            className={`w-full max-w-[26px] rounded-t rounded-b-sm ${d.ok ? "bg-verde" : "bg-rojo-profundo"}`}
            style={{ height: `${Math.max(6, d.alturaPct)}%` }}
          />
          <span className="mt-1 text-[9.5px] text-tinta/50">{d.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}
