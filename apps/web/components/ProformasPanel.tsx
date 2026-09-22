"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Proforma } from "@/lib/proformas";
import type { TipoComprobante } from "@/lib/comprobantes-reglas";
import { tipoDocumentoDeCliente } from "@/lib/comprobantes-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { coincide } from "@/lib/facturacion-busqueda";
import { camposDeBusquedaDeLaProforma, chipDeLaProforma, confirmacionDeConversion, detalleDeLaProforma, ordenarProformas } from "@/lib/facturacion-proformas-reglas";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { Ayuda } from "@/components/Ayuda";
import { SinCoincidencias } from "@/components/SinCoincidencias";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Boton, Segmentado } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Las columnas de la lista, según el ancho DE LA TARJETA (container queries) y no el de la ventana,
// igual que en Comprobantes y en «Actividad de hoy»: con el menú lateral desplegado, una ventana de
// 768 px deja ~480 px de contenido. Desde 640 px de tarjeta, una tabla; por debajo, filas apiladas.
const COLUMNAS = "@min-[640px]:grid @min-[640px]:grid-cols-[72px_minmax(0,1.2fr)_100px_minmax(0,1.2fr)]";

// Proforma / nota de venta: NO es un comprobante de pago (Art. 2, RS 007-99/SUNAT
// — ver ADR-0007). Sirve para cotizar o reservar antes de que la clienta decida
// comprar. Por eso vive en su propio panel, con su propia lista, y "convertir"
// crea un comprobante NUEVO — nunca actualiza el estado de la proforma a boleta.
//
// Excepciones primero (hallazgo Oracle, Ronda 2): las que vencen antes se muestran arriba de las
// demás, no detrás de un filtro que haya que recordar aplicar — es la clienta que puede volver
// hoy a comprar, la que más importa ver primero. El orden, el chip y la línea de detalle de cada
// fila salen de `lib/facturacion-proformas-reglas.ts`; «Nueva proforma» vive en la cabecera de
// Facturación (`FacturacionCabecera`) y las tarjetas de arriba las dibuja `ProformasTarjetas`.
export function ProformasPanel({ proformas, periodo, ahora }: { proformas: Proforma[]; periodo: string; ahora: Date }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ convertir: Proforma } | null>(null);
  const [loading, setLoading] = useState(false);
  // Convertir una proforma emite un comprobante: pide Responsable (ADR-0161, B4).
  const responsable = useResponsable();

  // Formulario de conversión
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [convertirNombre, setConvertirNombre] = useState("");
  const clienteTipoDoc = tipoDocumentoDeCliente(tipo, clienteNumDoc);

  // Una proforma VENCIDA todavía se puede convertir (la base no lo impide), pero sale con el precio de la
  // cotización: antes de emitir hay que decir que sí, de forma consciente (decisión de Felipe, 2026-09-21).
  const [confirmoVencida, setConfirmoVencida] = useState(false);
  const confirmacion = modal ? confirmacionDeConversion(modal.convertir, ahora) : null;
  const faltaConfirmar = confirmacion !== null && !confirmoVencida;

  const { texto: busqueda } = useFacturacionBusqueda();
  const proformasOrdenadas = ordenarProformas(proformas).filter((p) => coincide(camposDeBusquedaDeLaProforma(p), busqueda));

  function cerrarModal() {
    setModal(null);
    setClienteNumDoc("");
    setConvertirNombre("");
    setTipo("boleta");
    setConfirmoVencida(false);
  }

  async function onConvertir(e: React.FormEvent, proforma: Proforma) {
    e.preventDefault();
    if (faltaConfirmar || !responsable.listo) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("convertir_proforma_a_comprobante", {
        p_proforma_id: proforma.id,
        p_tipo: tipo,
        p_cliente_tipo_doc: clienteTipoDoc,
        p_cliente_num_doc: clienteNumDoc || undefined,
        p_cliente_nombre: convertirNombre || proforma.cliente_nombre || undefined,
      }),
      responsable.firma(),
    );
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "convertir la proforma en comprobante"));
      setLoading(false);
      return;
    }
    setLoading(false);
    avisar.exito("Proforma convertida en comprobante", { detalle: "Búscalo en Comprobantes para transmitirlo." });
    cerrarModal();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* `overflow-hidden` solo con filas (ver el mismo comentario en ComprobantesPanel): sin ellas la tarjeta es baja y
          recortaría el globo de ayuda del encabezado. */}
      <div className={`card-cayla anim-sube @container ${proformasOrdenadas.length > 0 ? "overflow-hidden" : ""}`} style={{ "--i": 6 } as CSSProperties}>
        <div className="px-5 pt-[18px] pb-3.5">
          <p className="label-cayla text-[11px] text-tinta/65">
            Proformas
            <Ayuda titulo="Proforma / nota de venta">
              No es un comprobante de pago — no la reconoce SUNAT ni consume un número de serie.
              Sirve para cotizar o reservar antes de que la clienta decida comprar. Cuando compra
              de verdad, la conviertes a boleta o factura y ahí nace el comprobante real.
            </Ayuda>
          </p>
          <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">Todas las proformas</h2>
          <p className="mt-0.5 text-xs text-tinta/65">
            Las vigentes de cualquier mes, más las que se hicieron {periodo}. Las que vencen antes van primero.
          </p>
        </div>

        {proformas.length === 0 ? (
          <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Sin proformas {periodo}.</p>
        ) : proformasOrdenadas.length === 0 ? (
          <SinCoincidencias />
        ) : (
          <>
            <div className={`label-cayla hidden gap-x-4 border-t border-tinta/10 px-5 py-2 text-[11px] text-tinta/65 ${COLUMNAS}`}>
              <span>Fecha</span>
              <span>Cliente</span>
              <span className="text-right">Total</span>
              <span>Estado</span>
            </div>

            {proformasOrdenadas.map((p) => {
              const chip = chipDeLaProforma(p);
              const detalle = detalleDeLaProforma(p, ahora);
              const { dia, hora } = diaYHoraLima(p.created_at);
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-2 border-t border-tinta/10 px-5 py-3 transition-colors duration-150 hover:bg-tinta/[0.025] @min-[640px]:items-center @min-[640px]:gap-x-4 @min-[640px]:gap-y-0 ${COLUMNAS}`}
                >
                  <div className="flex items-baseline gap-2 @min-[640px]:block">
                    <p className="font-display text-lg leading-tight tabular-nums text-tinta">{dia}</p>
                    <p className="label-cayla text-[10px] text-tinta/65 @min-[640px]:mt-0.5">{hora}</p>
                  </div>

                  <p className="min-w-0 truncate text-[15px] leading-normal text-tinta">{p.cliente_nombre ?? "Cliente varios"}</p>

                  <p className="font-display text-lg leading-tight tabular-nums text-tinta @min-[640px]:text-right">{soles(Number(p.total))}</p>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <Chip tono={chip.tono}>{chip.texto}</Chip>
                      {detalle && (
                        <p className={`mt-1.5 text-[13px] leading-snug ${detalle.urgente ? "font-semibold text-ambar-profundo" : "text-tinta/65"}`}>{detalle.texto}</p>
                      )}
                    </div>
                    {p.estado === "vigente" && (
                      <BotonCompacto variante="fila" onClick={() => setModal({ convertir: p })}>
                        Convertir
                      </BotonCompacto>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ==================== Modal: convertir a comprobante ==================== */}
      {modal && (
        <Modal titulo="Convertir a comprobante" onClose={cerrarModal}>
          <form onSubmit={(e) => onConvertir(e, modal.convertir)} className="mt-5 space-y-2">
            <p className="text-xs text-tinta/75">
              {modal.convertir.cliente_nombre ?? "Cliente varios"} · {soles(Number(modal.convertir.total))}
            </p>

            {confirmacion && (
              <div role={confirmoVencida ? "status" : "alert"} className="rounded-md border border-ambar/30 bg-ambar/10 px-3 py-2.5 text-sm text-ambar-profundo">
                <p className="font-semibold">{confirmacion.titulo}</p>
                <p className="mt-0.5">{confirmacion.detalle}</p>
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-tinta">
                  <input type="checkbox" checked={confirmoVencida} onChange={(e) => setConfirmoVencida(e.target.checked)} className="mt-0.5 accent-tinta" />
                  <span>{confirmacion.casilla}</span>
                </label>
              </div>
            )}

            <Segmentado
              etiqueta="Tipo"
              valor={tipo}
              onValor={(t) => {
                setTipo(t);
                setClienteNumDoc("");
                setConvertirNombre("");
              }}
              opciones={[
                { valor: "boleta", texto: "Boleta" },
                { valor: "factura", texto: "Factura" },
              ] as const}
            />

            <ConsultaDocumento
              tipo={tipo === "factura" ? "ruc" : "dni"}
              obligatorio={tipo === "factura"}
              numero={clienteNumDoc}
              onNumero={setClienteNumDoc}
              nombre={convertirNombre}
              onNombre={setConvertirNombre}
            />

            <ComboResponsable control={responsable} deshabilitado={loading} className="pt-2" />

            <div className="flex gap-2 pt-3">
              <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrarModal}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" className="flex-1" cargando={loading} disabled={faltaConfirmar || !responsable.listo} title={responsable.motivo ?? undefined}>
                {loading ? "Emitiendo…" : "Emitir comprobante"}
              </Boton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
