"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Plus, Printer } from "lucide-react";
import type { FotoDePrenda, Proforma } from "@/lib/proformas";
import { lineasDeLaProforma, numeroDeProforma } from "@/lib/proformas-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { coincide } from "@/lib/facturacion-busqueda";
import { camposDeBusquedaDeLaProforma, chipDeLaProforma, detalleDeLaProforma, ordenarProformas, textoWhatsAppDeLaProforma } from "@/lib/facturacion-proformas-reglas";
import { enlaceWhatsApp } from "@/lib/facturacion-comprobantes-reglas";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { Ayuda } from "@/components/Ayuda";
import { SinCoincidencias } from "@/components/SinCoincidencias";
import { NuevaProformaModal, Foto, type PrendaParaProforma } from "@/components/NuevaProformaModal";
import { ProformaA4 } from "@/components/ProformaA4";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";

// Las columnas de la lista, según el ancho DE LA TARJETA (container queries) y no el de la ventana,
// igual que en Comprobantes y en «Actividad de hoy»: con el menú lateral desplegado, una ventana de
// 768 px deja ~480 px de contenido. Desde 640 px de tarjeta, una tabla; por debajo, filas apiladas.
const COLUMNAS = "@min-[640px]:grid @min-[640px]:grid-cols-[72px_minmax(0,1.2fr)_100px_minmax(0,1.4fr)]";
const ENLACE_FILA =
  "rounded-md px-1.5 py-0.5 text-xs text-tinta/65 outline-none transition-colors duration-200 hover:bg-tinta/10 hover:text-tinta focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-rojo/60";

