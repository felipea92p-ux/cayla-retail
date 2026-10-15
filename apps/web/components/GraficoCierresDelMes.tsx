"use client";

import { useMemo, useState } from "react";
import type { CierreCaja } from "@/lib/caja";
import type { Mes } from "@/lib/facturacion-reglas";
import { bloqueFecha, diasDelGrafico, estadoCierre, topeDelGrafico, type EstadoCierre } from "@/lib/historial-cierres-reglas";

function money(n: number) {
  return "S/\u00a0" + Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const RELLENO: Record<EstadoCierre, string> = { cuadro: "bg-verde", falto: "bg-rojo", sobro: "bg-ambar" };
const RESULTADO: Record<EstadoCierre, string> = { cuadro: "cuadró", falto: "faltó", sobro: "sobró" };
const ALTO = 96;

function textoCierre(c: CierreCaja) {
  const { dia, diaSemana } = bloqueFecha(c.cerradaEn);
  const estado = estadoCierre(c.diferencia);
  const resultado = estado === "cuadro" ? "cuadró" : `${RESULTADO[estado]} ${money(c.diferencia)}`;
  return { titulo: `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)} ${dia}`, resultado };
}

/**
 * «Cómo cerró cada día» (Felipe 2026-10-12, maqueta 1 «Lo que se contó»): una columna por día del mes y una barra por
 * cierre. El alto es lo que se contó y el color, cómo terminó; si faltó, encima queda punteado lo que faltaba hasta lo
 * que debía haber. Los días en que la caja quedó abierta van con un recuadro punteado; hoy, si aún no se cierra, con uno
 * rojo. Pasar el mouse (o el foco) muestra el detalle del día, y tocar la barra abre ese cierre. Sin animación propia
 * (ADR-0136). La lógica de los días vive en `lib/historial-cierres-reglas.ts` (`diasDelGrafico`).
 */
export function GraficoCierresDelMes({
  cierres,
  mes,
  hoy,
  onVer,
}: {
  cierres: CierreCaja[];
  mes: Mes;
  hoy: Mes & { dia: number };
  onVer: (c: CierreCaja) => void;
}) {
  const dias = useMemo(() => diasDelGrafico(cierres, mes, hoy), [cierres, mes, hoy]);
  const tope = useMemo(() => topeDelGrafico(cierres), [cierres]);
  const [encima, setEncima] = useState<{ cierre: CierreCaja; col: number } | null>(null);
  const n = dias.length;
  const etiquetas = new Set([1, 5, 10, 15, 20, 25, n]);
  const lineas = [0.25, 0.5, 0.75, 1];
  const esHoy = (dia: number) => mes.anio === hoy.anio && mes.mes === hoy.mes && dia === hoy.dia;

  return (
    <div className="mt-3 rounded-[14px] border border-sand bg-papel px-3.5 pb-2 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[12.5px] font-semibold text-tinta">Cómo cerró cada día</p>
        <p className="flex gap-3 text-[11px] text-tinta/65" aria-hidden>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-verde" />Cuadró</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-rojo" />Faltó</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-ambar" />Sobró</span>
        </p>
      </div>

      <div className="relative mt-2.5" style={{ height: ALTO }}>
        {/* Las líneas guía: cuartos del tope, con su cifra en la mitad y arriba. */}
        {lineas.map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-sand" style={{ bottom: `${f * 100}%` }} aria-hidden>
            {(f === 0.5 || f === 1) && (
              <span className="absolute -top-3.5 right-0 text-[9.5px] text-tinta/45 tabular-nums">S/&nbsp;{(tope * f).toLocaleString("es-PE")}</span>
            )}
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-sand" aria-hidden />

        <div className="absolute inset-0 grid items-end" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {dias.map((d, col) => (
            <div key={d.dia} className="flex h-full items-end justify-center gap-[2px]">
              {d.tipo === "con" &&
                d.cierres.map((c) => {
                  const estado = estadoCierre(c.diferencia);
                  const alto = (Math.max(c.montoCierreReal, c.montoCierreSistema) / tope) * 100;
                  const hueco = estado === "falto" && c.montoCierreSistema > 0 ? ((c.montoCierreSistema - c.montoCierreReal) / c.montoCierreSistema) * 100 : 0;
                  const { titulo, resultado } = textoCierre(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onVer(c)}
                      onMouseEnter={() => setEncima({ cierre: c, col })}
                      onMouseLeave={() => setEncima(null)}
                      onFocus={() => setEncima({ cierre: c, col })}
                      onBlur={() => setEncima(null)}
                      aria-label={`${titulo}: se contó ${money(c.montoCierreReal)}, ${resultado}. Ver el detalle`}
                      className={`flex flex-col rounded-[3px] ${d.cierres.length > 1 ? "w-[6px]" : "w-[10px]"} ${encima?.cierre.id === c.id ? "outline outline-[1.5px] outline-offset-1 outline-tinta" : ""}`}
                      style={{ height: `max(3px, ${alto}%)` }}
                    >
                      {hueco > 0 && <span className="w-full rounded-t-[3px] border border-b-0 border-dashed border-rojo" style={{ height: `${hueco}%`, minHeight: 2 }} aria-hidden />}
                      <span className={`w-full flex-1 ${hueco > 0 ? "rounded-b-[3px]" : "rounded-[3px]"} ${RELLENO[estado]}`} aria-hidden />
                    </button>
                  );
                })}
              {d.tipo === "abierta" && <span className="mb-px h-3 w-2 rounded-[2px] border border-dashed border-taupe/50" title="La caja quedó abierta esta noche" aria-hidden />}
              {d.tipo === "hoy" && <span className="h-[26px] w-2 rounded-[2px] border border-dashed border-rojo" title="Hoy: la caja todavía no se cierra" aria-hidden />}
              {(d.tipo === "vacio" || d.tipo === "futuro") && <span className={`h-[2px] w-2 rounded-full ${d.tipo === "futuro" ? "bg-hueso" : "bg-sand"}`} aria-hidden />}
            </div>
          ))}
        </div>

        {encima && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[10px] bg-tinta px-3 py-2 text-[12px] leading-snug text-crema shadow-[0_10px_24px_-10px_color-mix(in_srgb,var(--color-sombra)_60%,transparent)]"
            style={{ left: `clamp(110px, ${((encima.col + 0.5) / n) * 100}%, calc(100% - 110px))` }}
            aria-hidden
          >
            <b className="font-semibold">{textoCierre(encima.cierre).titulo}</b> · se contó {money(encima.cierre.montoCierreReal)}
            <br />
            debía haber {money(encima.cierre.montoCierreSistema)} · <b className="font-semibold">{textoCierre(encima.cierre).resultado}</b>
          </div>
        )}
      </div>

      <div className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
        {dias.map((d) => (
          <span key={d.dia} className="text-center text-[10px] leading-tight tabular-nums">
            <span className="text-tinta/45">{etiquetas.has(d.dia) ? d.dia : " "}</span>
            {esHoy(d.dia) && <span className="block text-[8.5px] font-bold tracking-[0.08em] text-rojo">HOY</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
