"use client";

import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { ETIQUETA_METODO, ETIQUETA_METODO_PAGO, METODO_SALDO_A_FAVOR, soles } from "@/lib/compras-reglas";
import { sumaLineasPago, type LineaPago } from "@/components/LineasPago";

// Piezas que comparten los dos modales de pago de Por pagar (spike 2026-09-19, ADR-0129): «Pagar juntos»
// (`PagoJuntosModal`, varios comprobantes de un proveedor) y el pago de UN comprobante (`RegistrarPagoModal`, el botón
// «Pagar» de cada fila, el cajón y el detalle). Son dos caminos con dos RPC distintas, pero una sola cara: el diseño del
// spike se define acá una vez, para que no vuelvan a verse «totalmente diferentes».

export type DatosPagoProveedor = {
  banco: string | null;
  cuentaBancaria: string | null;
  telefono: string | null;
  plazoCreditoDias: number | null;
  formaPagoPreferida: string | null;
  /** Lo que el proveedor le debe a CAYLA (saldo a favor), disponible para descontar de este pago. */
  saldoFavor?: number;
};

/** Lo que el modal le cuenta a la lista cuando el pago quedó registrado (para que la pantalla reaccione). */
export type ResultadoPago = {
  /** Comprobantes que quedaron en cero con este pago. */
  pagadas: string[];
  /** Comprobantes que recibieron pago pero todavía deben algo. */
  parciales: string[];
  total: number;
};

/** Píldora de atajo (mismo aire que las de medio de pago, pero en minúscula normal: lleva un monto). */
export const PILDORA = "rounded-full border border-tinta/15 px-3 py-1 text-xs tabular-nums text-tinta/75 transition-colors duration-200 hover:border-rojo hover:text-rojo";

/** El tilde que se DIBUJA (`pathLength="1"`): el estado nuevo se hace en vez de aparecer. */
export function Tilde() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3 shrink-0 fill-none stroke-current" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path pathLength={1} d="M20 6 9 17l-5-5" className="trazo-linea anim-tilde" />
    </svg>
  );
}

/** «Paga por», cuenta y Yape/Plin del proveedor, con cada dato copiable. No dibuja nada si el proveedor no tiene datos. */
export function DatosDelProveedor({ datos }: { datos?: DatosPagoProveedor }) {
  const hayDatos = !!(datos && (datos.formaPagoPreferida || datos.banco || datos.cuentaBancaria || datos.telefono));
  if (!datos || !hayDatos) return null;
  // El acuse de que se copió es el propio botón (✓ Copiado, `DatoCopiable`); solo un fallo merece un aviso.
  async function copiar(valor: string, que: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(valor);
      return true;
    } catch {
      avisar.error(`No se pudo copiar ${que.toLowerCase()}`, { detalle: "Selecciónalo y cópialo a mano." });
      return false;
    }
  }
  return (
    <div className="grid gap-4 rounded-xl border border-sand bg-sand/40 p-4 sm:grid-cols-[1fr_1.5fr_1.2fr]">
      <div>
        <p className="label-cayla text-[10px] text-tinta/55">Paga por</p>
        <p className="mt-1 text-sm text-tinta">
          {datos.formaPagoPreferida ? (ETIQUETA_METODO[datos.formaPagoPreferida] ?? datos.formaPagoPreferida) : "Sin definir"}
          {datos.banco ? ` · ${datos.banco}` : ""}
        </p>
        {datos.plazoCreditoDias != null && <p className="text-xs text-tinta/55">Crédito a {datos.plazoCreditoDias} días</p>}
      </div>
      {datos.cuentaBancaria && <DatoCopiable etiqueta="Cuenta o CCI" valor={datos.cuentaBancaria} onCopiar={() => copiar(datos.cuentaBancaria!, "Cuenta")} />}
      {datos.telefono && <DatoCopiable etiqueta="Yape / Plin" valor={datos.telefono} onCopiar={() => copiar(datos.telefono!, "Teléfono")} />}
    </div>
  );
}

