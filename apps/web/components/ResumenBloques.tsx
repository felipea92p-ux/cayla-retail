import type { ReactNode } from "react";

// La tarjeta con título, subtítulo y (opcional) un enlace, que usan los bloques de «Comparar períodos».
// Aquí vivían también los tres bloques del Resumen viejo (velocidad, cobertura de hoy, curvas rotas):
// hablaban del stock de hoy y salieron del Análisis (ADR-0138); su lógica sigue en `lib/resumen-reglas.ts`.

export function Bloque({ titulo, subtitulo, enlace, children, className = "" }: { titulo: string; subtitulo: string; enlace?: { texto: string; onClick: () => void }; children: ReactNode; className?: string }) {
  return (
    <section className={`card-cayla flex min-w-0 flex-col p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.15rem] leading-tight text-tinta">{titulo}</h2>
          <p className="mt-0.5 text-xs text-tinta/65">{subtitulo}</p>
        </div>
        {enlace && (
          <button type="button" onClick={enlace.onClick} className="label-cayla shrink-0 text-[11px] text-tinta/70 underline-offset-2 transition-colors hover:text-rojo hover:underline">
            {enlace.texto} →
          </button>
        )}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}
