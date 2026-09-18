"use client";

import { useState } from "react";
import type { PuntoTendenciaCierres } from "@/lib/caja-panel-reglas";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

type Grupo = "efectivo" | "tarjeta" | "digital";
const GRUPO_DE_METODO: Record<string, Grupo> = { efectivo: "efectivo", tarjeta: "tarjeta", yape: "digital", plin: "digital", transferencia: "digital" };
const LABEL_METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", yape: "Yape", plin: "Plin", transferencia: "Transferencia" };
const LABEL_GRUPO: Record<Grupo, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", digital: "Yape / Plin / Transferencia" };
const COLOR_GRUPO: Record<Grupo, string> = {
  efectivo: "var(--color-metodo-efectivo)",
  tarjeta: "var(--color-metodo-tarjeta)",
  digital: "var(--color-metodo-digital)",
};

/**
 * Dona de métodos de pago — agrupa los métodos reales (efectivo/tarjeta/yape/plin/
 * transferencia) en 3 colores categóricos para que la dona se lea de un vistazo; la
 * tabla alternativa (accesible, activable con el botón) SÍ desglosa cada método real
 * con su monto exacto — es más granular que la dona, no un simple espejo de la misma
 * info. r=15.9 hace que la circunferencia (2πr ≈ 99.9) calce casi exacto con un
 * `stroke-dasharray` en unidades de porcentaje, sin tener que recalcular nada.
 */
export function DonaMetodosPago({ porMetodo }: { porMetodo: { metodo: string; monto: number }[] }) {
  const [tabla, setTabla] = useState(false);
  const total = porMetodo.reduce((a, p) => a + p.monto, 0);

  if (total <= 0) {
    return (
      <div className="card-cayla p-5">
        <p className="text-sm font-semibold text-tinta">Métodos de pago</p>
        <p className="mt-1 text-xs text-tinta/60">Distribución de ventas del día</p>
        <p className="mt-6 text-sm text-tinta/50">Todavía no hay ventas hoy.</p>
      </div>
    );
  }

  const porGrupo = new Map<Grupo, number>();
  for (const p of porMetodo) {
    const g = GRUPO_DE_METODO[p.metodo] ?? "digital";
    porGrupo.set(g, (porGrupo.get(g) ?? 0) + p.monto);
  }
  const grupos = (["efectivo", "tarjeta", "digital"] as const)
    .map((g) => ({ grupo: g, monto: porGrupo.get(g) ?? 0, pct: ((porGrupo.get(g) ?? 0) / total) * 100 }))
    .filter((g) => g.monto > 0);

  const resumenAria = grupos.map((g) => `${LABEL_GRUPO[g.grupo]} ${Math.round(g.pct)}%, ${money(g.monto)}`).join("; ");

  let acumulado = 0;
  const arcos = grupos.map((g) => {
    const offset = -acumulado;
    acumulado += g.pct;
    return { ...g, dasharray: `${g.pct.toFixed(2)} ${(100 - g.pct).toFixed(2)}`, dashoffset: offset.toFixed(2) };
  });

  return (
    <div className="card-cayla p-5">
      <p className="text-sm font-semibold text-tinta">Métodos de pago</p>
      <p className="mt-1 text-xs text-tinta/60">Distribución de ventas del día</p>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <svg
          width="132"
          height="132"
          viewBox="0 0 42 42"
          className="shrink-0"
          role="img"
          aria-label={`Distribución de pagos del día: ${resumenAria}`}
        >
          <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="var(--color-sand)" strokeWidth="6" />
          {arcos.map((a) => (
            <circle
              key={a.grupo}
              cx="21"
              cy="21"
              r="15.9"
              fill="transparent"
              stroke={COLOR_GRUPO[a.grupo]}
              strokeWidth="6"
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              strokeLinecap="round"
              transform="rotate(-90 21 21)"
            />
          ))}
          <text x="21" y="19.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="var(--color-tinta)">
            {money(total)}
          </text>
          <text x="21" y="25.5" textAnchor="middle" fontSize="3.6" fill="var(--color-tinta)" opacity="0.6">
            hoy
          </text>
        </svg>
        <div className="min-w-[150px] flex-1 space-y-2">
          {grupos.map((g) => (
            <div key={g.grupo} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-2 text-tinta/80">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR_GRUPO[g.grupo] }} aria-hidden />
                {LABEL_GRUPO[g.grupo]}
              </span>
              <span className="tabular-nums font-semibold text-tinta">
                {Math.round(g.pct)}% · {money(g.monto)}
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTabla((v) => !v)}
            className="mt-1 text-[11px] text-tinta/55 underline decoration-tinta/30 underline-offset-2 hover:text-tinta"
          >
            {tabla ? "Ocultar tabla" : "Ver como tabla"}
          </button>
          {tabla && (
            <table className="mt-2 w-full text-xs">
              <caption className="sr-only">Ventas del día por método de pago exacto</caption>
              <thead>
                <tr className="text-left text-tinta/55">
                  <th scope="col" className="pb-1 font-normal">Método</th>
                  <th scope="col" className="pb-1 font-normal">%</th>
                  <th scope="col" className="pb-1 font-normal">Monto</th>
                </tr>
              </thead>
              <tbody>
                {porMetodo
                  .filter((p) => p.monto > 0)
                  .map((p) => (
                    <tr key={p.metodo} className="border-t border-sand text-tinta/85">
                      <td className="py-1">{LABEL_METODO[p.metodo] ?? p.metodo}</td>
                      <td className="py-1 tabular-nums">{Math.round((p.monto / total) * 100)}%</td>
                      <td className="py-1 tabular-nums">{money(p.monto)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
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
