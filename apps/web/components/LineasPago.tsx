"use client";

import { useEffect, useRef, useState } from "react";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { prefiereMovimientoReducido } from "@/components/ComprobanteBotonConfirmar";
import { resumenDePago } from "@/lib/comprobante-linea-tiempo";
import { ETIQUETA_METODO, ETIQUETA_METODO_PAGO, METODO_SALDO_A_FAVOR, soles } from "@/lib/compras-reglas";
import { destinoDelMedio } from "@/lib/destino-de-pago";
import { DestinoDelMedio } from "@/components/DestinoDelMedio";
import type { DatosPagoProveedor } from "@/lib/proveedores-reglas";

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

   Destino (ADR-0134): con `datosProveedor`, bajo cada línea se dice a dónde va la plata según el medio
   (banco + últimos dígitos del CCI, o el celular de Yape/Plin enmascarado) y se avisa —en ámbar— si ese
   medio no calza con lo que el proveedor tiene cargado. Solo avisos: no bloquean, y el N.° de operación
   sigue siendo opcional. Sin `datosProveedor` el componente se ve como siempre.

   Movimiento (ADR-0130, prototipo comprobantes-vivo.html): el medio se elige con FICHAS (no con un desplegable):
   cambian de color con suavidad, sin rebote, y marcan con un punto el medio preferido del proveedor. La línea
   nueva entra con un desliz corto y, al quitarla, se colapsa antes de desaparecer. La frase de abajo
   («Salda el comprobante» / «Quedarán S/ X por pagar») cambia de tono con una transición de color. Los estilos
   viven en `app/estilos/comprobantes-detalle.css`; con movimiento reducido todo ocurre de una vez.
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

const MS_COLAPSO = 240;

// Identidad estable de cada línea (no su posición): así, al quitar una, se colapsa ESA línea y el resto no
// se remonta ni salta. Solo sirve de `key` y para saber cuál animar; no viaja al padre ni a la base.
let contadorDeClaves = 0;
const nuevaClave = () => `linea-${contadorDeClaves++}`;

