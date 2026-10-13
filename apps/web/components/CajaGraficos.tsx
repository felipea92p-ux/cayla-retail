"use client";

import type { PuntoTendenciaCierres } from "@/lib/caja-panel-reglas";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

/** Barras de ventas por hora — solo el rango entre la apertura y ahora (nunca un
 *  9am-8pm fijo, ver `rangoHorasCaja`). La hora actual se resalta con el acento. */
export function VentasPorHoraChart({ datos, horaActual }: { datos: { hora: number; monto: number }[]; horaActual: number }) {
  const max = Math.max(1, ...datos.map((d) => d.monto));
  return (
    <div className="card-cayla p-5">
      <p className="text-sm font-semibold text-tinta">Ventas por hora</p>
      <p className="mt-1 text-xs text-tinta/60">Hoy · hora actual resaltada</p>
      <div className="mt-5 flex h-32 items-end gap-1.5" role="img" aria-label="Ventas por hora del día de hoy">
        {datos.map(({ hora: h, monto }) => {
          const alturaPct = Math.max(2, (monto / max) * 100);
          const esAhora = h === horaActual;
          return (
            <div key={h} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${etiquetaHora(h)}: ${money(monto)}`}>
              <div
                className="w-full max-w-5 rounded-t transition-[height] duration-500"
                style={{ height: `${alturaPct}%`, background: esAhora ? "var(--color-rojo)" : "var(--color-tinta)", opacity: esAhora ? 1 : 0.3 }}
              />
              <span className="mt-1.5 text-[9.5px] text-tinta/55">{etiquetaHora(h)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function etiquetaHora(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** Mini-tendencia de 7 días de cierres de esta sede — barra roja si ese día no cuadró. */
export function TendenciaCierres({ serie }: { serie: PuntoTendenciaCierres[] }) {
  const max = Math.max(1, ...serie.map((p) => Math.abs(p.monto)));
  return (
    <div className="flex h-[70px] items-end gap-2" role="img" aria-label="Tendencia de cierres de los últimos 7 días">
      {serie.map((p, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end" title={`${p.diaLabel}: ${money(p.monto)}${p.descuadre ? " · no cuadró" : ""}`}>
          <div
            className="w-full max-w-[26px] rounded-t"
            style={{
              height: `${Math.max(4, (Math.abs(p.monto) / max) * 100)}%`,
              background: p.descuadre ? "var(--color-rojo)" : "var(--color-verde)",
              opacity: p.esHoy ? 1 : 0.75,
            }}
          />
          <span className="mt-1 text-[9.5px] text-tinta/55">{p.diaLabel[0]!.toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}
