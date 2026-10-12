"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { filaDeMovimiento, gastoDeLaNota } from "@/lib/caja-movimiento-reglas";
import { fechaHoraLima } from "@/lib/recibo-reglas";
import type { MovimientoCaja } from "@/lib/caja";

const money = (n: number) => "S/" + n.toFixed(2);

/**
 * El detalle de una entrada o una salida del cajón, la hermana de `DetalleVentaModal` (Felipe, 2026-10-12: los gastos
 * salían como «Otro» y al tocarlos no abrían nada).
 *
 * Responde las dos preguntas de quien lo toca: QUÉ FUE (lo que se compró, su categoría, la nota que dejó quien lo
 * registró) y QUÉ LE HIZO AL CAJÓN (ya está sumado o descontado del efectivo que se espera al cerrar). Todo sale del
 * propio movimiento: no pide nada a la base, así que lo ve igual una colaboradora sin el módulo Gastos.
 */
export function DetalleMovimientoCajaModal({
  movimiento: m,
  ubicacionNombre,
  onClose,
}: {
  movimiento: MovimientoCaja;
  ubicacionNombre: string;
  onClose: () => void;
}) {
  const fila = filaDeMovimiento(m);
  const gasto = gastoDeLaNota(m.nota);
  const { fecha, hora } = fechaHoraLima(m.creadoEn);
  const esEgreso = m.tipo === "egreso";

  return (
    <Modal titulo={fila.titulo} subtitulo={`${ubicacionNombre} · ${fecha} ${hora}`} onClose={onClose} conCerrar>
      <div className="space-y-4">
        <div className="card-cayla p-5 text-center">
          <p className={`font-display text-3xl ${esEgreso ? "text-rojo" : "text-verde-profundo"}`}>
            {esEgreso ? "−" : "+"}
            {money(m.monto)}
          </p>
          <p className="mt-1 text-sm text-tinta/70">{esEgreso ? "Salió del cajón, en efectivo" : "Entró al cajón, en efectivo"}</p>
        </div>

        <dl className="card-cayla space-y-2 p-4 text-sm">
          {gasto ? (
            <>
              <Dato etiqueta="Qué se pagó" valor={gasto.descripcion} />
              {gasto.categoria && <Dato etiqueta="Categoría" valor={gasto.categoria} />}
              {gasto.comprobante && <Dato etiqueta="Comprobante" valor={<span className="font-mono">{gasto.comprobante}</span>} />}
            </>
          ) : (
            // El motivo no se repite acá: ya es el título de la hoja.
            fila.detalle && <Dato etiqueta="Qué dice la nota" valor={fila.detalle} />
          )}
          <Dato etiqueta="Lo registró" valor={m.registradoPorNombre ?? "—"} />
          <Dato etiqueta="Hora" valor={hora} />
        </dl>

        <p className="nota-cayla">
          {esEgreso
            ? "Esta salida ya está descontada del efectivo que el cajón espera al cerrar."
            : "Esta entrada ya está sumada al efectivo que el cajón espera al cerrar."}
          {gasto && " Queda registrada en Finanzas ▸ Gastos."}
          {m.esAjuste && " Un ajuste cuadra el cajón con lo que se contó: no es una venta ni un gasto."}
        </p>
      </div>
    </Modal>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-tinta/55">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-tinta">{valor}</dd>
    </div>
  );
}
