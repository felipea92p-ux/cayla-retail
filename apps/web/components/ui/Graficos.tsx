import type { CSSProperties } from "react";

/* ====================================================================
   Gráficos del tablero de Caja (2026-09-18) — SVG puro, sin librería.

   No hay ninguna librería de charts instalada (ni recharts ni d3) y la
   maqueta de referencia tampoco usa ninguna: son formas simples
   (sparkline, tendencia de 7 días) que no justifican una dependencia
   nueva. Todo es decorativo (`aria-hidden`) — cada gráfico vive siempre
   al lado de texto real (leyenda, tabla, cifra) que dice lo mismo sin
   depender del color, como pide la accesibilidad del rediseño.

   La dona de métodos de pago ya no vive acá: necesita estado (hover) y
   una entrada animada, y estas dos son funciones puras sin hooks. Ver
   `DonaMetodos.tsx`. El gráfico de barras "ventas por hora" se retiró el
   2026-09-18 (no se entendía y no aportaba): lo reemplaza `RitmoDelDia`,
   dentro de `CajaAbiertaPanel.tsx`.
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

export type DiaCierre = {
  /** Una letra ("L"): para cuando la tarjeta es angosta. */
  etiqueta: string;
  /** "lun 15": cuando hay sitio para más. */
  etiquetaLarga: string;
  /** "S/700", ya formateado. */
  monto: string;
  alturaPct: number;
  ok: boolean;
};

/**
 * Tendencia de cierres. Se adapta al ancho de SU tarjeta (`@container`), no al de la pantalla:
 *  - angosta: las últimas 7 barras con una letra de día, como siempre;
 *  - con sitio (≥ 420 px): día y monto bajo cada barra;
 *  - ancha (≥ 700 px, la tarjeta que ocupa dos columnas): hasta 14 barras, más altas.
 * Recibe hasta 14 días en orden cronológico: los 7 más viejos solo se ven cuando cabe.
 */
