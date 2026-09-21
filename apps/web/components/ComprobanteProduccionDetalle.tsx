"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { estadoVisible, etiquetaMetodo, etiquetaTipo, type ComprobanteProduccion } from "@/lib/comprobantes-produccion-reglas";
import { cantidadTexto, type UnidadInsumo } from "@/lib/insumos-reglas";

// Detalle de un comprobante de Producción (ADR-0133, F4b): sus líneas, sus pagos y su saldo. Lo leído aquí es del líder por RLS. Anular
// pide un motivo y solo se puede si no hay pagos (anular dejaría dinero sin respaldo); nunca se borra.

type Linea = { id: string; insumo_id?: string | null; descripcion: string | null; cantidad: number; costo_unitario: number; subtotal: number | null; insumo: { nombre: string; unidad_medida: string } | null };
type Pago = { id: string; fecha: string; monto: number; metodo: string; referencia: string | null };

export function ComprobanteProduccionDetalle({ comprobante: c, hoy, tallerId, onClose }: { comprobante: ComprobanteProduccion; hoy: string; tallerId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [pagos, setPagos] = useState<Pago[] | null>(null);
  // Lo recibido de cada línea (F4d): cantidades por línea, sin importes.
  const [recepcion, setRecepcion] = useState<Record<string, { recibido: number; cerrado: number; pendiente: number }>>({});
  const [fallo, setFallo] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const supabase = createClient();
    (async () => {
      const [l, p, r] = await Promise.all([
        supabase.from("comprobantes_produccion_items").select("id, insumo_id, descripcion, cantidad, costo_unitario, subtotal, insumo:insumos ( nombre, unidad_medida )").eq("comprobante_id", c.id).order("id"),
        supabase.from("comprobantes_produccion_pagos").select("id, fecha, monto, metodo, referencia").eq("comprobante_id", c.id).order("fecha"),
        tallerId ? supabase.rpc("fn_lineas_comprobantes_produccion", { p_ubicacion_id: tallerId, p_comprobante_id: c.id }) : Promise.resolve({ data: [], error: null }),
      ]);
      if (!vivo) return;
      if (l.error || p.error) return setFallo(true);
      setLineas(l.data as unknown as Linea[]);
      setPagos(p.data as Pago[]);
      setRecepcion(Object.fromEntries((r.data ?? []).map((x) => [x.item_id, { recibido: Number(x.recibido), cerrado: Number(x.cerrado), pendiente: Number(x.pendiente) }])));
    })();
    return () => {
      vivo = false;
    };
  }, [c.id, tallerId]);

  const estado = estadoVisible(c, hoy);
  const hayRecepcion = Object.values(recepcion).some((x) => x.recibido > 0 || x.cerrado > 0);
  const puedeAnular = c.estado === "vigente" && pagos !== null && pagos.length === 0 && !hayRecepcion;

  async function anular() {
    if (!motivo.trim()) return avisar.error("Anular un comprobante necesita un motivo.");
    setCargando(true);
    const { error } = await createClient().rpc("anular_comprobante_produccion", { p_comprobante_id: c.id, p_motivo: motivo.trim() });
    setCargando(false);
    if (error) return avisar.error(traducirError(error, "anular el comprobante"));
    avisar.exito(`${c.serie}-${c.numero} anulado`, { detalle: "Queda registrado con su motivo; no se borra." });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo={`${etiquetaTipo(c.tipo)} ${c.serie}-${c.numero}`} subtitulo={c.proveedor} onClose={onClose} ancho="max-w-xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tono={estado.tono}>{estado.texto}</Chip>
          <span className="text-xs text-tinta/65">
            Emitida {diaMes(c.fechaEmision)} · {c.condicion === "contado" ? "al contado" : c.fechaVencimiento ? `crédito, vence ${diaMes(c.fechaVencimiento)}` : "a crédito"}
          </span>
        </div>

        {c.estado === "anulada" && c.motivoAnulacion && <p className="rounded-lg bg-sand/60 px-3 py-2.5 text-[13px] text-tinta/80">Anulada: {c.motivoAnulacion}</p>}

        <section aria-label="Líneas">
          <h3 className="label-cayla mb-2 text-[11px] text-tinta/65">Qué se compró</h3>
          {fallo ? (
            <p className="text-sm text-tinta/70">No se pudieron leer las líneas. Recarga la pantalla.</p>
          ) : lineas === null ? (
            <p className="text-sm text-tinta/55">Leyendo…</p>
          ) : (
            <ul>
              {lineas.map((l) => (
                <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-tinta/10 py-2 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate text-tinta">{l.insumo?.nombre ?? l.descripcion}</p>
                    <p className="text-xs text-tinta/65">
                      {l.insumo ? cantidadTexto(Number(l.cantidad), l.insumo.unidad_medida as UnidadInsumo) : `${Number(l.cantidad)} u.`} × {soles(Number(l.costo_unitario))}
                    </p>
                    {l.insumo && recepcion[l.id] && (
                      <p className="text-xs text-tinta/65">
                        {recepcion[l.id].pendiente <= 0
                          ? recepcion[l.id].cerrado > 0
                            ? `Recibido ${cantidadTexto(recepcion[l.id].recibido, l.insumo.unidad_medida as UnidadInsumo)} · ${cantidadTexto(recepcion[l.id].cerrado, l.insumo.unidad_medida as UnidadInsumo)} cerrados`
                            : "Recibido completo"
                          : recepcion[l.id].recibido > 0
                            ? `Recibido ${cantidadTexto(recepcion[l.id].recibido, l.insumo.unidad_medida as UnidadInsumo)} · faltan ${cantidadTexto(recepcion[l.id].pendiente, l.insumo.unidad_medida as UnidadInsumo)}`
                            : "Sin recibir todavía"}
                      </p>
                    )}
                  </div>
                  <p className="tabular-nums text-tinta">{soles(Number(l.subtotal ?? 0))}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <dl className="divide-y divide-tinta/10 overflow-hidden rounded-xl border border-sand bg-crema text-[13px]">
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{soles(c.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>IGV</dt>
            <dd className="tabular-nums">{c.tipo === "factura" ? soles(c.igv) : "no aplica"}</dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt className="font-semibold">Total</dt>
            <dd className="tabular-nums font-semibold">{soles(c.total)}</dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>Pagado</dt>
            <dd className="tabular-nums">{soles(c.pagado)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <dt className="font-semibold">Saldo</dt>
            <dd className="font-display text-lg tabular-nums">{soles(c.saldo)}</dd>
          </div>
        </dl>

        {pagos && pagos.length > 0 && (
          <section aria-label="Pagos">
            <h3 className="label-cayla mb-2 text-[11px] text-tinta/65">Pagos</h3>
            <ul>
              {pagos.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 border-b border-tinta/10 py-2 text-[13px]">
                  <span className="text-tinta">
                    {etiquetaMetodo(p.metodo)}
                    <small className="ml-2 text-xs text-tinta/65">
                      {diaMes(p.fecha)}
                      {p.referencia ? ` · ${p.referencia}` : ""}
                    </small>
                  </span>
                  <span className="tabular-nums">{soles(Number(p.monto))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {c.nota && <p className="text-[13px] text-tinta/75">Nota: {c.nota}</p>}

        {puedeAnular &&
          (anulando ? (
            <div className="anim-entra space-y-2.5 rounded-xl border border-sand bg-crema p-3">
              <CampoTexto etiqueta="Motivo de la anulación" placeholder="Por qué se anula" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Boton peso="discreto" type="button" onClick={() => setAnulando(false)}>
                  Volver
                </Boton>
                <Boton peso="primario" type="button" cargando={cargando} disabled={!motivo.trim()} onClick={anular} className="flex-1">
                  {cargando ? "Anulando…" : "Anular comprobante"}
                </Boton>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAnulando(true)} className="text-xs text-tinta/70 underline underline-offset-2 outline-none hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60">
              Anular este comprobante
            </button>
          ))}
        {c.estado === "vigente" && pagos && pagos.length > 0 && <p className="text-xs text-tinta/65">Con pagos registrados no se puede anular: dejaría dinero sin respaldo.</p>}
        {c.estado === "vigente" && hayRecepcion && <p className="text-xs text-tinta/65">Con mercadería recibida no se puede anular: dejaría stock sin respaldo.</p>}
      </div>
    </Modal>
  );
}
