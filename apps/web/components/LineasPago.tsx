"use client";

import { CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { ETIQUETA_METODO, soles } from "@/lib/compras-reglas";

/* ====================================================================
   LineasPago · un pago repartido en varios medios (2026-09-14)

   Felipe pidió pagar S/ 8,000 como 5,000 por transferencia + 3,000 en
   efectivo en un solo acto. Este bloque es el mismo en las tres pantallas
   que registran pagos a proveedores: al registrar la factura
   (CompraFormV2), en el detalle y en Por pagar (RegistrarPagoModal). La
   RPC `registrar_pagos_compra` escribe todas las líneas o ninguna.

   `objetivo` es lo que hay que cubrir (el total al contado, el saldo en
   un pago posterior) y `exacto` dice si la suma tiene que ser igual (al
   contado) o solo no pasarse (crédito). El componente solo dibuja y
   avisa; la regla la aplica la base.
   ==================================================================== */

export type LineaPago = { monto: string; metodo: string; referencia: string };

const METODOS = Object.keys(ETIQUETA_METODO);

export function lineaPagoVacia(monto = ""): LineaPago {
  return { monto, metodo: METODOS[0], referencia: "" };
}

export function sumaLineasPago(lineas: readonly LineaPago[]): number {
  return Math.round(lineas.reduce((acc, l) => acc + (Number(l.monto) || 0), 0) * 100) / 100;
}

/** Las líneas listas para la RPC. `null` si alguna no tiene monto válido. */
export function lineasPagoParaRpc(lineas: readonly LineaPago[]): { monto: number; metodo: string; referencia?: string }[] | null {
  if (lineas.some((l) => !(Number(l.monto) > 0))) return null;
  return lineas.map((l) => ({ monto: Number(l.monto), metodo: l.metodo, ...(l.referencia.trim() ? { referencia: l.referencia.trim() } : {}) }));
}

export function LineasPago({
  lineas,
  onLineas,
  objetivo,
  exacto,
  autoFocus = false,
  id = "lineas-pago",
}: {
  lineas: LineaPago[];
  onLineas: (l: LineaPago[]) => void;
  objetivo: number;
  exacto: boolean;
  autoFocus?: boolean;
  /** Prefijo de los ids (`<id>-monto-0`…), para enfocar desde un aviso. */
  id?: string;
}) {
  const suma = sumaLineasPago(lineas);
  const diferencia = Math.round((objetivo - suma) * 100) / 100;
  const excede = diferencia < 0;

  function actualizar(i: number, cambio: Partial<LineaPago>) {
    onLineas(lineas.map((l, n) => (n === i ? { ...l, ...cambio } : l)));
  }
  // La línea nueva arranca con lo que falta: lo normal es "el resto en efectivo".
  function agregar() {
    onLineas([...lineas, lineaPagoVacia(diferencia > 0 ? diferencia.toFixed(2) : "")]);
  }

  return (
    <div id={id} className="space-y-3">
      {lineas.map((l, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end">
          <CampoTexto
            etiqueta={i === 0 ? "Monto" : `Monto ${i + 1}`}
            id={`${id}-monto-${i}`}
            mono
            type="number"
            min={0.01}
            step="0.01"
            value={l.monto}
            onChange={(e) => actualizar(i, { monto: e.target.value })}
            placeholder="0.00"
            autoFocus={autoFocus && i === lineas.length - 1}
          />
          <CampoSelectNativo etiqueta="Medio de pago" value={l.metodo} onChange={(e) => actualizar(i, { metodo: e.target.value })}>
            {METODOS.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_METODO[m]}
              </option>
            ))}
          </CampoSelectNativo>
          <CampoTexto etiqueta="Referencia" mono value={l.referencia} onChange={(e) => actualizar(i, { referencia: e.target.value })} placeholder="N° operación" autoComplete="off" />
          <div className="pb-[1.15rem] sm:justify-self-end">
            {lineas.length > 1 && (
              <button type="button" onClick={() => onLineas(lineas.filter((_, n) => n !== i))} className="text-xs text-rojo">
                Quitar
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button type="button" onClick={agregar} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
          + Agregar otro medio
        </button>
        {lineas.length > 1 || suma !== objetivo ? (
          <p className={`text-xs tabular-nums ${excede ? "text-rojo" : "text-tinta/65"}`}>
            {lineas.length > 1 && <>Suman {soles(suma)} · </>}
            {excede
              ? `Se pasa por ${soles(-diferencia)}.`
              : diferencia === 0
                ? exacto
                  ? "Cubre el total."
                  : "Salda la factura."
                : exacto
                  ? `Falta ${soles(diferencia)} para el total.`
                  : `Quedarán ${soles(diferencia)} por pagar.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
