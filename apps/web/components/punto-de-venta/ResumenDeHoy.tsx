"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, History, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { VentasDeHoyLista, type VentaDeHoy } from "@/components/VentasDeHoy";
import { anchoBarraMeta, resumenDeHoy } from "@/lib/vender-hoy-reglas";

const soles = (n: number) => `S/${n.toFixed(2)}`;

/**
 * La píldora «Hoy» de la cabecera del Punto de venta (spike 2026-09-26, hallazgo 2): cuánto se vendió en la sede y
 * cuánto de la meta. Tocarla abre la lista de ventas del día, que antes vivía al fondo del catálogo. Los datos son
 * los de `useVentasDeHoy` (los mismos que la lista): no se consulta dos veces.
 */
export function ResumenDeHoy({
  ventas,
  fallo,
  meta,
  ubicacionEtiqueta,
  verCaja,
  verHistorial,
}: {
  ventas: VentaDeHoy[];
  fallo: string | null;
  meta: number | null;
  ubicacionEtiqueta: string;
  /** Solo si su rol abre esas pantallas (`accesosVisibles`). */
  verCaja: boolean;
  verHistorial: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const r = resumenDeHoy(ventas, meta);
  const ancho = anchoBarraMeta(r.pctMeta);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        title={r.pctMeta !== null ? `${r.pctMeta} % de la meta del día` : undefined}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-hueso px-3 text-[12.5px] text-tinta transition-[background-color,transform] duration-200 ease-[var(--ease-cayla)] hover:bg-sand active:translate-y-px"
      >
        <Clock className="h-4 w-4 text-tinta/60" aria-hidden />
        <span>
          Hoy <b className="font-semibold tabular-nums">{soles(r.total)}</b>
        </span>
        <span className="hidden text-tinta/60 md:inline">
          {r.ventas} {r.ventas === 1 ? "venta" : "ventas"}
        </span>
        {r.pctMeta !== null && (
          <>
            <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-tinta/10 md:block" aria-hidden>
              <span className="block h-full rounded-full bg-verde transition-[width] duration-500 ease-[var(--ease-cayla)]" style={{ width: `${ancho}%` }} />
            </span>
            <span className="text-[11.5px] font-semibold text-verde tabular-nums">{r.pctMeta}%</span>
          </>
        )}
      </button>

      {abierto && (
        <Modal
          titulo="Ventas de hoy"
          subtitulo={`${ubicacionEtiqueta} · ${r.ventas} ${r.ventas === 1 ? "venta" : "ventas"}${meta ? ` · meta ${soles(meta)}` : ""}`}
          variante="hoja"
          ancho="max-w-lg"
          onClose={() => setAbierto(false)}
        >
          {(cerrar) => (
            <div>
              <p className="font-display text-4xl leading-none text-tinta tabular-nums">{soles(r.total)}</p>
              {r.pctMeta !== null && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tinta/10" aria-hidden>
                    <span className="block h-full rounded-full bg-verde" style={{ width: `${ancho}%` }} />
                  </span>
                  <span className="text-xs font-semibold text-verde tabular-nums">{r.pctMeta}% de la meta</span>
                </div>
              )}
              <div className="mt-5">
                <VentasDeHoyLista ventas={ventas} fallo={fallo} ubicacionEtiqueta={ubicacionEtiqueta} />
              </div>
              {(verHistorial || verCaja) && (
                <div className="mt-5 flex gap-2">
                  {verHistorial && (
                    <Link href="/vender/historial" onClick={cerrar} className="label-cayla inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-tinta/25 bg-papel text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
                      <History className="h-4 w-4" aria-hidden />
                      Historial completo
                    </Link>
                  )}
                  {verCaja && (
                    <Link href="/caja" onClick={cerrar} className="label-cayla inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-tinta/25 bg-papel text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
                      <Wallet className="h-4 w-4" aria-hidden />
                      Ir a Caja
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
