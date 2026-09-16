"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Modal, botonCancelar } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import {
  ETIQUETA_CATEGORIA,
  ETIQUETA_ESTADO_DEVOLUCION,
  etiquetaDia,
  etiquetaEstadoComprobante,
  etiquetaProceso,
  hoyEnLima,
  textoComprobante,
  textoDelta,
  tonoCategoria,
  type Movimiento,
} from "@/lib/movimientos-reglas";
import { ESTADO_ESTILO } from "@/lib/comprobantes-reglas";

// El detalle de un movimiento: los mismos datos de la fila, completos y con
// el apartado que corresponde a SU proceso (una venta muestra el
// comprobante; una recepción, la guía y el proveedor; un conteo, sistema vs
// contado). Solo lectura: acá no hay nada que editar ni borrar, a propósito.
export function MovimientoDetalle({ movimiento: m, onClose }: { movimiento: Movimiento; onClose: () => void }) {
  // El delta ya lo calculó `fn_movimientos` en SQL (es `m.delta`, la misma
  // fuente que decide el signo/color del chip) — no se vuelve a restar
  // `contado - sistema` acá para no tener la misma regla en dos lugares.
  const dif = m.conteo ? m.delta : null;

  return (
    <Modal
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          <Chip tono={tonoCategoria(m.categoria, m.delta)}>{ETIQUETA_CATEGORIA[m.categoria]}</Chip>
          <span>{etiquetaProceso(m.motivo)}</span>
        </span>
      }
      subtitulo={`${etiquetaDia(m.fecha, hoyEnLima())} · ${m.hora} · ${m.esSistema ? "Movimiento de sistema, sin persona" : (m.usuario ?? "Persona no identificada")}`}
      onClose={onClose}
      ancho="max-w-md"
    >
      {(cerrar) => (
        <div className="space-y-5">
          {/* La prenda y la cantidad: lo primero que se mira. */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-base text-tinta">{m.referencia}</p>
              <p className="font-mono text-xs text-tinta/65">{m.sku}</p>
              {(m.talla || m.color) && <p className="text-xs text-tinta/65">{[m.talla, m.color].filter(Boolean).join(" · ")}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className={`font-display text-3xl tabular-nums ${m.delta > 0 ? "text-verde-profundo" : "text-tinta"}`}>{textoDelta(m)}</p>
              <p className="label-cayla text-[10px] text-tinta/55">
                {m.categoria === "interno" ? "unidades repuestas" : m.categoria === "ajuste" ? "ajuste" : m.delta > 0 ? "entran" : "salen"}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-tinta/10 border-y border-tinta/10">
            <Dato etiqueta="Ubicación">
              {m.categoria === "transferencia" ? (
                <>
                  {m.ubicacion} <span className="text-tinta/55">→</span> {m.ubicacionDestino ?? "—"}
                </>
              ) : (
                m.ubicacion
              )}
            </Dato>
            {m.categoria === "interno" ? (
              <Dato etiqueta="Dentro de la tienda">
                {m.sububicacion?.nombre ?? "Sin sububicación"} <span className="text-tinta/55">→</span> {m.sububicacionDestino?.nombre ?? "Sin sububicación"}
              </Dato>
            ) : m.categoria === "transferencia" ? (
              (m.sububicacion || m.sububicacionDestino) && (
                <Dato etiqueta="Sububicaciones">
                  {m.sububicacion?.nombre ?? "Sin sububicación"} <span className="text-tinta/55">→</span> {m.sububicacionDestino?.nombre ?? "Sin sububicación"}
                </Dato>
              )
            ) : (
              m.sububicacion && <Dato etiqueta="Sububicación">{m.sububicacion.nombre}</Dato>
            )}

            {/* ---- lo propio de cada proceso ---- */}
            {m.venta && m.motivo !== "devolucion" && m.motivo !== "cambio" && (
              <Dato etiqueta="Comprobante">
                <Comprobante comprobante={m.venta.comprobante} />
              </Dato>
            )}
            {m.venta?.nota && m.motivo === "venta" && <Dato etiqueta="Nota de la venta">{m.venta.nota}</Dato>}

            {m.lote && (
              <>
                {m.lote.proveedor && <Dato etiqueta="Proveedor">{m.lote.proveedor}</Dato>}
                {m.lote.guia && <Dato etiqueta="Guía de remisión">{m.lote.guia}</Dato>}
                {m.lote.nota && <Dato etiqueta="Nota del lote">{m.lote.nota}</Dato>}
              </>
            )}
            {m.compra && (
              <Dato etiqueta="Factura de compra">
                <Link href={`/compras/factura/${m.compra.id}`} className="text-rojo hover:underline" onClick={cerrar}>
                  {m.compra.documento ?? "Ver factura"} →
                </Link>
              </Dato>
            )}

            {m.transferencia && (
              <>
                <Dato etiqueta="Transferencia">{m.transferencia.estado === "completada" ? "Completada" : (m.transferencia.estado ?? "—")}</Dato>
                {m.transferencia.nota && <Dato etiqueta="Nota">{m.transferencia.nota}</Dato>}
              </>
            )}

            {m.devolucion && (
              <>
                <Dato etiqueta="Devolución">{ETIQUETA_ESTADO_DEVOLUCION[m.devolucion.estado ?? ""] ?? m.devolucion.estado ?? "—"}</Dato>
                {m.devolucion.motivo && <Dato etiqueta="Motivo de la clienta">{m.devolucion.motivo}</Dato>}
                {m.venta && (
                  <Dato etiqueta="Venta original">
                    <Comprobante comprobante={m.venta.comprobante} />
                  </Dato>
                )}
              </>
            )}

            {m.conteo && (
              <Dato etiqueta="Conteo">
                Sistema {m.conteo.sistema ?? "—"} <span className="text-tinta/55">→</span> contado {m.conteo.contado ?? "—"}
                {dif !== null && (
                  <span className={dif < 0 ? "text-rojo-profundo" : "text-verde-profundo"}>
                    {" "}
                    ({dif > 0 ? `+${dif}` : dif})
                  </span>
                )}
              </Dato>
            )}

            {m.cambio && (
              <>
                <Dato etiqueta="Cambio">
                  {m.tipo === "entrada" ? "La prenda que la clienta devolvió" : "La prenda que se llevó a cambio"}
                  {m.cambio.diferencia !== null && m.cambio.diferencia !== 0 && (
                    <span className="text-tinta/65">
                      {" "}
                      · diferencia S/{Math.abs(Number(m.cambio.diferencia)).toFixed(2)} {Number(m.cambio.diferencia) > 0 ? "cobrada" : "devuelta"}
                    </span>
                  )}
                </Dato>
                {m.venta && (
                  <Dato etiqueta="Venta original">
                    <Comprobante comprobante={m.venta.comprobante} />
                  </Dato>
                )}
              </>
            )}

            {m.nota && <Dato etiqueta="Nota">{m.nota}</Dato>}
          </dl>

          {/* El id existe para citarlo en una consulta («¿por qué este movimiento?»);
              no se edita ni se borra: el trigger de inmutabilidad lo impide. */}
          <p className="font-mono text-[10px] text-tinta/40">{m.id}</p>

          <button type="button" onClick={cerrar} className={botonCancelar}>
            Cerrar
          </button>
        </div>
      )}
    </Modal>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="label-cayla pt-0.5 text-[11px] text-tinta/65">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-tinta">{children}</dd>
    </div>
  );
}

function Comprobante({ comprobante }: { comprobante: NonNullable<Movimiento["venta"]>["comprobante"] }) {
  if (!comprobante) return <span className="text-tinta/65">Sin comprobante</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{textoComprobante(comprobante)}</span>
      <span className={`label-cayla rounded-full border px-2 py-0.5 text-[10px] ${ESTADO_ESTILO[comprobante.estado] ?? ""}`}>
        {etiquetaEstadoComprobante(comprobante.estado)}
      </span>
    </span>
  );
}