function DatoCopiable({ etiqueta, valor, onCopiar }: { etiqueta: string; valor: string; onCopiar: () => Promise<boolean> }) {
  // «✓ Copiado» durante un momento y vuelve el ícono: el gesto se confirma donde se hizo, sin un aviso aparte.
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1700);
    return () => clearTimeout(t);
  }, [copiado]);
  return (
    <div className="min-w-0">
      <p className="label-cayla text-[10px] text-tinta/55">{etiqueta}</p>
      <p className="mt-1 flex items-center gap-2 text-sm tabular-nums text-tinta">
        <span className="truncate">{valor}</span>
        <button
          type="button"
          onClick={async () => setCopiado(await onCopiar())}
          aria-label={`Copiar ${etiqueta.toLowerCase()}`}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] transition-colors duration-200 ${copiado ? "bg-verde/10 text-verde-profundo" : "text-tinta/55 hover:text-rojo"}`}
        >
          {copiado ? (
            <>
              <Tilde /> Copiado
            </>
          ) : (
            <Copy aria-hidden className="h-3.5 w-3.5" />
          )}
        </button>
      </p>
    </div>
  );
}

/**
 * La confirmación que reemplaza al formulario cuando el pago quedó registrado: el círculo y el tilde se dibujan, cada
 * comprobante aparece con su saldo resultante (en cero, verde) y a los 3.2 s se cierra sola (o con «Listo»). Al cerrarse,
 * la lista hace reaccionar la pantalla. Sin movimiento, es solo la frase y la lista.
 */
export function Confirmacion({
  hecho,
  proveedorNombre,
  credito,
  filas,
  cerrar,
}: {
  hecho: ResultadoPago;
  proveedorNombre: string;
  credito: number;
  filas: { documento: string; saldoFinal: number }[];
  cerrar: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(cerrar, 3200);
    return () => clearTimeout(t);
  }, [cerrar]);
  return (
    <div className="anim-asentar px-2 pb-1 pt-6 text-center">
      <svg aria-hidden viewBox="0 0 64 64" className="mx-auto mb-3 h-16 w-16 fill-none stroke-verde" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle pathLength={1} cx="32" cy="32" r="29" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 0 }} />
        <path pathLength={1} d="M19 33l9 9 17-20" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 8 }} />
      </svg>
      <h3 className="font-display text-[28px] leading-tight text-tinta">Pago de {soles(hecho.total)} registrado</h3>
      <p className="mt-1 text-sm text-tinta/65">
        {filas.length === 1 ? "1 comprobante" : `${filas.length} comprobantes`} de {proveedorNombre}, como un solo pago.
        {credito > 0 ? ` Se descontaron ${soles(credito)} de tu saldo a favor.` : ""}
      </p>
      <ul className="mx-auto mt-[18px] max-w-sm text-left">
        {filas.map((f, i) => (
          <li key={f.documento} className="anim-revelar flex items-center justify-between gap-3 border-t border-tinta/10 py-2 text-[13.5px]" style={{ animationDelay: `${900 + i * 90}ms` }}>
            <span className="tabular-nums text-tinta">{f.documento}</span>
            <span className={`flex items-center gap-1.5 tabular-nums ${f.saldoFinal <= 0 ? "text-verde-profundo" : "text-tinta/75"}`}>
              {f.saldoFinal <= 0 ? (
                <>
                  <Tilde /> saldo {soles(0)}
                </>
              ) : (
                `saldo ${soles(f.saldoFinal)}`
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-[22px] flex justify-center">
        <Boton type="button" peso="primario" onClick={cerrar}>
          Listo
        </Boton>
      </div>
    </div>
  );
}

/**
 * Las píldoras de «Medio de pago» del spike: una sola elegida, la elegida en tinta. Con `conFavor` suma «Saldo a favor» (el
 * proveedor le debe algo a CAYLA) al final de las de siempre.
 */
export function PastillasMedio({ valor, onValor, conFavor = false, etiqueta = "Medio de pago" }: { valor: string; onValor: (m: string) => void; conFavor?: boolean; etiqueta?: string }) {
  const medios = conFavor ? [...Object.keys(ETIQUETA_METODO), METODO_SALDO_A_FAVOR] : Object.keys(ETIQUETA_METODO);
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={etiqueta}>
      {medios.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => onValor(v)}
          className={`rounded-full border px-3 py-1 text-[12.5px] leading-5 transition-colors duration-200 ${
            valor === v ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-tinta/[0.04] text-tinta/75 hover:border-rojo hover:text-rojo"
          }`}
        >
          {ETIQUETA_METODO_PAGO[v] ?? v}
        </button>
      ))}
    </div>
  );
}

const COLORES_REPARTO = ["bg-tinta", "bg-tinta/55", "bg-tinta/30", "bg-tinta/15"];

/**
 * «Medio de pago · Referencia · Fecha del pago» del spike, pero un pago puede REPARTIRSE en varios medios (5,000 por
 * transferencia + 3,000 en efectivo): el spike solo permitía uno y el ERP siempre ha permitido varios (`registrar_pagos_compra`,
 * todo o nada).
 *   · Con UN medio es exactamente el del spike: píldoras, referencia y fecha en una fila.
 *   · «＋ Dividir en otro medio» agrega una línea que arranca con lo que falta; con dos o más, cada línea lleva su monto, sus
 *     píldoras y su referencia, y una barra muestra cómo se reparte el pago. Las líneas entran con el gesto corto.
 * La fecha es una sola para todo el pago. El componente solo dibuja y avisa; la regla (no pasarse del saldo, el saldo a favor)
 * la aplica quien lo usa y, al final, la base.
 */
export function MediosDePago({
  lineas,
  onLineas,
  objetivo,
  saldoFavor = 0,
  fecha,
  onFecha,
  id = "pago",
}: {
  lineas: LineaPago[];
  onLineas: (l: LineaPago[]) => void;
  /** Lo que hay que cubrir (el saldo del comprobante). */
  objetivo: number;
  saldoFavor?: number;
  fecha: string;
  onFecha: (f: string) => void;
  /** Prefijo de los ids (`<id>-monto-0`…), para enfocar desde un aviso. */
  id?: string;
}) {
  const suma = sumaLineasPago(lineas);
  const falta = Math.round((objetivo - suma) * 100) / 100;
  const conFavor = lineas.some((l) => l.metodo === METODO_SALDO_A_FAVOR);
  const favorUsado = sumaLineasPago(lineas.filter((l) => l.metodo === METODO_SALDO_A_FAVOR));
  const varios = lineas.length > 1;
  const cambiar = (i: number, cambio: Partial<LineaPago>) => onLineas(lineas.map((l, n) => (n === i ? { ...l, ...cambio } : l)));
  const agregar = () => onLineas([...lineas, { monto: falta > 0 ? falta.toFixed(2) : "", metodo: "efectivo", referencia: "" }]);
  // «Usar S/ X»: primera línea con el saldo a favor (hasta lo que hay que pagar) y el resto en el medio de siempre.
  const usarFavor = () => {
    const usar = Math.round(Math.min(saldoFavor, objetivo) * 100) / 100;
    const resto = Math.round((objetivo - usar) * 100) / 100;
    onLineas([{ monto: usar.toFixed(2), metodo: METODO_SALDO_A_FAVOR, referencia: "" }, ...(resto > 0 ? [{ monto: resto.toFixed(2), metodo: lineas[0]?.metodo === METODO_SALDO_A_FAVOR ? "transferencia" : (lineas[0]?.metodo ?? "transferencia"), referencia: "" }] : [])]);
  };
  const fechaCampo = <CampoFecha etiqueta="Fecha del pago" valor={fecha} onValor={onFecha} required />;

  return (
    <div className="space-y-3" id={id}>
      {!varios ? (
        <div className="grid gap-5 sm:grid-cols-[1.7fr_1fr_1fr]">
          <div>
            <p className="label-cayla text-[11px] text-tinta/65">Medio de pago</p>
            <div className="mt-2">
              <PastillasMedio valor={lineas[0].metodo} onValor={(m) => cambiar(0, { metodo: m })} conFavor={saldoFavor > 0} />
            </div>
          </div>
          <CampoTexto etiqueta="Referencia" value={lineas[0].referencia} onChange={(e) => cambiar(0, { referencia: e.target.value })} placeholder="Op. 00871234" autoComplete="off" />
          {fechaCampo}
        </div>
      ) : (
        <>
          <p className="label-cayla text-[11px] text-tinta/65">
            Medios de pago <span className="font-normal normal-case tracking-normal text-tinta/55">· el pago se reparte en {lineas.length}</span>
          </p>
          <div className="card-cayla divide-y divide-tinta/10 overflow-hidden">
            {lineas.map((l, i) => (
              <div key={i} className="anim-revelar grid items-start gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[7.5rem_1fr_9.5rem_1.75rem]">
                <label className="block">
                  <span className="label-cayla mb-1 block text-[10px] text-tinta/55">{`Monto ${i + 1}`}</span>
                  <input
                    id={`${id}-monto-${i}`}
                    inputMode="decimal"
                    value={l.monto}
                    onChange={(e) => cambiar(i, { monto: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    aria-label={`Monto del medio ${i + 1}`}
                    className="w-full rounded-lg border border-tinta/25 bg-papel px-2.5 py-1.5 text-right text-sm tabular-nums text-tinta outline-none transition-colors duration-200 focus:border-rojo"
                  />
                </label>
                <div>
                  <span className="label-cayla mb-1 block text-[10px] text-tinta/55">Medio</span>
                  <PastillasMedio valor={l.metodo} onValor={(m) => cambiar(i, { metodo: m })} conFavor={saldoFavor > 0} etiqueta={`Medio de pago ${i + 1}`} />
                </div>
                <CampoTexto etiqueta="Referencia" value={l.referencia} onChange={(e) => cambiar(i, { referencia: e.target.value })} placeholder="Op. 00871234" autoComplete="off" />
                <button
                  type="button"
                  onClick={() => onLineas(lineas.filter((_, n) => n !== i))}
                  aria-label={`Quitar el medio ${i + 1}`}
                  className="mt-5 grid h-7 w-7 place-items-center rounded-full text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Cómo se reparte el pago: un tramo por medio; crece y se reacomoda al escribir. */}
          <div aria-hidden className="flex h-[5px] gap-0.5">
            {lineas.map((l, i) => (
              <i key={i} className={`block h-full min-w-0 basis-0 rounded-sm transition-[flex-grow] duration-500 ease-cayla ${COLORES_REPARTO[Math.min(i, COLORES_REPARTO.length - 1)]}`} style={{ flexGrow: Math.max(0, Number(l.monto) || 0) }} />
            ))}
          </div>
          <div className="w-full sm:w-44">{fechaCampo}</div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={agregar} className={`${PILDORA} border-dashed hover:border-solid`}>
          ＋ {varios ? "Agregar otro medio" : "Dividir en otro medio"}
        </button>
        {saldoFavor > 0 && !conFavor && (
          <button type="button" onClick={usarFavor} className={`${PILDORA} border-verde/40 text-verde-profundo hover:border-verde hover:text-verde-profundo`}>
            Usar {soles(Math.min(saldoFavor, objetivo))} a favor
          </button>
        )}
        {varios && (
          <p className={`text-xs tabular-nums ${falta < 0 ? "text-rojo" : "text-tinta/65"}`} aria-live="polite">
            Suman <b className="font-semibold text-tinta"><CifraQueCuenta valor={suma} formato="soles" /></b> ·{" "}
            {falta < 0 ? `se pasan por ${soles(-falta)}` : falta === 0 ? "saldan el comprobante" : `quedarán ${soles(falta)} por pagar`}
          </p>
        )}
        {favorUsado > saldoFavor + 0.005 && <p className="w-full text-xs text-rojo">Usas {soles(favorUsado)} de saldo a favor y solo tienes {soles(saldoFavor)}.</p>}
      </div>
    </div>
  );
}
