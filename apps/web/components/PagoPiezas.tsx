"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Copy, X } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { ETIQUETA_METODO, ETIQUETA_METODO_PAGO, METODO_SALDO_A_FAVOR, soles } from "@/lib/compras-reglas";
import { sumaLineasPago, type LineaPago } from "@/components/LineasPago";

// Piezas que comparten los dos modales de pago de Por pagar (spike 2026-09-19, ADR-0131): «Pagar juntos»
// (`PagoJuntosModal`, varios comprobantes de un proveedor) y el pago de UN comprobante (`RegistrarPagoModal`, el botón
// «Pagar» de cada fila, el cajón y el detalle). Son dos caminos con dos RPC distintas, pero una sola cara: el diseño del
// spike se define acá una vez, para que no vuelvan a verse «totalmente diferentes».

export type DatosPagoProveedor = {
  /** Para llevar a su ficha cuando falta un dato de pago. */
  proveedorId: string;
  banco: string | null;
  /** Número de cuenta del banco (texto libre). */
  cuentaBancaria: string | null;
  /** Código de Cuenta Interbancario: 20 dígitos (ADR-0134 de Proveedores). */
  cci: string | null;
  /** El celular al que se yapea/plinea, 9 dígitos: NO es el WhatsApp del contacto. */
  celularBilletera: string | null;
  /** Qué app tiene ese celular: `yape`, `plin` o ambas. */
  billeteras: string[] | null;
  /** El nombre que muestra el banco/Yape al pagar: quien paga lo compara antes de confirmar. */
  titular: string | null;
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

// El acuse de que se copió es el propio botón (✓ Copiado, `DatoCopiable`); solo un fallo merece un aviso.
async function copiarAlPortapapeles(valor: string, que: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(valor);
    return true;
  } catch {
    avisar.error(`No se pudo copiar ${que.toLowerCase()}`, { detalle: "Selecciónalo y cópialo a mano." });
    return false;
  }
}

/**
 * La franja de arriba: cómo suele pagársele a este proveedor y a cuántos días. Los DATOS para pagar (cuenta, CCI, celular…) ya no
 * están aquí, todos juntos: aparecen debajo del medio que se elige (`DatosDelMedio`), que es cuando hacen falta. No dibuja nada si
 * no hay nada que decir.
 */
export function DatosDelProveedor({ datos }: { datos?: DatosPagoProveedor }) {
  if (!datos || (!datos.formaPagoPreferida && datos.plazoCreditoDias == null)) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 rounded-xl border border-sand bg-sand/40 px-4 py-3">
      <div>
        <p className="label-cayla text-[10px] text-tinta/55">Paga por</p>
        <p className="mt-0.5 text-sm text-tinta">
          {datos.formaPagoPreferida ? (ETIQUETA_METODO[datos.formaPagoPreferida] ?? datos.formaPagoPreferida) : "Sin definir"}
          {datos.banco ? ` · ${datos.banco}` : ""}
        </p>
      </div>
      {datos.plazoCreditoDias != null && (
        <div>
          <p className="label-cayla text-[10px] text-tinta/55">Crédito</p>
          <p className="mt-0.5 text-sm text-tinta">A {datos.plazoCreditoDias} días</p>
        </div>
      )}
    </div>
  );
}

const cciConGuiones = (c: string) => (c.length === 20 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6, 18)} ${c.slice(18)}` : c);
const celularConEspacios = (c: string) => (c.length === 9 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}` : c);

/** Un dato de pago que NO se copia (banco, titular). */
function DatoSimple({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="min-w-0">
      <p className="label-cayla text-[10px] text-tinta/55">{etiqueta}</p>
      <p className="mt-1 truncate text-sm text-tinta">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] leading-snug text-tinta/55">{nota}</p>}
    </div>
  );
}

/**
 * Los datos para pagar POR EL MEDIO ELEGIDO (pedido de Felipe, 2026-09-19): al elegir Transferencia se ve el banco, la cuenta, el CCI y
 * el titular; al elegir Yape o Plin, el celular de ESA billetera (no el WhatsApp del contacto); Efectivo lo dice; Otro no muestra nada.
 * Cada dato se copia con «✓ Copiado». Si falta el dato que ese medio necesita, se dice y se ofrece completarlo en la ficha del
 * proveedor (en otra pestaña, para no perder el pago a medio hacer): mejor eso que pagar a un destino que nadie verificó.
 * El titular es el control anti-error: el nombre que muestra el banco o Yape debe coincidir antes de confirmar.
 * `key={medio}` en quien lo dibuja para que al cambiar de medio el panel se vuelva a asentar.
 */