export function TendenciaCierres({ dias }: { dias: DiaCierre[] }) {
  if (dias.length === 0) {
    return <p className="py-6 text-center text-xs text-tinta/50">Sin cierres todavía.</p>;
  }
  return (
    <div className="@container mb-1.5">
      <div className="flex gap-2">
        {dias.map((d, i) => (
          <div
            key={i}
            className={`min-w-0 flex-1 flex-col items-center ${i < dias.length - 7 ? "hidden @[700px]:flex" : "flex"}`}
          >
            <div className="flex h-[70px] w-full items-end justify-center @[700px]:h-[92px]">
              <div
                role="img"
                aria-label={`${d.etiquetaLarga}: ${d.monto}, ${d.ok ? "cuadró" : "con diferencia"}`}
                className={`w-full max-w-[26px] rounded-t rounded-b-sm ${d.ok ? "bg-verde" : "bg-rojo-profundo"}`}
                style={{ height: `${Math.max(6, d.alturaPct)}%` }}
              />
            </div>
            <span className="mt-1 text-[9.5px] text-tinta/50 @[420px]:hidden">{d.etiqueta}</span>
            <span className="mt-1 hidden text-[10.5px] text-tinta/55 @[420px]:block">{d.etiquetaLarga}</span>
            <span aria-hidden className="hidden text-[10.5px] font-semibold tabular-nums text-tinta/75 @[420px]:block">
              {d.monto}
            </span>
          </div>
        ))}
      </div>
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

export type BarraHComparada = { clave: string; etiqueta: string; detalle?: string | null; a: number | null; b: number; textoA: string; textoB: string };

/**
 * Como `BarrasHorizontales`, pero con DOS barras por fila (A encima, apagada; B debajo, sólida) en la
 * MISMA escala que `BarrasHorizontales` — el máximo de TODOS los valores de A y de B, nunca por fila:
 * dos productos solo se comparan entre sí si comparten regla. Mismos colores que `ColumnasComparadas`
 * (A = taupe, B = tinta), para que la convención A/B se lea igual en toda la pantalla. `a: null` (sin
 * rotación calculable en A) no dibuja esa barra en vez de dibujar un cero engañoso.
 */
export function BarrasHorizontalesComparadas({ barras, etiquetaA, etiquetaB }: { barras: BarraHComparada[]; etiquetaA: string; etiquetaB: string }) {
  const max = Math.max(...barras.flatMap((b) => [b.a ?? 0, b.b]), 0);
  const anchoPct = (v: number) => (max > 0 && v > 0 ? Math.max((v / max) * 100, 3) : 0);
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta/70">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-taupe/55" />A · {etiquetaA}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-tinta/80" />B · {etiquetaB}
        </li>
      </ul>
      <ul className="space-y-3.5">
        {barras.map((b, i) => (
          <li key={b.clave}>
            <span className="block truncate text-sm text-tinta" title={b.detalle ? `${b.etiqueta} · ${b.detalle}` : b.etiqueta}>
              {b.etiqueta}
              {b.detalle && <span className="text-tinta/60"> · {b.detalle}</span>}
            </span>
            <span aria-hidden className="mt-1.5 flex flex-col gap-1">
              <span className="flex items-center gap-2">
                <span className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-sand/70">
                  {b.a !== null && (
                    <span
                      className="anim-crece-x block h-full origin-left rounded-full bg-taupe/55"
                      style={{ width: `${anchoPct(b.a)}%`, "--i": i } as CSSProperties}
                    />
                  )}
                </span>
                <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-tinta/55">{b.a === null ? "N/D" : b.textoA}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-sand/70">
                  <span className="anim-crece-x block h-full origin-left rounded-full bg-tinta/80" style={{ width: `${anchoPct(b.b)}%`, "--i": i } as CSSProperties} />
                </span>
                <span className="w-11 shrink-0 text-right text-xs font-medium tabular-nums text-tinta">{b.textoB}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
      {/* Misma información para un lector de pantalla, sin depender del color ni de la longitud de la barra. */}
      <ul className="sr-only">
        {barras.map((b) => (
          <li key={b.clave}>
            {b.etiqueta}: A {b.a === null ? "sin dato" : b.textoA}, B {b.textoB}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type GrupoColumnas = { clave: string; etiqueta: string; a: number; b: number };

const ALTO_COLUMNAS = 128; // px de la columna más alta; el resto, proporcional

/** Columnas agrupadas, una pareja A/B por grupo, con la MISMA escala para todas (el máximo de
 *  todos los valores): dos columnas solo se pueden comparar si comparten eje. Decorativo
 *  (`aria-hidden`): el número va escrito sobre cada columna y la leyenda dice qué es A y qué es B. */
export function ColumnasComparadas({ grupos, etiquetaA, etiquetaB }: { grupos: GrupoColumnas[]; etiquetaA: string; etiquetaB: string }) {
  const max = Math.max(...grupos.flatMap((g) => [g.a, g.b]), 0);
  const alto = (v: number) => (max > 0 && v > 0 ? Math.max(Math.round((v / max) * ALTO_COLUMNAS), 3) : 0);
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta/70">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-taupe/55" />A · {etiquetaA}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-tinta/80" />B · {etiquetaB}
        </li>
      </ul>
      <div aria-hidden className="flex items-end gap-2 border-b border-tinta/15 sm:gap-4">
        {grupos.map((g, i) => (
          <div key={g.clave} className="flex min-w-0 flex-1 items-end justify-center gap-1.5">
            {(
              [
                ["a", g.a, "bg-taupe/55"],
                ["b", g.b, "bg-tinta/80"],
              ] as const
            ).map(([k, v, color]) => (
              <div key={k} className="flex w-full max-w-[2.75rem] flex-col items-center justify-end">
                <span className="mb-1 text-xs tabular-nums text-tinta">{v}</span>
                <span className={`anim-crece-y block w-full origin-bottom rounded-t-sm ${color}`} style={{ height: alto(v), "--i": i } as CSSProperties} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex gap-2 sm:gap-4">
        {grupos.map((g) => (
          <span key={g.clave} className="min-w-0 flex-1 text-center text-xs leading-4 text-tinta/75">
            {g.etiqueta}
          </span>
        ))}
      </div>
      {/* La misma información para un lector de pantalla, sin depender de la forma ni del color. */}
      <ul className="sr-only">
        {grupos.map((g) => (
          <li key={g.clave}>
            {g.etiqueta}: A {g.a}, B {g.b}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Columna = { clave: string; etiqueta: string; valor: number };

/** Columnas de UNA serie (Desempeño, 2026-09-22): la hermana de `ColumnasComparadas` para un solo período, con
 *  la misma escala, el mismo alto y el mismo color que la B de allá (lo analizado). El número va escrito sobre
 *  cada columna: el gráfico se lee sin depender de la altura. */
export function Columnas({ columnas }: { columnas: Columna[] }) {
  const max = Math.max(...columnas.map((c) => c.valor), 0);
  const alto = (v: number) => (max > 0 && v > 0 ? Math.max(Math.round((v / max) * ALTO_COLUMNAS), 3) : 0);
  return (
    <div>
      <div aria-hidden className="flex items-end gap-2 border-b border-tinta/15 sm:gap-4">
        {columnas.map((c, i) => (
          <div key={c.clave} className="flex min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-xs tabular-nums text-tinta">{c.valor}</span>
            <span className="anim-crece-y block w-full max-w-[3.25rem] origin-bottom rounded-t-sm bg-tinta/80" style={{ height: alto(c.valor), "--i": i } as CSSProperties} />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex gap-2 sm:gap-4">
        {columnas.map((c) => (
          <span key={c.clave} className="min-w-0 flex-1 text-center text-xs leading-4 text-tinta/75">
            {c.etiqueta}
          </span>
        ))}
      </div>
      <ul className="sr-only">
        {columnas.map((c) => (
          <li key={c.clave}>
            {c.etiqueta}: {c.valor}
          </li>
        ))}
      </ul>
    </div>
  );
}