export function LineasPago({
  lineas,
  onLineas,
  objetivo,
  exacto,
  autoFocus = false,
  id = "lineas-pago",
  saldoFavor = 0,
  datosProveedor = null,
  enlaceFicha,
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
  /** Cómo se le paga al proveedor: activa el destino / los avisos bajo cada línea. Opcional: otras pantallas no lo pasan. */
  datosProveedor?: DatosPagoProveedor | null;
  /** Ruta de la ficha del proveedor: si falta el dato del medio elegido, ofrece «Agregar en su ficha». */
  enlaceFicha?: string;
}) {
  const metodos = saldoFavor > 0 ? [...METODOS, METODO_SALDO_A_FAVOR] : METODOS;
  const conFavor = lineas.some((l) => l.metodo === METODO_SALDO_A_FAVOR);
  const favorUsado = sumaLineasPago(lineas.filter((l) => l.metodo === METODO_SALDO_A_FAVOR));
  const suma = sumaLineasPago(lineas);
  const diferencia = Math.round((objetivo - suma) * 100) / 100;
  const preferido = datosProveedor?.formaPagoPreferida && METODOS.includes(datosProveedor.formaPagoPreferida) ? datosProveedor.formaPagoPreferida : null;
  // La línea recién agregada (entra con desliz) y la que se está quitando (se colapsa antes de salir del estado).
  const [claves, setClaves] = useState<string[]>(() => lineas.map(nuevaClave));
  const [agregada, setAgregada] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  // Si el padre reemplazó las líneas por su cuenta (p. ej. reinició el pago), las que falten usan una clave por posición.
  const claveDe = (n: number, cs: readonly string[] = claves) => cs[n] ?? `posicion-${n}`;
  // Siempre lo más reciente: el colapso dura 240 ms y en ese lapso `lineas` pudo cambiar.
  const ultimas = useRef({ lineas, claves });
  useEffect(() => {
    ultimas.current = { lineas, claves };
  });

  function actualizar(i: number, cambio: Partial<LineaPago>) {
    onLineas(lineas.map((l, n) => (n === i ? { ...l, ...cambio } : l)));
  }
  // La línea nueva arranca con lo que falta: lo normal es "el resto en efectivo".
  function agregar() {
    const clave = nuevaClave();
    setClaves([...lineas.map((_, n) => claveDe(n)), clave]);
    setAgregada(clave);
    onLineas([...lineas, lineaPagoVacia(diferencia > 0 ? diferencia.toFixed(2) : "")]);
  }
  function quitar(i: number) {
    if (quitando !== null) return;
    const sinLinea = () => {
      const { lineas: ls, claves: cs } = ultimas.current;
      setClaves(ls.map((_, n) => claveDe(n, cs)).filter((_, n) => n !== i));
      onLineas(ls.filter((_, n) => n !== i));
    };
    if (prefiereMovimientoReducido()) return sinLinea();
    setQuitando(claveDe(i));
    window.setTimeout(() => {
      sinLinea();
      setQuitando(null);
    }, MS_COLAPSO);
  }

  // «Usar S/ X»: primera línea con el saldo a favor (hasta lo que hay que pagar) y el resto en el medio de siempre.
  function usarSaldoFavor() {
    const usar = Math.round(Math.min(saldoFavor, objetivo) * 100) / 100;
    const resto = Math.round((objetivo - usar) * 100) / 100;
    const nuevas = [{ monto: usar.toFixed(2), metodo: METODO_SALDO_A_FAVOR, referencia: "" }, ...(resto > 0 ? [lineaPagoVacia(resto.toFixed(2))] : [])];
    setClaves(nuevas.map(nuevaClave));
    onLineas(nuevas);
  }

  // Flechas dentro de un grupo de fichas (patrón radiogroup: una parada de tabulador por grupo, no una por ficha).
  function alTeclado(e: React.KeyboardEvent<HTMLButtonElement>, i: number, actual: number) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const siguiente = (actual + delta + metodos.length) % metodos.length;
    actualizar(i, { metodo: metodos[siguiente] });
    const fichas = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]");
    fichas?.[siguiente]?.focus();
  }

  const resumen = resumenDePago({
    objetivo,
    suma,
    exacto,
    lineas: lineas.length,
    saldoFavorUsado: favorUsado,
    saldoFavorDisponible: saldoFavor,
    formato: soles,
  });
  // Sin nada que cubrir y nada escrito no hay frase que decir (p. ej. el total del formulario aún es 0).
  const hayResumen = objetivo > 0 || suma > 0;

  // La columna "Quitar" existe solo cuando hay más de una línea: con una sola, un `auto` vacío igual cobraba
  // su hueco + separación y apretaba los campos dentro de un modal.
  const plantilla = lineas.length > 1 ? "sm:grid-cols-[9.5rem_1fr_auto]" : "sm:grid-cols-[9.5rem_1fr]";

  return (
    <div id={id}>
      {saldoFavor > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-verde/40 bg-verde/[0.06] px-4 py-2.5">
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
      {lineas.map((l, i) => {
        const destino = destinoDelMedio(l.metodo, datosProveedor);
        const actual = Math.max(0, metodos.indexOf(l.metodo));
        const clave = claveDe(i);
        return (
          <div key={clave} className="cd-linea" data-entra={agregada === clave ? "" : undefined} data-quitando={quitando === clave ? "" : undefined}>
            <div className="cd-linea-in">
              <div className="space-y-2.5 pb-4">
                <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={lineas.length > 1 ? `Medio de pago ${i + 1}` : "Medio de pago"}>
                  {metodos.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={l.metodo === m}
                      tabIndex={l.metodo === m ? 0 : -1}
                      data-preferido={preferido === m}
                      onClick={() => actualizar(i, { metodo: m })}
                      onKeyDown={(e) => alTeclado(e, i, actual)}
                      className="cd-ficha label-cayla rounded-full px-3 py-1 text-[10px] leading-4 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
                    >
                      {ETIQUETA_METODO_PAGO[m]}
                    </button>
                  ))}
                  {i === 0 && preferido && <span className="ml-1 text-[11px] text-tinta/55">· el preferido de este proveedor</span>}
                </div>
                <div className={`grid gap-3 sm:items-end ${plantilla}`}>
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
                  <CampoTexto etiqueta="N.° de operación" mono value={l.referencia} onChange={(e) => actualizar(i, { referencia: e.target.value })} placeholder="Opcional" autoComplete="off" />
                  {lineas.length > 1 && (
                    <div className="pb-[1.15rem] sm:justify-self-end">
                      <button type="button" onClick={() => quitar(i)} className="text-xs text-rojo hover:underline">
                        Quitar
                      </button>
                    </div>
                  )}
                </div>
                {/* A dónde va la plata con este medio, o qué le falta al proveedor. Solo aviso: nunca bloquea el pago. */}
                <DestinoDelMedio key={l.metodo} destino={destino} enlaceFicha={enlaceFicha} />
              </div>
            </div>
          </div>
        );
      })}

      {/* "Agregar otro medio" es un botón con borde, no un enlace chico: que
          un pago pueda repartirse (transferencia + efectivo) es justo lo que
          este bloque existe para permitir, y como texto suelto nadie lo veía. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Boton type="button" peso="fantasma" onClick={agregar} className="px-3 py-1.5 text-[11px]">
          + Agregar otro medio de pago
        </Boton>
        {hayResumen && (
          <p role="status" data-tono={resumen.tono} className="cd-resumen text-xs tabular-nums">
            {resumen.texto}
          </p>
        )}
      </div>
    </div>
  );
}
