"use client";

import { BarrasTiempo } from "@/components/ui/BarrasTiempo";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

/** Barras de ventas por hora — solo el rango entre la apertura y ahora (nunca un
 *  9am-8pm fijo). Las barras por tiempo del sistema (ronda 14 de /unificar): la hora actual en tinta,
 *  con su cifra; cada hora dice su monto al pasar el mouse. */
export function VentasPorHoraChart({ datos, horaActual }: { datos: { hora: number; monto: number }[]; horaActual: number }) {
  return (
    <div className="card-cayla p-5">
      <p className="text-sm font-semibold text-tinta">Ventas por hora</p>
      <p className="mt-1 text-xs text-tinta/60">Hoy · hora actual resaltada</p>
      <BarrasTiempo
        className="mt-5"
        alto={128}
        barras={datos.map(({ hora: h, monto }) => ({ clave: String(h), valor: monto, etiqueta: etiquetaHora(h), tip: `${etiquetaHora(h)}: ${money(monto)}`, cifra: money(monto) }))}
        destacada={String(horaActual)}
        etiqueta="Ventas por hora del día de hoy"
      />
    </div>
  );
}

function etiquetaHora(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
