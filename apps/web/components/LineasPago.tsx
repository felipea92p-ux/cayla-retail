"use client";

import { Boton, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { ETIQUETA_METODO, ETIQUETA_METODO_PAGO, METODO_SALDO_A_FAVOR, soles } from "@/lib/compras-reglas";

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

   Saldo a favor (ADR-0111, corrección 2026-09-18): si el proveedor le debe
   algo a CAYLA, `saldoFavor` > 0 ofrece «Saldo a favor» como un medio más
   y un atajo «Usar S/ X» que lo pone como primera línea, con el resto en el
   medio de siempre. La base valida que no se use más de lo disponible.
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
  saldoFavor = 0,
}: {
  lineas: LineaPago[];
  onLineas: (l: LineaPago[]) => void;
  objetivo: number;
  exacto: boolean;
  autoFocus?: boolean;
  /** Prefijo de los ids (`<id>-monto-0`…), para enfocar desde un aviso. */
  id?: string;
  /** Lo que el proveedor le debe a CAYLA; > 0 habilita el medio «Saldo a favor». */
  saldoFavor?: number;
}) {
  const metodos = saldoFavor > 0 ? [...METODOS, METODO_SALDO_A_FAVOR] : METODOS;
  const conFavor = lineas.some((l) => l.metodo === METODO_SALDO_A_FAVOR);
  const favorUsado = sumaLineasPago(lineas.filter((l) => l.metodo === METODO_SALDO_A_FAVOR));
  const favorExcedido = favorUsado > saldoFavor + 0.005;
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

  // «Usar S/ X»: primera línea con el saldo a favor (hasta lo que hay que pagar) y el resto en el medio de siempre.
  function usarSaldoFavor() {
    const usar = Math.round(Math.min(saldoFavor, objetivo) * 100) / 100;
    const resto = Math.round((objetivo - usar) * 100) / 100;
    onLineas([{ monto: usar.toFixed(2), metodo: METODO_SALDO_A_FAVOR, referencia: "" }, ...(resto > 0 ? [lineaPagoVacia(resto.toFixed(2))] : [])]);
  }

  // La columna "Quitar" existe solo cuando hay más de una línea: con una
  // sola, un `auto` vacío igual cobraba su hueco + separación y apretaba
  // el medio y la referencia dentro de un modal.
  const plantilla = lineas.length > 1 ? "sm:grid-cols-[7rem_1fr_1fr_auto]" : "sm:grid-cols-[7rem_1fr_1fr]";

  return (
    <div id={id} className="space-y-3">
      {saldoFavor > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-verde/40 bg-verde/[0.06] px-4 py-2.5">
          <p className="text-sm text-tinta">
            Tienes <b className="font-semibold">{soles(saldoFavor)}</b> a favor con este proveedor.
          </p>
          {!conFavor && (
            <button type="button" onClick={usarSaldoFavor} className="label-cayla text-[11px] text-rojo hover:underline">
              Usar {soles(Math.min(saldoFavor, objetivo))}
            </button>
          )}
        </div>
      )}
      {lineas.map((l, i) => (
        <div key={i} className={`grid gap-3 sm:items-end ${plantilla}`}>
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
          <CampoSelectNativo etiqueta="Medio" value={l.metodo} onChange={(e) => actualizar(i, { metodo: e.target.value })}>
            {metodos.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_METODO_PAGO[m]}
              </option>
            ))}
          </CampoSelectNativo>
          <CampoTexto etiqueta="Referencia" mono value={l.referencia} onChange={(e) => actualizar(i, { referencia: e.target.value })} placeholder="N° operación" autoComplete="off" />
          {lineas.length > 1 && (
            <div className="pb-[1.15rem] sm:justify-self-end">
              <button type="button" onClick={() => onLineas(lineas.filter((_, n) => n !== i))} className="text-xs text-rojo">
                Quitar
              </button>
            </div>
          )}
        </div>
      ))}

      {/* "Agregar otro medio" es un botón con borde, no un enlace chico: que
          un pago pueda repartirse (transferencia + efectivo) es justo lo que
          este bloque existe para permitir, y como texto suelto nadie lo veía. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Boton type="button" peso="fantasma" onClick={agregar} className="px-3 py-1.5 text-[11px]">
          + Agregar otro medio de pago
        </Boton>
        {favorExcedido && <p className="w-full text-xs text-rojo">Usas {soles(favorUsado)} de saldo a favor y solo tienes {soles(saldoFavor)}.</p>}
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
