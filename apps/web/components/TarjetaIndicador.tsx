// Componente base para los indicadores de los 5 módulos de Finanzas
// (Facturación/Ingresos/Egresos/EERR/Resumen) — Fase 0.5 del plan de reemplazo
// de Alegra. Antes de este componente, cada pantalla escribía su propio KPI a
// mano (ver finanzas/page.tsx: label-cayla + font-display repetido 5 veces con
// variaciones pequeñas) — mismo riesgo de duplicación que ya se corrigió en
// otros módulos con "una sola fuente de verdad".
//
// Patrón "small multiples" (hallazgo Ramp/Tufte, Ronda 2): para el Resumen
// segmentado por sede, se renderiza una <TarjetaIndicador> por sede en una
// grilla — nunca un selector que oculta las otras.
//
// El Rojo solo aparece cuando `critico` es true (una cifra negativa real o una
// alerta que de verdad importa) — nunca como color decorativo. Es la forma en
// que este componente hace cumplir MAX_ROJO_POR_PANTALLA sin necesitar un
// contador global: el rojo no es una opción de estilo, es lo que significa
// "esto necesita tu atención".
//
// 2026-09-09: el Inicio dejó de escribir sus 4 tarjetas a mano y pasó a usar
// esta. Para eso hacían falta dos huecos que Finanzas no necesitaba —`ayuda`
// (el botón "(!)") y `pie` (desglose por sede, un enlace, una aclaración)—.
// Ambos son opcionales: las llamadas de Finanzas y de ProformasPanel no
// cambian ni una línea.

type Comparativo = {
  texto: string; // ej. "+12% vs mes anterior" — ya redactado, este componente no formatea
  positivo: boolean;
};

/**
 * Lleva una serie de valores a los 0-1 que espera `sparkline`, anclando el
 * CERO abajo del todo — no el mínimo de la serie. Con dinero, encuadrar contra
 * el mínimo miente: dos días de S/900 y S/1000 se verían como un derrumbe.
 * Vive acá y no en quien la llama para que todas las mini-líneas de la app
 * midan igual.
 */
export function normalizarSparkline(valores: number[]): number[] {
  const max = Math.max(...valores);
  if (!(max > 0)) return valores.map(() => 0);
  return valores.map((v) => Math.max(0, v) / max);
}

export function TarjetaIndicador({
  etiqueta,
  valor,
  comparativo,
  alerta,
  critico = false,
  sparkline,
  ayuda,
  pie,
}: {
  etiqueta: string;
  valor: string;
  comparativo?: Comparativo;
  /** Texto editorial corto (no un badge) — ej. "3 comprobantes vencidos en TRU". */
  alerta?: string;
  /** true solo si el valor es una cifra negativa real o requiere atención real. */
  critico?: boolean;
  /**
   * Puntos ya normalizados 0-1 para la mini-línea. Si la serie entera es cero
   * no se dibuja nada: una línea plana sobre la nada no es una tendencia, es
   * ruido — y confunde con una tendencia real que resultó ser plana.
   */
  sparkline?: number[];
  /** El botón "(!)" de <Ayuda>, pegado a la etiqueta. */
  ayuda?: React.ReactNode;
  /** Línea(s) chicas al pie: desglose por sede, un enlace, una aclaración. */
  pie?: React.ReactNode;
}) {
  return (
    <div className="card-cayla p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="label-cayla text-[11px] text-tinta/65">
          {etiqueta}
          {ayuda}
        </p>
        {sparkline && sparkline.length > 1 && sparkline.some((p) => p > 0) && <Sparkline puntos={sparkline} critico={critico} />}
      </div>
      <p className={`font-display mt-1 text-2xl ${critico ? "text-rojo" : "text-tinta"}`}>{valor}</p>
      {comparativo && (
        <p className={`mt-1 text-xs ${comparativo.positivo ? "text-verde" : "text-tinta/75"}`}>{comparativo.texto}</p>
      )}
      {alerta && <p className="mt-2 text-xs leading-snug text-tinta/80">{alerta}</p>}
      {pie && <div className="mt-1 text-xs text-tinta/65">{pie}</div>}
    </div>
  );
}

// Mini-línea sin eje ni grid (patrón Puzzle/Mercury/Stripe, Ronda 1 y 2): el
// comparativo se lee en la FORMA de la línea, no en un párrafo aparte. Nunca es
// la única vista del número — siempre acompaña a la cifra grande, no la reemplaza.
function Sparkline({ puntos, critico }: { puntos: number[]; critico: boolean }) {
  const ancho = 64;
  const alto = 20;
  const paso = ancho / (puntos.length - 1);
  const coords = puntos.map((p, i) => `${(i * paso).toFixed(1)},${(alto - p * alto).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="mt-0.5 h-5 w-16 shrink-0" aria-hidden="true">
      <polyline
        points={coords}
        fill="none"
        stroke={critico ? "var(--color-rojo)" : "var(--color-tinta)"}
        strokeOpacity={critico ? 1 : 0.35}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
