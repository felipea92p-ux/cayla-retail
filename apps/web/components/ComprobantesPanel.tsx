"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Comprobante, SerieComprobante, TipoComprobante } from "@/lib/comprobantes";
import { Ayuda } from "@/components/Ayuda";

type Sede = { id: string; codigo: string };

const ETIQUETA_TIPO: Record<TipoComprobante, string> = {
  boleta: "Boleta",
  factura: "Factura",
  nota_credito: "Nota de crédito",
};

const ESTADO_ESTILO: Record<Comprobante["estado"], string> = {
  pendiente: "border-ambar/30 bg-ambar/10 text-ambar",
  enviado: "border-ambar/30 bg-ambar/10 text-ambar",
  aceptado: "border-verde/45 bg-verde/10 text-verde",
  rechazado: "border-rojo/30 bg-rojo/10 text-rojo",
  anulado: "border-tinta/20 bg-tinta/5 text-tinta/45",
};

const ESTADO_ETIQUETA: Record<Comprobante["estado"], string> = {
  pendiente: "Pendiente de enviar",
  enviado: "Enviado a SUNAT",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  anulado: "Anulado",
};

function money(n: number) {
  return "S/" + n.toFixed(2);
}

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

// Panel de Facturación electrónica (F3, parte 1): reserva comprobantes con su
// correlativo oficial ya mismo — el envío a SUNAT (firma XML, SOAP, CDR) es un
// paso aparte, deliberadamente no construido todavía (ver nota en el modal de
// emisión). Mismo patrón que EfectivoPanel: un componente, dos modales, una tabla.
export function ComprobantesPanel({
  comprobantes,
  series,
  sedes,
  sedeActualId,
}: {
  comprobantes: Comprobante[];
  series: SerieComprobante[];
  sedes: Sede[];
  sedeActualId: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"emitir" | "serie" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulario de emisión
  const [sedeId, setSedeId] = useState(sedeActualId);
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");
  const [total, setTotal] = useState(0);
  const [clienteTipoDoc, setClienteTipoDoc] = useState<"dni" | "ruc" | "sin_documento">("sin_documento");
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");

  // Formulario de serie
  const [serieSedeId, setSerieSedeId] = useState(sedeActualId);
  const [serieTipo, setSerieTipo] = useState<TipoComprobante>("boleta");
  const [serieTexto, setSerieTexto] = useState("");

  const totalMes = comprobantes.reduce((acc, c) => acc + Number(c.total), 0);
  const pendientes = comprobantes.filter((c) => c.estado === "pendiente" || c.estado === "enviado").length;
  const rechazados = comprobantes.filter((c) => c.estado === "rechazado").length;

  function cerrarModal() {
    setModal(null);
    setError(null);
    setTotal(0);
    setClienteTipoDoc("sin_documento");
    setClienteNumDoc("");
    setClienteNombre("");
    setSerieTexto("");
  }

  async function onEmitir(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // IGV incluido en el total (19.83% del total = IGV, práctica estándar
    // cuando el precio ya lo incluye) — la desagregación exacta por línea
    // queda para cuando esto se conecte a `ventas` (ver nota al pie).
    const igv = Math.round((total - total / 1.18) * 100) / 100;
    const subtotal = Math.round((total - igv) * 100) / 100;
    const { error } = await supabase.rpc("emitir_comprobante", {
      p_sede_id: sedeId,
      p_tipo: tipo,
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: clienteNombre || undefined,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    cerrarModal();
    router.refresh();
  }

  async function onRegistrarSerie(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_serie_comprobante", {
      p_sede_id: serieSedeId,
      p_tipo: serieTipo,
      p_serie: serieTexto,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    cerrarModal();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Resumen del mes */}
      <div className="grid grid-cols-2 gap-px border border-tinta/10 bg-tinta/10 sm:grid-cols-3">
        <div className="bg-crema p-4">
          <p className="label-cayla text-[9px] text-tinta/45">Emitidos este mes</p>
          <p className="font-display mt-1 text-2xl text-tinta">{comprobantes.length}</p>
        </div>
        <div className="bg-crema p-4">
          <p className="label-cayla text-[9px] text-tinta/45">Monto facturado</p>
          <p className="font-display mt-1 text-2xl text-tinta">{money(totalMes)}</p>
        </div>
        <div className="bg-crema p-4">
          <p className="label-cayla text-[9px] text-tinta/45">
            Pendientes de enviar
            <Ayuda titulo="Pendiente de enviar">
              El comprobante ya tiene su número oficial reservado (nadie más puede usarlo), pero
              todavía no se transmitió a SUNAT. Si SUNAT está caída, el número no se pierde: se
              reintenta después.
            </Ayuda>
          </p>
          <p className={`font-display mt-1 text-2xl ${pendientes > 0 ? "text-ambar" : "text-tinta"}`}>{pendientes}</p>
          {rechazados > 0 && <p className="mt-0.5 text-xs text-rojo">{rechazados} rechazado{rechazados > 1 ? "s" : ""}</p>}
        </div>
      </div>

      {/* Series registradas */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label-cayla text-[10px] text-tinta/45">
            Series por sede
            <Ayuda titulo="Series de comprobantes">
              SUNAT asigna una serie (por ejemplo B001 para boletas, F001 para facturas) a cada
              punto de emisión antes de poder facturar desde ahí. Regístrala aquí una sola vez por
              sede y tipo — el sistema lleva el correlativo solo desde entonces.
            </Ayuda>
          </h2>
          <button
            onClick={() => setModal("serie")}
            className="label-cayla border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo"
          >
            Registrar serie
          </button>
        </div>
        {series.length === 0 ? (
          <p className="font-display card-cayla py-6 text-center text-base italic text-tinta/40">
            Ninguna sede tiene serie registrada todavía. Sin esto, no se puede emitir nada.
          </p>
        ) : (
          <div className="grid gap-px border border-tinta/10 bg-tinta/10 sm:grid-cols-3">
            {series.map((s) => {
              const sede = sedes.find((sd) => sd.id === s.sede_id);
              return (
                <div key={s.id} className="bg-crema p-3">
                  <p className="text-xs text-tinta/50">{sede?.codigo ?? "—"} · {ETIQUETA_TIPO[s.tipo]}</p>
                  <p className="font-display mt-0.5 text-lg text-tinta">
                    {s.serie}-{String(s.siguiente_numero).padStart(6, "0")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-tinta/40">próximo número</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Comprobantes del mes */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label-cayla text-[10px] text-tinta/45">Comprobantes</h2>
          <button
            onClick={() => setModal("emitir")}
            className="label-cayla bg-tinta px-3 py-2 text-[10px] text-crema transition-colors hover:bg-rojo"
          >
            Emitir comprobante
          </button>
        </div>
        {comprobantes.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/40">
            Sin comprobantes emitidos este mes.
          </p>
        ) : (
          <div className="overflow-x-auto card-cayla">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/40">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[9px]">Fecha</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Comprobante</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Cliente</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Total</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {comprobantes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2.5 text-tinta/60">{formatearFecha(c.created_at)}</td>
                    <td className="px-3 py-2.5 font-medium text-tinta">
                      {ETIQUETA_TIPO[c.tipo]} {c.serie}-{String(c.numero).padStart(6, "0")}
                    </td>
                    <td className="px-3 py-2.5 text-tinta/60">{c.cliente_nombre ?? "Cliente varios"}</td>
                    <td className="px-3 py-2.5 font-medium text-tinta">{money(Number(c.total))}</td>
                    <td className="px-3 py-2.5">
                      <span className={`label-cayla rounded-full border px-3 py-1 text-[9px] ${ESTADO_ESTILO[c.estado]}`}>
                        {ESTADO_ETIQUETA[c.estado]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== Modal: emitir comprobante ==================== */}
      {modal === "emitir" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={cerrarModal}>
          <div className="absolute inset-0 bg-tinta/30" />
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={onEmitir}
            className="relative w-full max-w-md space-y-4 border border-sand bg-papel p-5 sm:rounded-xl"
          >
            <h3 className="font-display text-lg text-tinta">Emitir comprobante</h3>

            <div className="rounded-md border border-ambar/30 bg-ambar/10 px-3 py-2 text-xs text-tinta/70">
              Esto reserva el número oficial y guarda el comprobante. El envío a SUNAT todavía no
              está conectado — ver el punto pendiente que Claude le explicó a Felipe sobre SEE
              propio vs. OSE. El comprobante queda &ldquo;Pendiente de enviar&rdquo; hasta que esa
              decisión se tome.
            </div>

            <div>
              <label className="label-cayla block text-[9px] text-tinta/45">Sede</label>
              <select value={sedeId} onChange={(e) => setSedeId(e.target.value)} className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm">
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.codigo}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-cayla block text-[9px] text-tinta/45">Tipo</label>
              <div className="mt-1 flex gap-2">
                {(["boleta", "factura"] as TipoComprobante[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`label-cayla flex-1 border px-3 py-2 text-[10px] transition-colors ${
                      tipo === t ? "border-rojo bg-rojo/10 text-rojo" : "border-tinta/20 text-tinta/50"
                    }`}
                  >
                    {ETIQUETA_TIPO[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label-cayla block text-[9px] text-tinta/45">Total (incluye IGV)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={total || ""}
                onChange={(e) => setTotal(Number(e.target.value))}
                className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm"
              />
            </div>

            {tipo === "factura" ? (
              <>
                <div>
                  <label className="label-cayla block text-[9px] text-tinta/45">RUC del cliente</label>
                  <input
                    required
                    value={clienteNumDoc}
                    onChange={(e) => { setClienteNumDoc(e.target.value); setClienteTipoDoc("ruc"); }}
                    className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="label-cayla block text-[9px] text-tinta/45">Razón social</label>
                  <input
                    required
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="label-cayla block text-[9px] text-tinta/45">DNI del cliente (opcional)</label>
                <input
                  value={clienteNumDoc}
                  onChange={(e) => { setClienteNumDoc(e.target.value); setClienteTipoDoc(e.target.value ? "dni" : "sin_documento"); }}
                  className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm"
                />
              </div>
            )}

            {error && <p className="text-xs text-rojo">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={cerrarModal} className="flex-1 border border-tinta/20 py-2.5 text-sm text-tinta/60">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="flex-1 bg-tinta py-2.5 text-sm text-crema transition-colors hover:bg-rojo disabled:opacity-50">
                {loading ? "Emitiendo…" : "Emitir"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== Modal: registrar serie ==================== */}
      {modal === "serie" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={cerrarModal}>
          <div className="absolute inset-0 bg-tinta/30" />
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={onRegistrarSerie}
            className="relative w-full max-w-sm space-y-4 border border-sand bg-papel p-5 sm:rounded-xl"
          >
            <h3 className="font-display text-lg text-tinta">Registrar serie</h3>
            <div>
              <label className="label-cayla block text-[9px] text-tinta/45">Sede</label>
              <select value={serieSedeId} onChange={(e) => setSerieSedeId(e.target.value)} className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm">
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.codigo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-cayla block text-[9px] text-tinta/45">Tipo</label>
              <select value={serieTipo} onChange={(e) => setSerieTipo(e.target.value as TipoComprobante)} className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm">
                <option value="boleta">Boleta</option>
                <option value="factura">Factura</option>
              </select>
            </div>
            <div>
              <label className="label-cayla block text-[9px] text-tinta/45">Serie (la que dio SUNAT, ej. B001)</label>
              <input required value={serieTexto} onChange={(e) => setSerieTexto(e.target.value.toUpperCase())} maxLength={4} className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm uppercase" />
            </div>
            {error && <p className="text-xs text-rojo">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={cerrarModal} className="flex-1 border border-tinta/20 py-2.5 text-sm text-tinta/60">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="flex-1 bg-tinta py-2.5 text-sm text-crema transition-colors hover:bg-rojo disabled:opacity-50">
                {loading ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
