"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { ETIQUETA_METODO } from "@/lib/compras-reglas";
import {
  ETIQUETA_MOTIVO_NOTA,
  chipEstado,
  hace,
  mensajeParaProveedor,
  pasosDeNota,
  siguientePaso,
  type FilaVista,
  type MovimientoFavor,
} from "@/lib/notas-credito-reglas";

/* ====================================================================
   Detalle de una nota de crédito (2026-09-19)
   Spike: docs/maquetas/notas-credito-spike-2026-09/ (pantalla 2)

   La ficha completa: en qué estado está, su recorrido paso a paso, qué pasó (o qué va a pasar) con el
   dinero, el comprobante del que sale y un historial que no se edita ni se borra.

   POR QUÉ ES UN MODAL CLIENTE Y NO UNA RUTA INTERCEPTADA, como el detalle de un comprobante
   (`@modal/(.)factura/[compraId]`). Dos razones concretas:
     · Todo el tablero llega en UNA llamada (`notas_credito_tablero()`) y ya vive en el cliente: una
       ruta propia volvería a pedirlo entero para mostrar una fila que la pantalla ya tiene.
     · El slot `@modal` de /compras tiene un comodín (`@modal/[...catchAll]`) que limpia el modal al
       navegar dentro del módulo; meter otra intercepción ahí es exactamente el solapamiento que el
       layout de Compras documenta haber sufrido con `(.)[compraId]`.
   Se pierde el enlace directo a una nota. Cuando haga falta (mandarle a alguien «mira esta nota»), la
   nota pasa a tener su propia ruta y esto se convierte en su intercepción, sin tocar nada más.

   Movimiento: el del sistema, por usar `<Modal>` (ADR-0136). Lo único propio es el «Copiado» que se
   dibuja al copiar el mensaje — respuesta a un clic, 320 ms, una sola vez.
   ==================================================================== */

