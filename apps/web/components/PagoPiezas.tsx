"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { ETIQUETA_METODO, soles } from "@/lib/compras-reglas";

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
