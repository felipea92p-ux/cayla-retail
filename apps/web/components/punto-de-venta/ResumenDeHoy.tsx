"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, History, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { VentasDeHoyLista, type VentaDeHoy } from "@/components/VentasDeHoy";
import { anchoBarraMeta, resumenDeHoy } from "@/lib/vender-hoy-reglas";

const soles = (n: number) => `S/${n.toFixed(2)}`;

/**
 * «Hoy» en el Punto de venta (spike 2026-09-26, hallazgo 2; desde «el ticket a lo alto», en chico sobre el catálogo y arriba de «Más»): cuánto se vendió en la sede y
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
  forma,
}: {
  ventas: VentaDeHoy[];
  fallo: string | null;
  meta: number | null;
  ubicacionEtiqueta: string;
  /** Solo si su rol abre esas pantallas (`accesosVisibles`). */
  verCaja: boolean;
  verHistorial: boolean;
  /** «texto»: una línea chica en la fila de arriba del catálogo; «bloque»: la cifra grande arriba de «Más». Las dos
   *  abren la misma lista (spike «el ticket a lo alto»: la píldora ya no ocupa un botón en la franja). */
  forma: "texto" | "bloque";
}) {
  const [abierto, setAbierto] = useState(false);
  const r = resumenDeHoy(ventas, meta);
  const ancho = anchoBarraMeta(r.pctMeta);

  const disparador =
    forma === "texto" ? (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        title={r.pctMeta !== null ? `${r.pctMeta} % de la meta del día · ver las ventas` : "Ver las ventas de hoy"}
        className="inline-flex h-9 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-tinta/65 transition-colors hover:text-tinta"
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Hoy <b className="font-semibold text-tinta tabular-nums">{soles(r.total)}</b>
        {r.pctMeta !== null && <span className="font-semibold text-verde tabular-nums">· {r.pctMeta}%</span>}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-3 rounded-xl bg-hueso px-4 py-3 text-left transition-colors hover:bg-sand"
      >
        <Clock className="h-5 w-5 shrink-0 text-tinta/60" aria-hidden />
        <span className="min-w-0">
          <span className="block font-display text-2xl leading-none text-tinta tabular-nums">{soles(r.total)}</span>
          <span className="mt-1 block text-[11.5px] text-tinta/60">
            Hoy · {r.ventas} {r.ventas === 1 ? "venta" : "ventas"}
            {meta ? ` · meta ${soles(meta)}` : ""} · ver la lista
          </span>
        </span>
        {r.pctMeta !== null && (
          <span className="ml-auto flex items-center gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-tinta/10" aria-hidden>
              <span className="block h-full rounded-full bg-verde" style={{ width: `${ancho}%` }} />
            </span>
            <span className="text-xs font-semibold text-verde tabular-nums">{r.pctMeta}%</span>
          </span>
        )}
      </button>
    );

  return (
    <>
      {disparador}

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