export function DatosDelMedio({ medio, datos, saldoFavor = 0 }: { medio: string; datos?: DatosPagoProveedor; saldoFavor?: number }) {
  if (medio === "otro") return null;
  // Sin datos del proveedor no se sabe si falta algo: mejor callar que afirmar «no tiene registrado» sin haber mirado.
  if (!datos && medio !== "efectivo" && medio !== METODO_SALDO_A_FAVOR) return null;
  const ficha = datos ? `/compras/proveedores/${datos.proveedorId}` : null;
  const falta = (que: string) => (
    <p className="text-sm text-tinta/75">
      Todavía no se cargó {que} de este proveedor.{" "}
      {ficha && (
        <Link href={ficha} target="_blank" className="label-cayla text-[11px] text-rojo hover:underline">
          Agregarlo en su ficha →
        </Link>
      )}
    </p>
  );
  let titulo = `Datos para ${ETIQUETA_METODO_PAGO[medio] ?? medio}`;
  let cuerpo: ReactNode = null;

  if (medio === "transferencia" || medio === "deposito") {
    const cuenta = datos?.cuentaBancaria;
    const cci = datos?.cci;
    // Depósito en ventanilla: pide el número de cuenta del banco; la transferencia interbancaria, el CCI. Se muestra lo que haya.
    cuerpo = cuenta || cci ? (
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {datos?.banco && <DatoSimple etiqueta="Banco" valor={datos.banco} />}
        {datos?.titular && <DatoSimple etiqueta="Titular" valor={datos.titular} nota="Compáralo con el nombre que muestra el banco antes de confirmar." />}
        {cuenta && <DatoCopiable etiqueta="Cuenta" valor={cuenta} onCopiar={() => copiarAlPortapapeles(cuenta, "Cuenta")} />}
        {cci && <DatoCopiable etiqueta="CCI" valor={cciConGuiones(cci)} onCopiar={() => copiarAlPortapapeles(cci, "CCI")} />}
      </div>
    ) : (
      falta(medio === "transferencia" ? "la cuenta ni el CCI" : "el número de cuenta")
    );
  } else if (medio === "yape" || medio === "plin") {
    const celular = datos?.celularBilletera;
    const tiene = !!celular && !!datos?.billeteras?.includes(medio);
    const otra = medio === "yape" ? "plin" : "yape";
    cuerpo = tiene ? (
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <DatoCopiable etiqueta={`Celular ${ETIQUETA_METODO_PAGO[medio]}`} valor={celularConEspacios(celular!)} onCopiar={() => copiarAlPortapapeles(celular!, "Celular")} />
        {datos?.titular && <DatoSimple etiqueta="Titular" valor={datos.titular} nota={`Compáralo con el nombre que muestra ${ETIQUETA_METODO_PAGO[medio]} antes de confirmar.`} />}
      </div>
    ) : celular && datos?.billeteras?.includes(otra) ? (
      <p className="text-sm text-tinta/75">
        Este proveedor cobra por <b className="font-semibold">{ETIQUETA_METODO_PAGO[otra]}</b>, no por {ETIQUETA_METODO_PAGO[medio]}: elige {ETIQUETA_METODO_PAGO[otra]} para ver el celular.
      </p>
    ) : (
      falta(`el celular de ${ETIQUETA_METODO_PAGO[medio]}`)
    );
  } else if (medio === "efectivo") {
    titulo = "Efectivo";
    cuerpo = <p className="text-sm text-tinta/75">Se entrega en mano: no hay cuenta ni número que copiar.</p>;
  } else if (medio === METODO_SALDO_A_FAVOR) {
    titulo = "Saldo a favor";
    cuerpo = <p className="text-sm text-tinta/75">{saldoFavor > 0 ? <>Se descuenta de lo que el proveedor te debe: tienes <b className="font-semibold">{soles(saldoFavor)}</b> disponibles. No sale plata del banco ni de caja.</> : "Este proveedor no tiene saldo a tu favor."}</p>;
  }
  if (!cuerpo) return null;
  return (
    <div className="anim-revelar rounded-xl border border-sand bg-sand/40 px-4 py-3">
      <p className="label-cayla mb-2 text-[10px] text-tinta/55">{titulo}</p>
      {cuerpo}
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
/**
 * `DatosDelMedio` en un hueco de alto fijo: cada medio dibuja algo distinto (la grilla de cuenta y CCI, un aviso, nada)
 * y, si el alto cambiara con la ficha, la ventana se acortaría bajo el mouse y «saltaría» (2026-09-23, ADR-0182; el mismo
 * arreglo que `LineasPago`). Los datos de los otros medios se apilan invisibles en la misma celda: el hueco mide lo del
 * más alto. El visible conserva su `key` para entrar con su animación al cambiar de medio.
 */
function DatosDelMedioEstable({ medio, conFavor, datos, saldoFavor }: { medio: string; conFavor: boolean; datos?: DatosPagoProveedor; saldoFavor: number }) {
  const medios = conFavor ? [...Object.keys(ETIQUETA_METODO), METODO_SALDO_A_FAVOR] : Object.keys(ETIQUETA_METODO);
  return (
    <div className="grid">
      {medios.map((m) =>
        m === medio ? null : (
          <div key={m} aria-hidden inert className="invisible [grid-area:1/1]">
            <DatosDelMedio medio={m} datos={datos} saldoFavor={saldoFavor} />
          </div>
        ),
      )}
      <div className="[grid-area:1/1]">
        <DatosDelMedio key={medio} medio={medio} datos={datos} saldoFavor={saldoFavor} />
      </div>
    </div>
  );
}

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
  datos,
  id = "pago",
  exacto = false,
}: {
  lineas: LineaPago[];
  onLineas: (l: LineaPago[]) => void;
  /** Lo que hay que cubrir (el saldo del comprobante). */
  objetivo: number;
  saldoFavor?: number;
  fecha: string;
  onFecha: (f: string) => void;
  /** Dónde se le paga a este proveedor: bajo cada medio se muestran los datos de ESE medio (`DatosDelMedio`). */
  datos?: DatosPagoProveedor;
  /** Prefijo de los ids (`<id>-monto-0`…), para enfocar desde un aviso. */
  id?: string;
  /**
   * Los medios tienen que sumar EXACTAMENTE `objetivo` (Pagar juntos: una transferencia que ya se repartió entre comprobantes).
   * Sin esto (un solo comprobante) se puede pagar de menos y el resto queda por pagar. En este modo no hay saldo a favor
   * como medio —ese es un interruptor aparte— y, con dos medios, cambiar uno ajusta el otro para que sigan sumando.
   */
  exacto?: boolean;
}) {
  const suma = sumaLineasPago(lineas);
  const falta = Math.round((objetivo - suma) * 100) / 100;
  const conFavor = lineas.some((l) => l.metodo === METODO_SALDO_A_FAVOR);
  const favorUsado = sumaLineasPago(lineas.filter((l) => l.metodo === METODO_SALDO_A_FAVOR));
  const varios = lineas.length > 1;
  const cambiar = (i: number, cambio: Partial<LineaPago>) => {
    const nuevas = lineas.map((l, n) => (n === i ? { ...l, ...cambio } : l));
    // Exacto con dos medios: lo que sube en uno baja en el otro, así siempre suman el pago.
    if (exacto && cambio.monto !== undefined && nuevas.length === 2) {
      const otro = 1 - i;
      const n = Number(cambio.monto);
      if (cambio.monto.trim() !== "" && Number.isFinite(n)) nuevas[otro] = { ...nuevas[otro], monto: Math.max(0, Math.round((objetivo - n) * 100) / 100).toFixed(2) };
    }
    onLineas(nuevas);
  };
  const agregar = () => {
    if (exacto && lineas.length === 1) {
      // Al dividir, el primero conserva todo y el nuevo arranca vacío: quien paga escribe cuánto va en el segundo.
      onLineas([{ ...lineas[0], monto: objetivo.toFixed(2) }, { monto: "", metodo: lineas[0].metodo === "efectivo" ? "transferencia" : "efectivo", referencia: "" }]);
      return;
    }
    onLineas([...lineas, { monto: falta > 0 ? falta.toFixed(2) : "", metodo: "efectivo", referencia: "" }]);
  };
  // «Completar con el último»: lo que falta o sobra para sumar el pago se lo lleva la última línea.
  const completar = () => {
    const ult = lineas.length - 1;
    const otras = sumaLineasPago(lineas.slice(0, ult));
    onLineas(lineas.map((l, n) => (n === ult ? { ...l, monto: Math.max(0, Math.round((objetivo - otras) * 100) / 100).toFixed(2) } : l)));
  };
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
              <PastillasMedio valor={lineas[0].metodo} onValor={(m) => cambiar(0, { metodo: m })} conFavor={!exacto && saldoFavor > 0} />
            </div>
          </div>
          <CampoTexto etiqueta="Referencia" value={lineas[0].referencia} onChange={(e) => cambiar(0, { referencia: e.target.value })} placeholder="Op. 00871234" autoComplete="off" />
          {fechaCampo}
          <div className="sm:col-span-3">
            <DatosDelMedioEstable medio={lineas[0].metodo} conFavor={!exacto && saldoFavor > 0} datos={datos} saldoFavor={saldoFavor} />
          </div>
        </div>
      ) : (
        <>
          <p className="label-cayla text-[11px] text-tinta/65">
            Medios de pago <span className="font-normal normal-case tracking-normal text-tinta/55">· el pago se reparte en {lineas.length}</span>
          </p>
          <div className="card-cayla divide-y divide-tinta/10 overflow-hidden">
            {lineas.map((l, i) => (
              <div key={i} className="anim-revelar relative grid items-start gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[7.5rem_1fr_9.5rem_1.75rem]">
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
                  <PastillasMedio valor={l.metodo} onValor={(m) => cambiar(i, { metodo: m })} conFavor={!exacto && saldoFavor > 0} etiqueta={`Medio de pago ${i + 1}`} />
                </div>
                <CampoTexto etiqueta="Referencia" value={l.referencia} onChange={(e) => cambiar(i, { referencia: e.target.value })} placeholder="Op. 00871234" autoComplete="off" />
                <div className="sm:col-span-4 sm:row-start-2">
                  <DatosDelMedioEstable medio={l.metodo} conFavor={!exacto && saldoFavor > 0} datos={datos} saldoFavor={saldoFavor} />
                </div>
                <button
                  type="button"
                  onClick={() => onLineas(lineas.filter((_, n) => n !== i))}
                  aria-label={`Quitar el medio ${i + 1}`}
                  // En celular la ✕ va arriba a la derecha de la tarjeta (antes quedaba al pie, lejos de lo que quita); desde `sm`, en su columna.
                  className="absolute right-2 top-1.5 grid h-7 w-7 place-items-center rounded-full text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo sm:static sm:mt-5"
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
        {!exacto && saldoFavor > 0 && !conFavor && (
          <button type="button" onClick={usarFavor} className={`${PILDORA} border-verde/40 text-verde-profundo hover:border-verde hover:text-verde-profundo`}>
            Usar {soles(Math.min(saldoFavor, objetivo))} a favor
          </button>
        )}
        {varios && (
          <p className={`text-xs tabular-nums ${falta < 0 ? "text-rojo" : "text-tinta/65"}`} aria-live="polite">
            Suman <b className="font-semibold text-tinta"><CifraQueCuenta valor={suma} formato="soles" /></b> ·{" "}
            {exacto
              ? falta < 0
                ? `se pasan por ${soles(-falta)}`
                : falta === 0
                  ? "cubren el pago"
                  : `faltan ${soles(falta)} para cubrir el pago`
              : falta < 0
                ? `se pasan por ${soles(-falta)}`
                : falta === 0
                  ? "saldan el comprobante"
                  : `quedarán ${soles(falta)} por pagar`}
          </p>
        )}
        {exacto && varios && Math.abs(falta) >= 0.005 && lineas.length > 2 && (
          <button type="button" onClick={completar} className={PILDORA}>
            Completar con el último medio
          </button>
        )}
        {favorUsado > saldoFavor + 0.005 && <p className="w-full text-xs text-rojo">Usas {soles(favorUsado)} de saldo a favor y solo tienes {soles(saldoFavor)}.</p>}
      </div>
    </div>
  );
}
