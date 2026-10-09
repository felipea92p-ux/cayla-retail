"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Printer, WalletCards } from "lucide-react";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { BoletaA4 } from "@/components/BoletaA4";
import { ReciboTermico } from "@/components/ReciboTermico";
import { CorregirPagoModal } from "@/components/CorregirPagoModal";
import { Boton } from "@/components/ui/campos";
import { puedeCorregirPago, ventaACorregir } from "@/lib/corregir-pago-reglas";
import { createClient } from "@/lib/supabase/client";
import { leerVentaDetalle } from "@/lib/venta-detalle";
import { puedeImprimir, type VentaDetalle } from "@/lib/venta-detalle-reglas";
import { ESTADO_ETIQUETA, ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import {
  fechaHoraLima,
  LEY_REDONDEO,
  NOMBRE_METODO,
  TEXTO_REDONDEO,
  textoNumeroRecibo,
} from "@/lib/recibo-reglas";
import { useTituloDeImpresion } from "@/lib/useTituloDeImpresion";

const money = (n: number) => "S/" + n.toFixed(2);

type Carga =
  | { fase: "cargando" }
  | { fase: "error" }
  | { fase: "lista"; detalle: VentaDetalle };
/** Qué raíz de impresión está montada. Solo una a la vez: dos se pisarían. */
type Impresion = "ticket" | "a4" | null;

/**
 * El detalle de una venta ya cerrada: qué se llevó la clienta, cómo pagó (con el vuelto que se
 * le dio) y su comprobante, con el botón para volver a imprimirlo. Se lee de la base al abrir.
 *
 * Al imprimir se monta UNA sola raíz de impresión pegada a `<body>` (portal) y el CSS de
 * `globals.css` oculta todo lo demás.
 */
export function DetalleVentaModal({
  ventaId,
  vendedor,
  ubicacionNombre,
  cargar,
  onClose,
  recorrido,
  pie,
  corregirPago = false,
}: {
  ventaId: string;
  vendedor: string | null;
  ubicacionNombre: string;
  /** Solo para probar con datos de mentira. Debe ser estable (módulo o `useCallback`). */
  cargar?: (ventaId: string) => Promise<VentaDetalle>;
  onClose: () => void;
  /** Ventas ▸ Historial (ADR-0230): el recorrido de la venta, bajo los pagos. Caja y Proformas no lo pasan. */
  recorrido?: ReactNode;
  /** Ventas ▸ Historial: «Qué hacer con esta venta», al pie de la hoja. */
  pie?: ReactNode;
  /** Ventas ▸ Historial (ADR-0365): ofrece «Corregir pago» mientras la caja de la venta siga abierta. Caja y los demás no lo pasan. */
  corregirPago?: boolean;
}) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);
  const [imprimiendo, setImprimiendo] = useState<Impresion>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const router = useRouter();
  // Al reimprimir o guardar como PDF (ticket o A4), el archivo se llama como el comprobante («B004-000004.pdf»).
  const reciboAImprimir = carga.fase === "lista" ? carga.detalle.recibo : null;
  useTituloDeImpresion(
    imprimiendo && reciboAImprimir ? textoNumeroRecibo(reciboAImprimir) : null,
  );

  useEffect(() => {
    let vigente = true;
    const leer =
      cargar ??
      ((id: string) =>
        leerVentaDetalle(createClient(), id, {
          sede: ubicacionNombre,
          vendedor,
        }));
    leer(ventaId).then(
      (detalle) => vigente && setCarga({ fase: "lista", detalle }),
      () => vigente && setCarga({ fase: "error" }),
    );
    return () => {
      vigente = false;
    };
  }, [ventaId, ubicacionNombre, vendedor, cargar, intento]);

  function reintentar() {
    setCarga({ fase: "cargando" });
    setIntento((n) => n + 1);
  }

  // Imprime cuando la raíz ya está montada y sus imágenes decodificadas; termina con
  // `afterprint` (con el respaldo de 4 s por si el navegador no lo emite: sin él la raíz de
  // impresión quedaría montada). `print()` bloquea hasta cerrar el diálogo, así que el
  // temporizador arranca recién al llamarlo.
  useEffect(() => {
    if (!imprimiendo) return;
    let respaldo: number | undefined;
    const terminar = () => {
      window.removeEventListener("afterprint", terminar);
      window.clearTimeout(respaldo);
      setImprimiendo(null);
    };
    const cuadro = requestAnimationFrame(async () => {
      const imagenes = [
        ...document.querySelectorAll<HTMLImageElement>(
          "#comprobante-print img, #boleta-a4-print img",
        ),
      ];
      await Promise.all(imagenes.map((i) => i.decode().catch(() => undefined)));
      window.addEventListener("afterprint", terminar);
      respaldo = window.setTimeout(terminar, 4000);
      window.print();
    });
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("afterprint", terminar);
      window.clearTimeout(respaldo);
    };
  }, [imprimiendo]);

  return (
    <Modal
      conCerrar
      titulo="Detalle de la venta"
      subtitulo={ubicacionNombre}
      onClose={onClose}
      ancho="max-w-lg"
    >
      {(cerrar) => {
        if (carga.fase === "cargando")
          return (
            <p className="py-10 text-center text-sm text-tinta/60">
              Cargando la venta…
            </p>
          );
        if (carga.fase === "error")
          return (
            <div className="space-y-4 py-6 text-center">
              <p className="text-sm text-tinta/80">
                No pudimos cargar esta venta.
              </p>
              <div className="flex justify-center gap-2.5">
                <button
                  type="button"
                  className={botonPrimario}
                  onClick={reintentar}
                >
                  Reintentar
                </button>
              </div>
            </div>
          );

        const d = carga.detalle;
        const { fecha, hora } = fechaHoraLima(d.creadaEn);
        const permiso = d.comprobante
          ? puedeImprimir(d.comprobante.estado)
          : ({
              ok: false,
              motivo: "Esta venta no tiene comprobante.",
            } as const);
        const imprimible = permiso.ok && d.recibo !== null;
        const aCorregir = ventaACorregir(d);
        const corregible = corregirPago
          ? puedeCorregirPago({
              anulada: d.anulada,
              cajaAbierta: d.cajaAbierta,
              cobrado: aCorregir.cobrado,
            })
          : null;
        return (
          <div className="space-y-4">
            <div className="card-cayla p-5 text-center">
              <p className="font-display text-3xl text-tinta">
                {money(d.total)}
              </p>
              <p className="mt-1 text-sm text-tinta/70">
                {d.prendas} {d.prendas === 1 ? "prenda" : "prendas"} · {fecha}{" "}
                {hora}
                {vendedor && ` · ${vendedor}`}
              </p>
            </div>

            {d.comprobante ? (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-tinta">
                  {ETIQUETA_TIPO[
                    d.comprobante.tipo as keyof typeof ETIQUETA_TIPO
                  ] ?? d.comprobante.tipo}{" "}
                  <span className="font-mono">
                    {textoNumeroRecibo(d.comprobante)}
                  </span>
                </span>
                <span className="text-[11px] text-tinta/60">
                  {ESTADO_ETIQUETA[d.comprobante.estado]}
                </span>
              </div>
            ) : (
              <p className="text-sm text-tinta/70">Sin comprobante.</p>
            )}

            <ul className="card-cayla scroll-cayla max-h-56 divide-y divide-sand overflow-y-auto px-4 text-sm">
              {d.lineas.map((l, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-tinta">
                      {l.cantidad} × {l.nombre}
                    </p>
                    <p className="text-[11.5px] text-tinta/55">
                      {[l.detalle, l.codigo].filter(Boolean).join(" · ")}
                      {l.descuentoUnitario > 0 &&
                        ` · dscto. −${money(l.descuentoUnitario)} c/u`}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums text-tinta">
                    {money(l.importe)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="card-cayla space-y-1.5 p-4 text-sm">
              {d.pagos.map((p) => (
                <div key={p.metodo}>
                  <p className="flex justify-between tabular-nums text-tinta/85">
                    <span>{NOMBRE_METODO[p.metodo]}</span>
                    <span>{money(p.monto)}</span>
                  </p>
                  {p.metodo === "efectivo" && p.recibido !== null && (
                    <p className="flex justify-between text-xs tabular-nums text-tinta/60">
                      <span>Recibió {money(p.recibido)}</span>
                      <span>Vuelto {money(p.vuelto)}</span>
                    </p>
                  )}
                </div>
              ))}
              {d.redondeo > 0 && (
                <div>
                  <p className="flex justify-between tabular-nums text-tinta/85">
                    <span>{TEXTO_REDONDEO}</span>
                    <span>{money(d.redondeo)}</span>
                  </p>
                  <p className="text-xs text-tinta/60">{LEY_REDONDEO}</p>
                </div>
              )}
              {d.recibo && d.recibo.tipo !== "nota_venta" && (
                <div className="space-y-0.5 border-t border-sand pt-2 text-xs tabular-nums text-tinta/65">
                  <p className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{money(d.recibo.subtotal)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>IGV (18%)</span>
                    <span>{money(d.recibo.igv)}</span>
                  </p>
                </div>
              )}
              {corregible?.ok && (
                <div className="flex justify-end border-t border-sand pt-2">
                  <Boton
                    type="button"
                    peso="discreto"
                    onClick={() => setCorrigiendo(true)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <WalletCards size={14} aria-hidden /> Corregir pago
                    </span>
                  </Boton>
                </div>
              )}
              {corregible && !corregible.ok && corregible.motivo && (
                <p className="border-t border-sand pt-2 text-xs text-tinta/65">
                  {corregible.motivo}
                </p>
              )}
            </div>

            {corrigiendo && (
              <CorregirPagoModal
                ventaId={d.ventaId}
                comprobante={
                  d.comprobante ? textoNumeroRecibo(d.comprobante) : null
                }
                venta={aCorregir}
                onClose={() => setCorrigiendo(false)}
                onCorregido={() => {
                  setCorrigiendo(false);
                  reintentar();
                  // La fila del historial muestra la forma de pago: se relee la lista.
                  router.refresh();
                }}
              />
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  className={`${botonPrimario} inline-flex items-center justify-center gap-2`}
                  disabled={!imprimible || imprimiendo !== null}
                  onClick={() => setImprimiendo("ticket")}
                >
                  <Printer size={14} aria-hidden /> Imprimir ticket
                </button>
                <button
                  type="button"
                  className={`${botonCancelar} inline-flex items-center justify-center gap-2`}
                  disabled={!imprimible || imprimiendo !== null}
                  onClick={() => setImprimiendo("a4")}
                >
                  <Printer size={14} aria-hidden /> Imprimir{" "}
                  {d.recibo?.tipo === "factura" ? "factura" : "boleta"} A4
                </button>
              </div>
              {!permiso.ok && (
                <p className="text-xs text-tinta/65">{permiso.motivo}</p>
              )}
              {permiso.ok && permiso.leyenda && (
                <p className="text-xs text-ambar-profundo">{permiso.leyenda}</p>
              )}
            </div>

            {recorrido}
            {pie}

            {/* Raíz de impresión: solo una a la vez, pegada a <body> (el CSS oculta el resto). */}
            {imprimiendo === "ticket" &&
              d.recibo &&
              createPortal(<ReciboTermico recibo={d.recibo} />, document.body)}
            {imprimiendo === "a4" &&
              d.recibo &&
              createPortal(
                <div id="boleta-a4-print">
                  <BoletaA4
                    recibo={d.recibo}
                    vendedor={vendedor}
                    hash={d.comprobante?.hash ?? null}
                    leyenda={permiso.ok ? permiso.leyenda : null}
                  />
                </div>,
                document.body,
              )}
          </div>
        );
      }}
    </Modal>
  );
}
