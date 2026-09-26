"use client";

import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { formatearHora } from "@/components/ComprasAgrupadas";
import type { DevolucionResuelta } from "@/lib/devoluciones";
import { destinoPrendaResuelta } from "@/lib/devoluciones-reglas";
import { etiquetaDia, varianteLegible } from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";

/**
 * «Resueltas» (spike 2026-09-26, `docs/maquetas/devoluciones-2026-09`, ADR-0232): lo que ya aprobó o
 * rechazó un líder en los últimos 15 días. Cierra el círculo de la colaboradora que la registró —qué
 * pasó con la devolución de la clienta— y dice adónde fue cada prenda (al piso o a cuarentena), la nota
 * de crédito y el reembolso. La nota de crédito lleva a Comprobantes ▸ Emitidos solo si la cuenta ve ese
 * módulo (ADR-0161).
 */
export function DevolucionesResueltas({
  resueltas,
  ahora,
  veComprobantes,
}: {
  resueltas: DevolucionResuelta[];
  ahora: Date;
  veComprobantes: boolean;
}) {
  if (resueltas.length === 0) {
    return <p className="nota-cayla">Ninguna devolución aprobada ni rechazada en los últimos 15 días.</p>;
  }
  return (
    <ul className="divide-y divide-sand overflow-hidden rounded-[20px] bg-papel ring-1 ring-tinta/[0.07]">
      {resueltas.map((d) => (
        <li
          key={d.id}
          className="grid gap-x-6 gap-y-2 px-5 py-4 text-sm md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)] md:items-center"
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-tinta">{d.comprobante ?? "Venta sin comprobante"}</span>
              {d.estado === "aprobada" ? (
                <Chip tono="verde" versalitas={false}>
                  Aprobada
                </Chip>
              ) : (
                <Chip tono="neutro" versalitas={false}>
                  Rechazada
                </Chip>
              )}
            </p>
            <p className="mt-0.5 text-[13px] text-tinta/70">
              {d.estado === "aprobada" ? "Aprobó" : "Rechazó"} {d.resueltaPorNombre} · {etiquetaDia(d.resueltaEn, ahora).toLowerCase()} {formatearHora(d.resueltaEn)}
            </p>
          </div>

          <ul className="min-w-0 space-y-1">
            {d.prendas.map((p, n) => {
              const destino = destinoPrendaResuelta(d.estado, p.condicion);
              return (
                <li key={n} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-tinta">
                    {p.referencia}
                    {p.cantidad > 1 && <span className="text-tinta/70"> × {p.cantidad}</span>}
                  </span>
                  <span className="text-[13px] text-tinta/65">{varianteLegible(p)}</span>
                  <Chip tono={destino.tono} versalitas={false}>
                    {destino.texto}
                  </Chip>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-0.5 text-[13px] md:items-end md:text-right">
            <span className="tabular-nums text-tinta">{soles(d.valorPagado)}</span>
            {d.notaCredito &&
              (veComprobantes ? (
                <Link href="/vender/comprobantes/emitidos" className="btn-cayla btn-enlace gap-1.5 text-[13px]">
                  <ReceiptText className="h-3.5 w-3.5" aria-hidden />
                  {d.notaCredito}
                </Link>
              ) : (
                <span className="text-tinta/70">{d.notaCredito}</span>
              ))}
            {d.estado === "aprobada" && (
              <span className="text-tinta/70">
                {d.reembolsoMonto
                  ? `Reembolso ${soles(d.reembolsoMonto)} · ${NOMBRE_METODO[d.reembolsoMetodo as keyof typeof NOMBRE_METODO] ?? d.reembolsoMetodo ?? "—"}`
                  : "Sin reembolso"}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
