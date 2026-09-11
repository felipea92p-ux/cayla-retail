"use client";

import { Grid } from "@/components/charts/grid";
import { Legend, LegendItem, LegendLabel, LegendMarker } from "@/components/charts/legend";
import { Line, LineChart } from "@/components/charts/line-chart";
import { ChartTooltip, TooltipContent, type TooltipRow } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import type { ComparativoAnual } from "@/lib/finanzas-nucleo";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function money(n: number) {
  return "S/" + n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatEjeY(v: number) {
  if (v === 0) return "S/0";
  return v >= 1000 ? `S/${(v / 1000).toFixed(0)}k` : `S/${Math.round(v)}`;
}

/** El año más reciente sale en tinta al 100%; los anteriores se atenúan hacia
 * crema — rampa secuencial de un solo tono (nunca un color nuevo por año). */
function colorParaAnio(indice: number, total: number) {
  if (total <= 1) return "var(--color-tinta)";
  const piso = 30;
  const pct = piso + ((100 - piso) * indice) / (total - 1);
  return `color-mix(in oklch, var(--color-tinta) ${pct}%, var(--color-crema))`;
}

/** Tendencia mensual del comparativo año contra año — complementa la tabla
 * exacta de abajo, no la reemplaza. */
export function ComparativoChart({ comparativo }: { comparativo: ComparativoAnual }) {
  if (comparativo.anios.length === 0) return null;

  const colorPorAnio = new Map(comparativo.anios.map((anio, i) => [anio, colorParaAnio(i, comparativo.anios.length)]));

  const data = comparativo.filas.map((f) => {
    const fila: Record<string, unknown> = { mes: new Date(2000, f.mes - 1, 1), mesNum: f.mes };
    for (const anio of comparativo.anios) fila[String(anio)] = f.porAnio[anio] ?? 0;
    return fila;
  });

  const itemsLeyenda = comparativo.anios.map((anio) => ({
    label: String(anio),
    value: comparativo.totalPorAnio[anio] ?? 0,
    color: colorPorAnio.get(anio) ?? "var(--color-tinta)",
  }));

  return (
    <div className="card-cayla p-4 sm:p-6">
      {comparativo.anios.length > 1 && (
        <Legend className="mb-2 flex-row flex-wrap gap-x-5 gap-y-1" items={itemsLeyenda}>
          <LegendItem className="cursor-default !p-0">
            <span className="flex items-center gap-1.5">
              <LegendMarker />
              <LegendLabel className="label-cayla text-[11px]" />
            </span>
          </LegendItem>
        </Legend>
      )}
      <LineChart aspectRatio="" data={data} margin={{ top: 16, right: 12, bottom: 28, left: 46 }} style={{ height: 260 }} xDataKey="mes">
        <Grid horizontal strokeDasharray="0" />
        {comparativo.anios.map((anio, i) => (
          <Line
            dataKey={String(anio)}
            key={anio}
            stroke={colorPorAnio.get(anio)}
            strokeWidth={i === comparativo.anios.length - 1 ? 2.5 : 2}
          />
        ))}
        <XAxis />
        <YAxis formatValue={formatEjeY} />
        <ChartTooltip
          content={({ point }) => {
            const rows: TooltipRow[] = comparativo.anios.map((anio) => ({
              label: String(anio),
              value: money((point[String(anio)] as number) ?? 0),
              color: colorPorAnio.get(anio) ?? "var(--color-tinta)",
            }));
            return <TooltipContent rows={rows} title={MESES[(point.mesNum as number) - 1]} />;
          }}
        />
      </LineChart>
    </div>
  );
}
