"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Comprobante, SerieComprobante, TipoComprobante } from "@/lib/comprobantes";
import { Ayuda } from "@/components/Ayuda";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";

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

/** Una línea del comprobante tal como se escribe en el mostrador: con el
 *  precio que ve la clienta, o sea CON IGV. La conversión a precio sin IGV
 *  (que es lo que guarda `comprobantes.items` y transmite Lucode) se hace al
 *  emitir, en un solo lugar. */
type ItemForm = { descripcion: string; cantidad: number; valorUnitario: number };

const ITEM_VACIO: ItemForm = { descripcion: "", cantidad: 1, valorUnitario: 0 };
const IGV_FACTOR = 1.18;

function totalItem(item: ItemForm) {
  return Math.round(item.cantidad * item.valorUnitario * 100) / 100;
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

  // Transmisión a Lucode (Fase 1, ADR-0009) — por fila, no un solo estado
  // global: transmitir la fila 3 no debe deshabilitar el botón de la fila 1.
  const [transmitiendoId, setTransmitiendoId] = useState<string | null>(null);
  const [errorTransmision, setErrorTransmision] = useState<{ id: string; detalle: string } | null>(null);

  async function onTransmitir(comprobanteId: string) {
    setTransmitiendoId(comprobanteId);
    setErrorTransmision(null);
    try {
      const respuesta = await fetch("/api/lucode/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comprobante_id: comprobanteId }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        setErrorTransmision({ id: comprobanteId, detalle: datos.error ?? "No se pudo transmitir" });
        return;
      }
      router.refresh();
    } catch {
      setErrorTransmision({ id: comprobanteId, detalle: "No se pudo conectar con el servidor" });
    } finally {
      setTransmitiendoId(null);
    }
  }

  // Formulario de emisión
  const [sedeId, setSedeId] = useState(sedeActualId);
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");
  // El total NO se escribe a mano: sale de los ítems. Un total tecleado que no
  // cuadre con las líneas es un comprobante que SUNAT rechaza y un número
  // oficial quemado — mismo criterio que recalcular la plata server-side.
  const [items, setItems] = useState<ItemForm[]>([ITEM_VACIO]);
  const total = Math.round(items.reduce((acc, it) => acc + totalItem(it), 0) * 100) / 100;
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  // Estado imposible eliminado por diseño: el tipo de documento NO es un estado
  // aparte que pueda contradecir al tipo de comprobante — se deriva de él. Antes,
  // tipear un DNI y luego cambiar a Factura dejaba "factura + dni", y la venta se
  // caía recién al apretar Emitir, con la clienta esperando en el mostrador.
  const clienteTipoDoc: "dni" | "ruc" | "sin_documento" =
    tipo === "factura" ? "ruc" : clienteNumDoc ? "dni" : "sin_documento";

  // Formulario de serie
  const [serieSedeId, setSerieSedeId] = useState(sedeActualId);
  const [serieTipo, setSerieTipo] = useState<TipoComprobante>("boleta");
  const [serieTexto, setSerieTexto] = useState("");
  // Vacío = el sistema sigue llevando el correlativo solo. Se llena únicamente
  // para continuar una serie que ya venía emitiéndose fuera de este sistema.
  const [serieNumero, setSerieNumero] = useState("");

  const totalMes = comprobantes.reduce((acc, c) => acc + Number(c.total), 0);
  const pendientes = comprobantes.filter((c) => c.estado === "pendiente" || c.estado === "enviado").length;
  const rechazados = comprobantes.filter((c) => c.estado === "rechazado").length;

  function actualizarItem(i: number, cambios: Partial<ItemForm>) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...cambios } : it)));
  }
  function agregarItem() {
    setItems((prev) => [...prev, { ...ITEM_VACIO }]);
  }
  function quitarItem(i: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  function cerrarModal() {
    setModal(null);
    setError(null);
    setItems([{ ...ITEM_VACIO }]);
    setClienteNumDoc("");
    setClienteNombre("");
    setSerieTexto("");
    setSerieNumero("");
  }

  async function onEmitir(e: React.FormEvent) {
    e.preventDefault();
    const itemsValidos = items.filter((it) => it.descripcion.trim() && it.cantidad > 0 && it.valorUnitario > 0);
    if (itemsValidos.length === 0) {
      setError("Agrega al menos un ítem con descripción, cantidad y precio.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // El precio se escribe CON IGV (es el que ve la clienta); SUNAT y
    // `comprobantes.items` lo quieren SIN IGV. La conversión ocurre solo aquí.
    const igv = Math.round((total - total / IGV_FACTOR) * 100) / 100;
    const subtotal = Math.round((total - igv) * 100) / 100;
    const { error } = await supabase.rpc("emitir_comprobante", {
      p_items: itemsValidos.map((it) => ({
        descripcion: it.descripcion.trim(),
        cantidad: it.cantidad,
        // 6 decimales: Lucode recalcula el total desde este precio y un
        // céntimo de diferencia hace que SUNAT rechace el comprobante entero.
        precio_unitario: Number((it.valorUnitario / IGV_FACTOR).toFixed(6)),
      })),
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
      // undefined se cae del JSON: sin número, la RPC no toca el correlativo.
      p_siguiente_numero: serieNumero ? Number(serieNumero) : undefined,
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
              La serie identifica desde qué tienda salió el comprobante: una letra según el tipo
              (B para boleta, F para factura) más tres dígitos. En facturación electrónica las
              defines tú, no SUNAT — no hay que pedir autorización. Lo normal es una serie por
              tienda (B004 Trujillo, B005 Arequipa, B006 Lima) para saber de dónde vino cada venta.
              Regístrala una sola vez por sede y tipo; el correlativo lo lleva el sistema.
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
                  <th className="label-cayla px-3 py-2 text-[9px]">SUNAT</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Imprimir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {comprobantes.map((c) => {
                  const puedeTransmitir = c.estado === "pendiente" || c.estado === "rechazado";
                  return (
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
                      <td className="px-3 py-2.5">
                        {puedeTransmitir ? (
                          <button
                            type="button"
                            onClick={() => onTransmitir(c.id)}
                            disabled={transmitiendoId === c.id}
                            className="label-cayla text-[9px] text-rojo underline decoration-rojo/40 underline-offset-2 hover:decoration-rojo disabled:text-tinta/30 disabled:no-underline"
                          >
                            {transmitiendoId === c.id ? "Transmitiendo…" : "Transmitir"}
                          </button>
                        ) : (
                          <span className="text-tinta/30">—</span>
                        )}
                        {errorTransmision?.id === c.id && (
                          <p className="mt-1 max-w-48 text-[10px] text-rojo/80">{errorTransmision.detalle}</p>
                        )}
                      </td>
                      {/* Impresión: el A4 se descarga del servidor y el ticket
                          abre la vista optimizada para la Epson TM-T20III. Se
                          puede imprimir aunque SUNAT todavía no responda — el
                          número ya es oficial desde que se reservó. */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/api/comprobantes/${c.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="label-cayla border border-tinta/20 px-2 py-1 text-[9px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo"
                          >
                            A4
                          </a>
                          <a
                            href={`/comprobantes/${c.id}/ticket`}
                            target="_blank"
                            rel="noreferrer"
                            className="label-cayla border border-tinta/20 px-2 py-1 text-[9px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo"
                          >
                            Ticket
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                    onClick={() => {
                      setTipo(t);
                      setClienteNumDoc("");
                      setClienteNombre("");
                    }}
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
              <div className="mb-1 flex items-center justify-between">
                <label className="label-cayla block text-[9px] text-tinta/45">Ítems (precio incluye IGV)</label>
                <button type="button" onClick={agregarItem} className="label-cayla text-[9px] text-tinta/50 hover:text-rojo">
                  + Agregar ítem
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex items-end gap-1.5 border border-tinta/10 p-2">
                    <div className="flex-1">
                      <input
                        placeholder="Descripción"
                        value={item.descripcion}
                        onChange={(e) => actualizarItem(i, { descripcion: e.target.value })}
                        className="w-full border border-tinta/20 bg-crema px-2 py-1.5 text-xs"
                      />
                      <div className="mt-1 flex gap-1.5">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          placeholder="Cant."
                          value={item.cantidad || ""}
                          onChange={(e) => actualizarItem(i, { cantidad: Number(e.target.value) })}
                          className="w-16 border border-tinta/20 bg-crema px-2 py-1.5 text-xs"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Precio"
                          value={item.valorUnitario || ""}
                          onChange={(e) => actualizarItem(i, { valorUnitario: Number(e.target.value) })}
                          className="w-24 border border-tinta/20 bg-crema px-2 py-1.5 text-xs"
                        />
                        <span className="flex-1 self-center text-right text-xs text-tinta/60">{money(totalItem(item))}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => quitarItem(i)}
                      disabled={items.length === 1}
                      className="shrink-0 px-1.5 py-1.5 text-xs text-tinta/40 hover:text-rojo disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-tinta/10 pt-2">
                <span className="label-cayla text-[9px] text-tinta/45">Total</span>
                <span className="font-display text-lg text-tinta">{money(total)}</span>
              </div>
            </div>

            <ConsultaDocumento
              tipo={tipo === "factura" ? "ruc" : "dni"}
              obligatorio={tipo === "factura"}
              numero={clienteNumDoc}
              onNumero={setClienteNumDoc}
              nombre={clienteNombre}
              onNombre={setClienteNombre}
            />

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
              <label className="label-cayla block text-[9px] text-tinta/45">Serie (B### para boleta, F### para factura)</label>
              <input
                required
                value={serieTexto}
                onChange={(e) => setSerieTexto(e.target.value.toUpperCase())}
                maxLength={4}
                placeholder={serieTipo === "factura" ? "F001" : "B001"}
                className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm uppercase"
              />
            </div>
            <div>
              <label className="label-cayla block text-[9px] text-tinta/45">
                Próximo número
                <Ayuda titulo="Próximo número">
                  Déjalo vacío si esta serie empieza de cero: el sistema arranca en 1 y lleva el
                  correlativo solo. Llénalo únicamente si esta serie ya venía emitiéndose fuera de
                  este sistema — pon el número que sigue al último emitido. Mandarle a SUNAT un
                  número ya usado hace que el comprobante se rechace por duplicado.
                </Ayuda>
              </label>
              <input
                type="number"
                min="1"
                value={serieNumero}
                onChange={(e) => setSerieNumero(e.target.value)}
                placeholder="1"
                className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm"
              />
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
