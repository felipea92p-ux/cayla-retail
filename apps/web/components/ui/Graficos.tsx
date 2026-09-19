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

/* ------------------------------------------------------------------
   Resumen de Inventario v2 (2026-09-19) — dos formas más, mismas reglas:
   SVG/HTML puro, decorativo (`aria-hidden`) y siempre junto a texto real.
   ------------------------------------------------------------------ */

export type BarraH = { clave: string; etiqueta: string; detalle?: string | null; valor: number; texto: string; onClick?: () => void };

/** Barras horizontales ordenadas de mayor a menor: la longitud es `valor` sobre el máximo. */
export function BarrasHorizontales({ barras }: { barras: BarraH[] }) {
  const max = Math.max(...barras.map((b) => b.valor), 0);
  return (
    <ul className="space-y-2.5">
      {barras.map((b) => {
        const contenido = (
          <>
            <span className="w-[8.5rem] shrink-0 truncate text-sm text-tinta" title={b.detalle ? `${b.etiqueta} · ${b.detalle}` : b.etiqueta}>
              {b.etiqueta}
              {b.detalle && <span className="text-tinta/60"> · {b.detalle}</span>}
            </span>
            <span aria-hidden className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sand/70">
              <span className="block h-full rounded-full bg-taupe/75" style={{ width: `${max > 0 ? Math.max((b.valor / max) * 100, 3) : 0}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right text-sm tabular-nums text-tinta">{b.texto}</span>
          </>
        );
        return (
          <li key={b.clave}>
            {b.onClick ? (
              <button type="button" onClick={b.onClick} className="flex w-full items-center gap-3 rounded-sm text-left transition-colors hover:bg-tinta/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-tinta/40">
                {contenido}
              </button>
            ) : (
              <span className="flex items-center gap-3">{contenido}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type SegmentoDistribucion = { clave: string; valor: number; color: string };

/** Dona de una distribución, con la cifra total al centro. Los segmentos pueden
 *  tocarse (atajo del mouse); la leyenda al lado es el camino accesible. */
export function DonaDistribucion({
  segmentos,
  centro,
  onSegmento,
}: {
  segmentos: SegmentoDistribucion[];
  centro: { valor: string; etiqueta: string };
  onSegmento?: (clave: string) => void;
}) {
  const RADIO = 15.9;
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
  const visibles = segmentos.filter((s) => s.valor > 0);
  const suma = visibles.reduce((a, s) => a + s.valor, 0);
  let acumulado = 0;
  return (
    <svg width="148" height="148" viewBox="0 0 42 42" className="shrink-0" aria-hidden>
      <circle cx="21" cy="21" r={RADIO} fill="transparent" stroke="var(--color-sand)" strokeWidth="6" />
      {suma > 0 &&
        visibles.map((s) => {
          const frac = s.valor / suma;
          const largo = frac * CIRCUNFERENCIA;
          const offset = -acumulado * CIRCUNFERENCIA;
          acumulado += frac;
          return (
            <circle
              key={s.clave}
              cx="21"
              cy="21"
              r={RADIO}
              fill="transparent"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={`${Math.max(largo - 0.35, 0.01)} ${CIRCUNFERENCIA - Math.max(largo - 0.35, 0.01)}`}
              strokeDashoffset={offset}
              transform="rotate(-90 21 21)"
              className={onSegmento ? "cursor-pointer" : undefined}
              onClick={onSegmento ? () => onSegmento(s.clave) : undefined}
            />
          );
        })}
      <text x="21" y="21.5" textAnchor="middle" fontSize="7.5" fontWeight="600" fill="var(--color-tinta)">
        {centro.valor}
      </text>
      <text x="21" y="26.5" textAnchor="middle" fontSize="3.3" fill="var(--color-tinta-60)">
        {centro.etiqueta}
      </text>
    </svg>
  );
}
