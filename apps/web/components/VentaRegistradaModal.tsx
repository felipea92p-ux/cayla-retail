"use client";

import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { ReciboTermico } from "@/components/ReciboTermico";
import { money, type VentaOk } from "@/components/PuntoDeVenta";
import { EMISOR, emisorCompleto, type Emisor } from "@/lib/emisor";
import { ETIQUETA_TIPO, ESTADO_ETIQUETA } from "@/lib/comprobantes-reglas";
import { fechaHoraLima, NOMBRE_METODO, textoNumeroRecibo } from "@/lib/recibo-reglas";

type Props = {
  ok: VentaOk;
  ubicacionEtiqueta: string;
  onClose: () => void;
  alCerrarEnfocar: RefObject<HTMLElement | null>;
  /** Solo para probar con datos de mentira; en la app real es `EMISOR` (variables de entorno). */
  emisor?: Emisor;
};

/**
 * «Venta registrada»: lo que la cajera necesita en el momento del cobro — el número del
 * comprobante, cuánto es el VUELTO que tiene que entregar, cómo pagó, a quién se le emitió —
 * y el botón que le pone el papel en la mano. Antes solo decía el total.
 *
 * El botón principal —con el foco, así que Enter— es «Imprimir y nueva venta»: lo que se hace
 * en casi todas las ventas, en un toque. Debajo, las dos salidas raras: «Solo imprimir» (no
 * cierra: si la térmica se atasca o se acaba el rollo se reintenta sin volver a buscar la
 * venta) y «Sin imprimir» (la clienta no quiere el papel; Esc hace lo mismo). El recibo va en
 * un portal pegado a `<body>` y el CSS de impresión (`globals.css`) oculta todo lo demás — por
 * eso Ctrl+P con este modal abierto también imprime el comprobante y no la pantalla de Vender.
 *
 * Una venta guardada sin conexión no tiene comprobante todavía (no hay serie ni número hasta
 * que suba): ahí no hay nada que imprimir y se conserva el mensaje de siempre.
 */
