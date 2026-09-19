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
