"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Modal, botonCancelar } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import {
  ETIQUETA_ESTADO_DEVOLUCION,
  etiquetaConDireccion,
  etiquetaDia,
  etiquetaEstadoComprobante,
  hoyEnLima,
  textoComprobante,
  textoDelta,
  verboDelResponsable,
  type Movimiento,
  type PrendaDeMovimiento,
} from "@/lib/movimientos-reglas";
import { ESTADO_ESTILO } from "@/lib/comprobantes-reglas";

// El detalle de un movimiento: los mismos datos de la fila, completos y con
// el apartado que corresponde a SU proceso (una venta muestra el
// comprobante; una recepción, la guía y el proveedor; un conteo, sistema vs
// contado). Solo lectura: acá no hay nada que editar ni borrar, a propósito.
//
// ADR-0234: dice qué hizo la persona («Vendió: …», «Recibió: …»), cuánto queda HOY de esa prenda en la sede y lleva a
// todo lo que le pasó (su historial). Sin el código interno del movimiento: para mostrarlo a alguien está «Copiar
// enlace», que abre exactamente esto (lo pega por WhatsApp y listo).
export function MovimientoDetalle({
  movimiento: m,
  prenda,
  onVerVenta,
  onClose,
}: {
  movimiento: Movimiento;
  prenda?: PrendaDeMovimiento;
  /** Si quien mira ve el Historial de ventas, cómo abrir la venta desde acá. Sin esto (el historial de un producto), no se ofrece. */
  onVerVenta?: () => void;
  onClose: () => void;
}) {
  // El delta ya lo calculó `fn_movimientos` en SQL (es `m.delta`, la misma
  // fuente que decide el signo/color del chip) — no se vuelve a restar
  // `contado - sistema` acá para no tener la misma regla en dos lugares.
  const dif = m.conteo ? m.delta : null;

  return (
    <Modal
      titulo={etiquetaConDireccion(m)}
      subtitulo={`${etiquetaDia(m.fecha, hoyEnLima())} · ${m.hora} · ${m.esSistema ? "Carga del sistema, sin persona" : `${verboDelResponsable(m)}: ${m.usuario ?? "persona no identificada"}`}`}
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
                {/* «movidas», no «repuestas»: un interno también puede ser un retiro del piso al almacén
                    (D-41). Hacia dónde fue ya lo dice el título del detalle («Bajada al piso» / «Retiro del piso»). */}
                {m.categoria === "interno"
                  ? "unidades movidas"
                  : m.categoria === "apartado"
                    ? "apartadas para una clienta"
                    : m.categoria === "liberacion_apartado"
                      ? "vuelven a estar disponibles"
                      : m.categoria === "ajuste"
                        ? "ajuste"
                        : m.delta > 0
                          ? "entran"
                          : "salen"}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-tinta/10 border-y border-tinta/10">
            <Dato etiqueta={m.categoria === "transferencia" ? "Sedes" : "Sede"}>
              {m.categoria === "transferencia" ? (
                <>
                  {m.ubicacion} <span className="text-tinta/55">→</span> {m.ubicacionDestino ?? "—"}
                </>
              ) : (
                m.ubicacion
              )}
            </Dato>
            {m.categoria === "interno" ? (
              <Dato etiqueta="Dentro de la sede">
                {m.sububicacion?.nombre ?? "Sin zona"} <span className="text-tinta/55">→</span> {m.sububicacionDestino?.nombre ?? "Sin zona"}
              </Dato>
            ) : m.categoria === "transferencia" ? (
              m.sububicacion && m.sububicacionDestino ? (
                // Una fila del modelo anterior (una sola fila que sale de una sede y entra a otra): las dos puntas.
                <Dato etiqueta="Zonas">
                  {m.sububicacion.nombre} <span className="text-tinta/55">→</span> {m.sububicacionDestino.nombre}
                </Dato>
              ) : (
                // Una pierna del traslado: la sububicación es la de ESTA sede — donde entró o de donde salió. Poner
                // «→ Sin sububicación» hacía parecer que la mercadería iba del almacén a ninguna parte.
                (m.sububicacion ?? m.sububicacionDestino) && (
                  <Dato etiqueta={m.delta > 0 ? "Entró a" : "Salió de"}>{(m.sububicacion ?? m.sububicacionDestino)?.nombre}</Dato>
                )
              )
            ) : (
              m.sububicacion && <Dato etiqueta="Zona">{m.sububicacion.nombre}</Dato>
            )}

            {/* Cuánto queda HOY: la pregunta con la que se llega a esta pantalla («¿por qué dice 3 si cuento 2?»). Las
                mismas cuentas que Existencias (`sumarCantidades`): la cuarentena no suma. */}
            {prenda?.stockHoy && (
              <Dato etiqueta="Hoy en la sede">
                {prenda.stockHoy.total === 0 ? "No queda ninguna" : `${prenda.stockHoy.total} ${prenda.stockHoy.total === 1 ? "unidad" : "unidades"}`}
                {prenda.stockHoy.piso !== null && prenda.stockHoy.total > 0 && (
                  <span className="text-tinta/65">
                    {" "}
                    ({prenda.stockHoy.piso} en piso, {prenda.stockHoy.almacen ?? 0} en almacén)
                  </span>
                )}
                {(prenda.stockHoy.danado ?? 0) > 0 && <span className="text-tinta/65"> · {prenda.stockHoy.danado} dañadas en cuarentena</span>}
                {prenda.productoId && (
                  <Link href={`/productos/${prenda.productoId}/historial`} className="mt-1 block text-tinta underline decoration-tinta/30 underline-offset-2 hover:text-rojo hover:decoration-rojo" onClick={cerrar}>
                    Ver todo lo que le pasó a esta prenda →
                  </Link>
                )}
              </Dato>
            )}

            {/* ---- lo propio de cada proceso ---- */}
            {m.venta && m.motivo !== "devolucion" && m.motivo !== "cambio" && (
              <Dato etiqueta="Comprobante">
                <Comprobante comprobante={m.venta.comprobante} />
                {onVerVenta && <VerVenta onClick={onVerVenta} />}
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
              <Dato etiqueta="Comprobante de compra">
                <Link href={`/compras/factura/${m.compra.id}`} className="text-rojo hover:underline" onClick={cerrar}>
                  {m.compra.documento ?? "Ver comprobante"} →
                </Link>
              </Dato>
            )}

            {m.transferencia && (
              <>
                {/* El proceso completo (qué prendas viajaron juntas, envío, recepción, diferencias) y su estado los cuenta
                    Traslados, con sus palabras: acá solo el número y el camino para llegar (ADR-0234 quitó la insignia que
                    decía «Cerrada» donde Traslados dice «Completado»). */}
                <Dato etiqueta="Traslado">
                  <Link
                    href={`/inventario/traslados/${m.transferencia.id}`}
                    className="text-tinta underline decoration-tinta/30 underline-offset-2 hover:text-rojo hover:decoration-rojo"
                    onClick={cerrar}
                  >
                    {m.transferencia.numero !== null ? `Traslado ${m.transferencia.numero}` : "Ver traslado"} →
                  </Link>
                </Dato>
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
                    {onVerVenta && <VerVenta onClick={onVerVenta} />}
                  </Dato>
                )}
              </>
            )}

            {m.conteo && (
              <Dato etiqueta="Conteo">
                <Link
                  href={`/inventario/conteo/${m.conteo.id}`}
                  className="mr-2 text-tinta underline decoration-tinta/30 underline-offset-2 hover:text-rojo hover:decoration-rojo"
                  onClick={cerrar}
                >
                  {m.conteo.numero !== null ? `Conteo ${m.conteo.numero}` : "Ver conteo"} →
                </Link>
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
                    {onVerVenta && <VerVenta onClick={onVerVenta} />}
                  </Dato>
                )}
              </>
            )}

            {m.nota && <Dato etiqueta="Nota">{m.nota}</Dato>}
          </dl>

          <div className="flex gap-2">
            <button type="button" onClick={copiarEnlace} className={botonCancelar}>
              Copiar enlace
            </button>
            <button type="button" onClick={cerrar} className={botonCancelar}>
            Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** El enlace de ESTE movimiento (la URL ya lleva `?mov=`), para mandarlo por WhatsApp. El portapapeles moderno falla en
 *  algunos celulares y navegadores embebidos (sin permiso): entonces se copia a la antigua, con un campo escondido. */
async function copiarEnlace() {
  const enlace = window.location.href;
  const copiado = await navigator.clipboard?.writeText(enlace).then(
    () => true,
    () => false
  );
  if (copiado || copiarALaAntigua(enlace)) {
    avisar.exito("Enlace copiado", { detalle: "Pégalo en WhatsApp: abre este mismo movimiento." });
  } else {
    avisar.error("No se pudo copiar el enlace", { detalle: "Copia la dirección de arriba del navegador." });
  }
}

function copiarALaAntigua(texto: string): boolean {
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(campo);
  }
}

function VerVenta({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-1 block text-left text-tinta underline decoration-tinta/30 underline-offset-2 hover:text-rojo hover:decoration-rojo">
      Ver la venta →
    </button>
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