export function NotaCreditoDetalle({ nota: f, movimientos, onCerrar, onRegistrar }: { nota: FilaVista; movimientos: MovimientoFavor[]; onCerrar: () => void; onRegistrar: (compraId: string) => void }) {
  const [copiado, setCopiado] = useState(false);
  const chip = chipEstado(f);
  const pasos = pasosDeNota(f);
  const sugerencia = siguientePaso(f);
  const neto = Math.round((f.monto - (f.igv || f.monto - f.monto / 1.18)) * 100) / 100;
  const igv = Math.round((f.monto - neto) * 100) / 100;

  // El libro de este proveedor, acotado a lo que toca a esta nota: lo que ella aportó y lo que salió
  // después. Los usos no dicen de cuál nota salieron (ver `repartoFifo`): se dice así, no se inventa.
  const delProveedor = movimientos.filter((m) => m.tipo !== "nota_credito");

  async function copiar() {
    const texto = mensajeParaProveedor(f);
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* sin portapapeles: el texto igual está a la vista para copiarlo a mano */
      }
      ta.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2200);
  }

  const titulo = f.clase === "pendiente" ? `Nota por reclamar · ${f.documento}` : `Nota de crédito ${f.serieNumero ?? ""}`;

  return (
    <Modal titulo={titulo} subtitulo={`${f.proveedorNombre} · ${f.clase === "pendiente" ? `cerrado el ${diaMes(f.cerradoEn?.slice(0, 10) ?? f.fecha)}` : `registrada el ${diaMes(f.fecha)}`}`} variante="papel" ancho="max-w-3xl" onClose={onCerrar}>
      {(cerrar) => (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono={chip.tono}>{chip.texto}</Chip>
            {f.clase === "pendiente" && !f.bloqueada && <Chip tono={f.tramo === "urgente" ? "rojo" : f.tramo === "medio" ? "ambar" : "neutro"}>{hace(f.edadDias)}</Chip>}
            {f.motivo && <Chip tono="neutro">{ETIQUETA_MOTIVO_NOTA[f.motivo] ?? f.motivo}</Chip>}
          </div>

          <dl className="grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-xl border border-sand">
            <Celda k={f.clase === "pendiente" ? "Esperado" : "Monto"} v={soles(f.monto)} s="con IGV" />
            <Celda k="Base" v={soles(neto)} s="sin IGV" />
            <Celda k="IGV" v={soles(igv)} s="crédito fiscal que resta" />
          </dl>

          <section>
            <h3 className="label-cayla mb-2 text-[11px] text-tinta/65">Recorrido</h3>
            <div className="grid">
              {pasos.map((p, i) => (
                <div key={p.clave} className="nc-paso" data-estado={p.estado} data-hilo={p.estado === "hecho" && pasos[i + 1] && pasos[i + 1].estado !== "pendiente" ? "true" : "false"} style={{ ["--i" as string]: i }}>
                  <span aria-hidden className="nc-nodo" />
                  <span className="text-sm">
                    <b className={`font-semibold ${p.estado === "pendiente" ? "text-tinta/55" : "text-tinta"}`}>{p.titulo}</b>
                    <span className="block text-xs text-tinta/55">{p.detalle}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-tinta/55">{p.fecha ?? ""}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="label-cayla mb-2 text-[11px] text-tinta/65">Comprobante de origen</h3>
            <div className="flex flex-wrap items-center gap-3.5 rounded-xl border border-sand px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <b className="font-semibold tabular-nums text-tinta">{f.documento}</b>
                <span className="mt-0.5 block text-xs text-tinta/65">
                  {f.proveedorNombre} · emitido el {diaMes(f.compraFechaEmision)}
                </span>
              </span>
              <span className="flex gap-4 text-xs text-tinta/55">
                <span>
                  Total<b className="font-display block text-[17px] font-normal tabular-nums text-tinta">{soles(f.compraTotal)}</b>
                </span>
                <span>
                  Se debe<b className="font-display block text-[17px] font-normal tabular-nums text-tinta">{soles(f.compraSaldo)}</b>
                </span>
              </span>
              <Link href={`/compras/factura/${f.compraId}`} className="label-cayla inline-flex items-center gap-1.5 text-[11px] text-rojo hover:underline">
                Ver comprobante <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <section>
            <h3 className="label-cayla mb-2 text-[11px] text-tinta/65">{f.clase === "pendiente" ? "Qué pasará con el dinero cuando llegue la nota" : "Qué pasó con el dinero"}</h3>
            <div className="grid gap-3">
              {f.clase === "pendiente" ? (
                <Parte
                  etiqueta={f.compraSaldo > 0.004 ? `Lo que se debe de ${f.documento}` : `${f.documento} ya está pagado: la nota no baja ninguna deuda`}
                  monto={f.compraSaldo > 0.004 ? `${soles(f.compraSaldo)} → ${soles(Math.max(0, Math.round((f.compraSaldo - f.monto) * 100) / 100))}` : soles(0)}
                  fraccion={f.compraSaldo > 0.004 ? Math.max(0, (f.compraSaldo - f.monto) / f.compraSaldo) : 0}
                  tono="tinta"
                />
              ) : (
                <>
                  {f.aplicado > 0.004 && <Parte etiqueta={`Bajó la deuda de ${f.documento}`} monto={`− ${soles(f.aplicado)}`} fraccion={f.aplicado / Math.max(f.monto, 0.01)} tono="tinta" />}
                  {f.devuelto && <Parte etiqueta={`Se devolvió a CAYLA el ${diaMes(f.devuelto.fecha)}${f.devuelto.metodo ? ` · ${ETIQUETA_METODO[f.devuelto.metodo] ?? f.devuelto.metodo}` : ""}${f.devuelto.referencia ? ` · ${f.devuelto.referencia}` : ""}`} monto={soles(f.devuelto.monto)} fraccion={f.devuelto.monto / Math.max(f.monto, 0.01)} tono="verde" />}
                  {f.aFavor > 0.004 && !f.devuelto && (
                    <Parte
                      etiqueta={`Pasó a saldo a favor con ${f.proveedorNombre}${f.vivo < f.aFavor ? ` · ya se usaron ${soles(Math.round((f.aFavor - f.vivo) * 100) / 100)}` : ""}`}
                      monto={soles(f.aFavor)}
                      fraccion={f.aFavor > 0 ? f.vivo / f.aFavor : 0}
                      tono="verde"
                    />
                  )}
                </>
              )}
              <p className="text-xs leading-relaxed text-tinta/65">{sugerencia.texto}</p>
            </div>
          </section>

          {f.clase === "pendiente" && !f.bloqueada && (
            <section>
              <h3 className="label-cayla mb-2 text-[11px] text-tinta/65">Mensaje para el proveedor</h3>
              <p className="whitespace-pre-line rounded-xl border border-dashed border-tinta/25 px-3.5 py-3 text-[13px] leading-relaxed text-tinta/80">{mensajeParaProveedor(f)}</p>
              <button type="button" onClick={copiar} className={`label-cayla mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${copiado ? "bg-verde/10 text-verde-profundo" : "text-tinta/55 hover:text-rojo"}`}>
                {copiado ? (
                  <>
                    <Check aria-hidden className="anim-tilde h-3.5 w-3.5" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy aria-hidden className="h-3.5 w-3.5" /> Copiar mensaje
                  </>
                )}
              </button>
            </section>
          )}

          <section>
            <h3 className="label-cayla mb-1 text-[11px] text-tinta/65">
              Historial <span className="font-normal normal-case tracking-normal text-tinta/45">· no se edita ni se borra</span>
            </h3>
            <ul className="border-t border-tinta/10">
              {f.clase === "pendiente" ? (
                <Movimiento fecha={f.cerradoEn?.slice(0, 10) ?? f.fecha} titulo="Cierre por faltante" detalle={`${f.unidadesCerradas.toLocaleString("es-PE")} ${f.unidadesCerradas === 1 ? "unidad" : "unidades"} en ${f.documento}`} monto={soles(f.monto)} />
              ) : (
                <>
                  <Movimiento fecha={f.fecha} titulo={`Nota ${f.serieNumero ?? ""} registrada`} detalle={f.nota ?? ETIQUETA_MOTIVO_NOTA[f.motivo ?? "otro"] ?? ""} monto={soles(f.monto)} />
                  {delProveedor.map((m) => (
                    <Movimiento
                      key={m.id}
                      fecha={m.fecha}
                      titulo={m.tipo === "aplicacion" ? "Saldo usado en un pago" : `Reembolso · ${ETIQUETA_METODO[m.metodo ?? ""] ?? m.metodo ?? ""}`}
                      detalle={m.notaSerieNumero === f.serieNumero ? (m.documento ?? m.referencia ?? "") : `${m.documento ? `${m.documento} · ` : ""}se asume del saldo más antiguo`}
                      monto={`− ${soles(m.monto)}`}
                    />
                  ))}
                </>
              )}
            </ul>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-4">
            {f.clase === "pendiente" && !f.bloqueada && (
              <button type="button" onClick={() => onRegistrar(f.compraId)} className="label-cayla boton-brillo rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo">
                Registrar la nota
              </button>
            )}
            <button type="button" onClick={cerrar} className="label-cayla ml-auto rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Celda({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <div className="min-w-0 px-3.5 py-3">
      <dt className="label-cayla text-[10px] text-tinta/65">{k}</dt>
      <dd className="font-display mt-0.5 text-[20px] leading-tight tabular-nums text-tinta">{v}</dd>
      <dd className="text-[11.5px] text-tinta/55">{s}</dd>
    </div>
  );
}

/** Una parte del dinero, con su barra que se llena una vez. */
function Parte({ etiqueta, monto, fraccion, tono }: { etiqueta: string; monto: string; fraccion: number; tono: "tinta" | "verde" }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3.5 gap-y-0.5">
      <span className="text-[13.5px] text-tinta/80">{etiqueta}</span>
      <span className={`font-semibold tabular-nums ${tono === "verde" ? "text-verde-profundo" : "text-tinta"}`}>{monto}</span>
      <span aria-hidden className="col-span-2 mt-0.5 h-[5px] overflow-hidden rounded-full bg-sand">
        <i className={`anim-crece-x block h-full origin-left rounded-full ${tono === "verde" ? "bg-verde" : "bg-tinta"}`} style={{ width: `${Math.max(0, Math.min(100, fraccion * 100))}%` }} />
      </span>
    </div>
  );
}

function Movimiento({ fecha, titulo, detalle, monto }: { fecha: string; titulo: string; detalle: string; monto: string }) {
  return (
    <li className="grid grid-cols-[4.4rem_1fr_auto] items-baseline gap-3 border-b border-tinta/10 py-2.5 text-[13px]">
      <span className="tabular-nums text-tinta/55">{diaMes(fecha)}</span>
      <span className="text-tinta">
        {titulo}
        {detalle && <span className="block text-xs text-tinta/55">{detalle}</span>}
      </span>
      <span className="whitespace-nowrap tabular-nums text-tinta">{monto}</span>
    </li>
  );
}