export function VentaRegistradaModal({ ok, ubicacionEtiqueta, onClose, alCerrarEnfocar, emisor = EMISOR }: Props) {
  const r = ok.recibo;
  const fh = r ? fechaHoraLima(r.emitidoEn) : null;
  const sinDatosFiscales = r !== null && !emisorCompleto(emisor);

  /** Imprime y, cuando el navegador avisa que terminó (`afterprint`: con el diálogo, al cerrarlo;
   *  en modo `--kiosk-printing`, apenas manda el trabajo a la impresora), cierra el modal. Cerrar
   *  ANTES desmontaría el recibo del `<body>` y no habría nada que imprimir. El temporizador es el
   *  respaldo por si el navegador no emite `afterprint`: sin él la caja quedaría trabada. */
  function imprimirYSeguir(cerrar: () => void) {
    let hecho = false;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      window.removeEventListener("afterprint", terminar);
      clearTimeout(respaldo);
      cerrar();
    };
    window.addEventListener("afterprint", terminar);
    const respaldo = setTimeout(terminar, 4000);
    window.print();
  }

  return (
    <Modal
      titulo={ok.offline ? "Venta guardada sin conexión" : "Venta registrada"}
      subtitulo={ubicacionEtiqueta}
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
      ancho={r ? "max-w-md" : "max-w-sm"}
    >
      {(cerrar) => (
        <div className="space-y-4">
          <div className={`card-cayla p-5 text-center ${ok.offline ? "border-ambar/30" : ""}`}>
            <p className={`label-cayla text-[11px] ${ok.offline ? "text-ambar-profundo" : "text-verde-profundo"}`}>
              {ok.offline ? "Guardada en este equipo" : "Listo"}
            </p>
            <p className="font-display mt-2 text-3xl text-tinta">{money(ok.total)}</p>
            <p className="mt-1 text-sm text-tinta/70">
              {ok.prendas} {ok.prendas === 1 ? "prenda" : "prendas"}
              {fh && ` · ${fh.fecha} ${fh.hora}`}
            </p>
          </div>

          {ok.offline && (
            <p className="text-center text-xs text-tinta/65">
              Sin internet: quedó guardada en este equipo y sube sola cuando vuelva la conexión. No se puede emitir comprobante todavía.
            </p>
          )}

          {r && (
            <>
              {/* El vuelto va primero y grande: es lo que la cajera tiene que hacer AHORA con
                  las manos, antes de imprimir nada. */}
              {r.vueltoTotal > 0 && (
                <div className="flex items-baseline justify-between rounded-xl border border-tinta/15 bg-papel px-4 py-3">
                  <span className="label-cayla text-[11px] text-tinta/70">Entregar vuelto</span>
                  <span className="font-display text-3xl text-tinta">{money(r.vueltoTotal)}</span>
                </div>
              )}

              <div className="card-cayla space-y-2.5 p-4 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-tinta">
                    {ETIQUETA_TIPO[r.tipo]} <span className="font-mono">{textoNumeroRecibo(r)}</span>
                  </span>
                  <span className="text-[11px] text-tinta/60">{ok.estado ? ESTADO_ETIQUETA[ok.estado] : "Emitida"}</span>
                </div>
                {/* La nota de venta no desglosa IGV (ADR-0164). */}
                {r.tipo !== "nota_venta" && <div className="space-y-0.5 border-t border-sand pt-2.5 text-xs text-tinta/70">
                  <p className="flex justify-between tabular-nums">
                    <span>Subtotal</span>
                    <span>{money(r.subtotal)}</span>
                  </p>
                  <p className="flex justify-between tabular-nums">
                    <span>IGV (18%)</span>
                    <span>{money(r.igv)}</span>
                  </p>
                </div>}
                <div className="space-y-0.5 border-t border-sand pt-2.5 text-xs">
                  {r.pagos.map((p) => (
                    <p key={p.metodo} className="flex justify-between tabular-nums text-tinta/80">
                      <span>{NOMBRE_METODO[p.metodo]}</span>
                      <span>{money(p.monto)}</span>
                    </p>
                  ))}
                </div>
                <p className="border-t border-sand pt-2.5 text-xs text-tinta/70">
                  Cliente:{" "}
                  <span className="text-tinta">
                    {r.cliente.nombre?.trim() || "Cliente varios"}
                    {r.cliente.tipoDoc !== "sin_documento" && r.cliente.numDoc ? ` · ${r.cliente.tipoDoc === "ruc" ? "RUC" : "DNI"} ${r.cliente.numDoc}` : ""}
                  </span>
                </p>
              </div>

              <details className="group rounded-xl border border-sand text-xs">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-tinta/80">
                  <span>Ver las {r.lineas.length === 1 ? "1 línea" : `${r.lineas.length} líneas`} del comprobante</span>
                  <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <ul className="scroll-cayla max-h-40 space-y-1.5 overflow-y-auto border-t border-sand px-4 py-2.5">
                  {r.lineas.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 tabular-nums">
                      <span className="min-w-0 truncate text-tinta/80">
                        {l.cantidad} × {l.descripcion}
                      </span>
                      <span className="shrink-0">{money(l.importe)}</span>
                    </li>
                  ))}
                </ul>
              </details>

              {sinDatosFiscales && (
                <p role="alert" className="rounded-lg border border-ambar/40 bg-ambar/10 px-3 py-2 text-xs text-ambar-profundo">
                  Faltan el RUC y la razón social de CAYLA en la configuración: el ticket sale sin ellos y no sirve para entregarlo como
                  comprobante. Configura <span className="font-mono">NEXT_PUBLIC_EMISOR_RUC</span> y{" "}
                  <span className="font-mono">NEXT_PUBLIC_EMISOR_RAZON_SOCIAL</span>.
                </p>
              )}
            </>
          )}

          {!ok.offline && !r && (
            <p className="text-center text-xs text-tinta/65">
              La venta quedó registrada, pero no se pudo leer su comprobante para imprimirlo. Búscala en «Ventas de hoy» o en Facturación.
            </p>
          )}
          {!ok.offline && (
            <p className="text-center text-xs text-tinta/65">Ya está descontada del stock de {ubicacionEtiqueta} y aparece abajo, en «Ventas de hoy».</p>
          )}

          {r ? (
            <div className="space-y-2">
              {/* Lo que se hace en casi todas las ventas, en UN toque y con Enter (el foco ya está
                  acá): imprime y deja la caja lista para la siguiente clienta. */}
              <button
                type="button"
                autoFocus
                onClick={() => imprimirYSeguir(cerrar)}
                className={`${botonPrimario} flex w-full items-center justify-center gap-2 whitespace-nowrap`}
              >
                <Printer className="h-4 w-4" aria-hidden />
                Imprimir y nueva venta
              </button>
              {/* Las dos salidas menos comunes, más discretas: reintentar el papel sin salir
                  (se atascó, se acabó el rollo) o seguir sin imprimir (la clienta no lo quiere). */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => window.print()} className={botonCancelar}>
                  Solo imprimir
                </button>
                <button type="button" onClick={cerrar} className={botonCancelar}>
                  Sin imprimir
                </button>
              </div>
              <p className="text-center text-[11px] text-tinta/55">Enter imprime y abre una venta nueva · Esc sigue sin imprimir</p>
            </div>
          ) : (
            <button type="button" autoFocus onClick={cerrar} className={`${botonPrimario} w-full`}>
              Nueva venta
            </button>
          )}

          {r && createPortal(<ReciboTermico recibo={r} emisor={emisor} />, document.body)}
        </div>
      )}
    </Modal>
  );
}