// Proforma: NO es un comprobante de pago (Art. 2, RS 007-99/SUNAT — ADR-0007). Sirve para cotizar prendas
// antes de que la clienta decida comprar. Desde 2026-09-22 (ADR-0167) lleva prendas del catálogo y se cobra en el
// Punto de Venta («Cobrar» → `/vender?proforma=<id>`): así la venta mueve stock, caja y comprobante como
// cualquier otra, y la proforma queda «convertida» y enlazada. Ya no se «convierte» en un comprobante suelto.
//
// Excepciones primero (hallazgo Oracle, Ronda 2): las que vencen antes van arriba. El orden, el chip y la línea
// de detalle salen de `lib/facturacion-proformas-reglas.ts`; las tarjetas de arriba, de `ProformasTarjetas`.
// Una proforma de formato anterior (un total sin prendas) se ve, pero no se cobra, duplica ni imprime.
export function ProformasPanel({
  proformas,
  periodo,
  ahora,
  conversion,
  prendas,
  tiendas,
  ubicacionActualId,
  esLider,
  fotos,
}: {
  proformas: Proforma[];
  periodo: string;
  ahora: Date;
  /** Cuántas de las creadas en el mes terminaron en venta (`conversionDelMes`). */
  conversion: { convertidas: number; creadas: number; porcentaje: number | null };
  /** El catálogo para «Nueva proforma» (activas, con precio). */
  prendas: PrendaParaProforma[];
  tiendas: { id: string; nombre: string }[];
  ubicacionActualId: string;
  esLider: boolean;
  /** Foto y color de cada prenda de estas proformas (`getFotosDeVariantes`). */
  fotos: Record<string, FotoDePrenda>;
}) {
  // «Nueva proforma» vacía (`true`) o como copia de otra (Duplicar / Renovar).
  const [nueva, setNueva] = useState<true | Proforma | null>(null);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [viendo, setViendo] = useState<Proforma | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);

  const { texto: busqueda } = useFacturacionBusqueda();
  const proformasOrdenadas = ordenarProformas(proformas).filter((p) => coincide(camposDeBusquedaDeLaProforma(p), busqueda));
  const nombreTienda = (id: string) => tiendas.find((t) => t.id === id)?.nombre ?? "—";

  // Imprime cuando la raíz ya está montada y sus fotos decodificadas (una <img> sin decodificar sale en blanco);
  // termina con `afterprint`, con respaldo de 4 s. El mismo mecanismo que la boleta A4 (`DetalleVentaModal`).
  useEffect(() => {
    if (!imprimiendo) return;
    let respaldo: number | undefined;
    const terminar = () => {
      window.removeEventListener("afterprint", terminar);
      window.clearTimeout(respaldo);
      setImprimiendo(false);
    };
    const cuadro = requestAnimationFrame(async () => {
      const imagenes = [...document.querySelectorAll<HTMLImageElement>("#boleta-a4-print img")];
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
    <div className="space-y-6">
      {/* `overflow-hidden` solo con filas (ver el mismo comentario en ComprobantesPanel): sin ellas la tarjeta es baja y
          recortaría el globo de ayuda del encabezado. */}
      <div className={`card-cayla anim-sube @container ${proformasOrdenadas.length > 0 ? "overflow-hidden" : ""}`} style={{ "--i": 6 } as CSSProperties}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-[18px] pb-3.5">
          <div className="min-w-0">
            <p className="label-cayla text-[11px] text-tinta/65">
              Proformas
              <Ayuda titulo="Proforma">
                No es un comprobante de pago: SUNAT no la reconoce y no usa número de serie. Sirve para cotizarle prendas a
                una clienta y guardarle el precio unos días. Cuando vuelve a comprar, «Cobrar» la lleva al Punto de Venta con
                las prendas en el carrito, y ahí nace la venta con su boleta o factura.
              </Ayuda>
            </p>
            <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">Todas las proformas</h2>
            <p className="mt-0.5 text-xs text-tinta/65">Las vigentes de cualquier mes, más las que se hicieron {periodo}. Las que vencen antes van primero.</p>
            {conversion.porcentaje !== null && (
              <p className="mt-1.5 text-[13px] text-tinta/75">
                De las {conversion.creadas} creadas {periodo},{" "}
                <b className="font-semibold tabular-nums text-tinta">
                  {conversion.convertidas} terminaron en venta ({conversion.porcentaje} %)
                </b>
                .
              </p>
            )}
          </div>
          <BotonCompacto variante="primario" icono={<Plus aria-hidden strokeWidth={1.75} />} onClick={() => setNueva(true)}>
            Nueva proforma
          </BotonCompacto>
        </div>

        {proformas.length === 0 ? (
          <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Sin proformas {periodo}.</p>
        ) : proformasOrdenadas.length === 0 ? (
          <SinCoincidencias />
        ) : (
          <>
            <div className={`label-cayla hidden gap-x-4 border-t border-tinta/10 px-5 py-2 text-[11px] text-tinta/65 ${COLUMNAS}`}>
              <span>Fecha</span>
              <span>Proforma</span>
              <span className="text-right">Total</span>
              <span>Estado</span>
            </div>

            {proformasOrdenadas.map((p) => {
              const chip = chipDeLaProforma(p);
              const detalle = detalleDeLaProforma(p, ahora);
              const { dia, hora } = diaYHoraLima(p.created_at);
              const lineas = lineasDeLaProforma(p.items);
              const prendasTotal = lineas?.reduce((n, l) => n + l.cantidad, 0) ?? 0;
              const abierta = abiertaId === p.id && lineas !== null;
              const quien = p.cliente_nombre ?? "Cliente varios";
              return (
                <div key={p.id} className="border-t border-tinta/10">
                  <div className={`flex flex-col gap-2 px-5 py-3 transition-colors duration-150 hover:bg-tinta/[0.025] @min-[640px]:items-center @min-[640px]:gap-x-4 @min-[640px]:gap-y-0 ${COLUMNAS}`}>
                    <div className="flex items-baseline gap-2 @min-[640px]:block">
                      <p className="font-display text-lg leading-tight tabular-nums text-tinta">{dia}</p>
                      <p className="label-cayla text-[10px] text-tinta/65 @min-[640px]:mt-0.5">{hora}</p>
                    </div>

                    <button
                      type="button"
                      disabled={lineas === null}
                      onClick={() => setAbiertaId(abierta ? null : p.id)}
                      aria-expanded={abierta}
                      className="group min-w-0 rounded-md text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 disabled:cursor-default"
                    >
                      <p className="truncate text-[15px] leading-normal text-tinta">
                        <span className="text-tinta/65">{numeroDeProforma(p.numero)}</span> · {quien}
                      </p>
                      <p className="flex items-center gap-1 text-[13px] text-tinta/60">
                        {lineas === null ? (
                          "Formato anterior, sin prendas"
                        ) : (
                          <>
                            {prendasTotal} {prendasTotal === 1 ? "prenda" : "prendas"}
                            <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform duration-200 ${abierta ? "rotate-180" : ""}`} />
                          </>
                        )}
                      </p>
                    </button>

                    <p className="font-display text-lg leading-tight tabular-nums text-tinta @min-[640px]:text-right">{soles(Number(p.total))}</p>

                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0">
                        {lineas === null ? <Chip tono="neutro">Formato anterior</Chip> : <Chip tono={chip.tono}>{chip.texto}</Chip>}
                        {detalle && lineas !== null && (
                          <p className={`mt-1.5 text-[13px] leading-snug ${detalle.urgente ? "font-semibold text-ambar-profundo" : "text-tinta/65"}`}>{detalle.texto}</p>
                        )}
                      </div>
                      {lineas !== null && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button" onClick={() => setViendo(p)} aria-label={`Ver o imprimir ${numeroDeProforma(p.numero)}`} className={ENLACE_FILA}>
                            Ver / imprimir
                          </button>
                          {p.estado === "vigente" && !p.vencida && (
                            <a href={enlaceWhatsApp(textoWhatsAppDeLaProforma(p))} target="_blank" rel="noreferrer" aria-label={`Enviar por WhatsApp ${numeroDeProforma(p.numero)}`} className={ENLACE_FILA}>
                              WhatsApp
                            </a>
                          )}
                          {p.estado !== "convertida" && (
                            <BotonCompacto variante="fila" aria-label={`${p.vencida ? "Renovar" : "Duplicar"} ${numeroDeProforma(p.numero)}`} onClick={() => setNueva(p)}>
                              {p.vencida ? "Renovar" : "Duplicar"}
                            </BotonCompacto>
                          )}
                          {p.estado === "vigente" && (
                            <Link
                              href={`/vender?proforma=${p.id}`}
                              aria-label={`Cobrar ${numeroDeProforma(p.numero)} en el Punto de Venta`}
                              className="inline-flex h-7 items-center rounded-md bg-tinta px-2.5 text-xs font-semibold text-crema outline-none transition-colors duration-200 hover:bg-tinta/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
                            >
                              Cobrar
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {abierta && (
                    <ul className="anim-revelar space-y-1.5 bg-tinta/[0.02] px-5 pt-1 pb-3 @min-[640px]:pl-[calc(72px+2.5rem)]">
                      {lineas.map((l, i) => (
                        <li key={`${l.variante_id}-${i}`} className="flex items-center gap-3 text-[13px]">
                          <Foto prenda={{ ...(fotos[l.variante_id] ?? { fotoUrl: null, colorHex: null }), referencia: l.descripcion }} />
                          <span className="min-w-0 flex-1">
                            <span className="text-tinta">{l.descripcion}</span>
                            {l.codigo && <span className="block text-xs text-tinta/55">{l.codigo}</span>}
                          </span>
                          <span className="tabular-nums text-tinta/60">
                            {l.cantidad} × {soles(l.precio_unitario)}
                            {l.descuento_unitario > 0 && ` − ${soles(l.descuento_unitario)}`}
                          </span>
                          <b className="w-24 text-right font-semibold tabular-nums">{soles((l.precio_unitario - l.descuento_unitario) * l.cantidad)}</b>
                        </li>
                      ))}
                      {p.nota && <li className="pt-1 text-[13px] text-tinta/70">Nota: {p.nota}</li>}
                    </ul>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {nueva !== null && (
        <NuevaProformaModal
          onCerrar={() => setNueva(null)}
          prendas={prendas}
          ubicaciones={tiendas}
          ubicacionActualId={ubicacionActualId}
          esLider={esLider}
          inicial={nueva === true ? null : nueva}
        />
      )}

      {/* Ver / imprimir: la hoja A4 a escala y el botón que la manda a la impresora (o a «Guardar como PDF»). */}
      {viendo && (
        <Modal titulo={numeroDeProforma(viendo.numero)} subtitulo={viendo.cliente_nombre ?? "Cliente varios"} ancho="max-w-3xl" onClose={() => setViendo(null)}>
          {(cerrar) => (
            <div className="mt-4 space-y-4">
              <div className="h-[62vh] overflow-auto rounded-[10px] border border-tinta/10 bg-sand/30 p-3" data-sin-cascada>
                {/* `zoom` (no `scale`): achica también el espacio que ocupa, así la hoja entera cabe sin cortarse. */}
                <div className="mx-auto w-fit bg-white p-[8mm] shadow-sm" style={{ zoom: 0.68 }}>
                  <ProformaA4 proforma={viendo} tienda={nombreTienda(viendo.ubicacion_id)} fotos={fotos} />
                </div>
              </div>
              <p className="text-xs text-tinta/60">Para enviarla por WhatsApp, elige «Guardar como PDF» en el cuadro de impresión y adjunta el archivo.</p>
              <div className="flex gap-2">
                <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                  Cerrar
                </Boton>
                <Boton type="button" peso="primario" className="flex-1" onClick={() => setImprimiendo(true)} cargando={imprimiendo}>
                  <Printer aria-hidden className="h-4 w-4" /> Imprimir o guardar en PDF
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Raíz de impresión: pegada a <body>; el CSS de `#boleta-a4-print` oculta todo lo demás al imprimir. */}
      {imprimiendo &&
        viendo &&
        createPortal(
          <div id="boleta-a4-print">
            <ProformaA4 proforma={viendo} tienda={nombreTienda(viendo.ubicacion_id)} fotos={fotos} />
          </div>,
          document.body
        )}
    </div>
  );
}
