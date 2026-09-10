"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Comprobante, RespuestaSunat, SerieComprobante, TipoComprobante } from "@/lib/comprobantes";
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

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

// El PDF es lo que se le entrega a la clienta; el CDR es la constancia de SUNAT
// —el papel que prueba que el comprobante fue aceptado— y es lo que pide el
// contador cuando algo se discute. Lucode los devuelve al transmitir y hasta
// ahora la pantalla los tiraba: quedaban guardados en `respuesta_sunat` y no
// había forma de llegar a ellos sin abrir la base.
function EnlacesDocumento({ respuesta }: { respuesta: RespuestaSunat }) {
  const enlaces = [
    { url: respuesta?.pdfUrl, etiqueta: "PDF", titulo: "Comprobante en PDF, para la clienta" },
    { url: respuesta?.cdrUrl, etiqueta: "CDR", titulo: "Constancia de recepción de SUNAT" },
  ].filter((e): e is { url: string; etiqueta: string; titulo: string } => typeof e.url === "string" && e.url.length > 0);

  if (enlaces.length === 0) return <span className="text-tinta/30">—</span>;

  return (
    <span className="flex items-center gap-3">
      {enlaces.map((e) => (
        <a
          key={e.etiqueta}
          href={e.url}
          target="_blank"
          rel="noopener noreferrer"
          title={e.titulo}
          className="label-cayla text-[9px] text-tinta/60 underline decoration-tinta/25 underline-offset-2 transition-colors hover:text-rojo hover:decoration-rojo"
        >
          {e.etiqueta}
        </a>
      ))}
    </span>
  );
}

// Panel de Facturación electrónica: reserva el correlativo oficial con
// `emitir_comprobante` y transmite a SUNAT vía Lucode con el botón "Transmitir"
// de cada fila (la firma del XML y el CDR los hace el PSE, ADR-0005). Mismo
// patrón que EfectivoPanel: un componente, dos modales, una tabla.
export function ComprobantesPanel({
  comprobantes,
  series,
  sedes,
  sedeActualId,
  puedeAdministrarSeries,
}: {
  comprobantes: Comprobante[];
  series: SerieComprobante[];
  sedes: Sede[];
  sedeActualId: string;
  /** Solo un Líder registra la serie que autorizó SUNAT y elige la sede del
   *  comprobante. Emitir y transmitir lo puede hacer cualquiera con sesión —
   *  quien atiende el mostrador es quien cierra la venta, y la base ya rechaza
   *  emitir a nombre de una sede ajena (`puede_operar_sede`). */
  puedeAdministrarSeries: boolean;
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
  const [total, setTotal] = useState(0);
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

  const totalMes = comprobantes.reduce((acc, c) => acc + Number(c.total), 0);
  const pendientes = comprobantes.filter((c) => c.estado === "pendiente" || c.estado === "enviado").length;
  const rechazados = comprobantes.filter((c) => c.estado === "rechazado").length;

  function cerrarModal() {
    setModal(null);
    setError(null);
    setTotal(0);
    setClienteNumDoc("");
    setClienteNombre("");
    setSerieTexto("");
  }

  async function onEmitir(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // El precio de CAYLA ya incluye IGV, así que se desagrega hacia atrás.
    //
    // DOS NÚMEROS, DOS PRECISIONES, A PROPÓSITO:
    //  - `subtotal`/`igv` van redondeados a céntimo porque son plata: es lo que
    //    entra a la contabilidad y a `comprobantes`, y un asiento contable no
    //    lleva millonésimas.
    //  - el `precio_unitario` del ítem va SIN redondear (6 decimales, lo que
    //    Lucode acepta) porque no es plata: es el factor con el que SUNAT
    //    recompone el total. Reproducido antes de tocarlo: con el valor
    //    redondeado, el 15,3% de los precios entre S/1 y S/2.000 descuadra un
    //    céntimo — entre ellos S/19.90, S/109.90, S/129.90 y S/349.90, que son
    //    precios reales de CAYLA. Una boleta de S/129.90 le declaraba a SUNAT
    //    110.08 × 1.18 = 129.89 mientras la caja decía 129.90, y ese céntimo
    //    diario por boleta no lo iba a encontrar nadie. Con 6 decimales el
    //    mismo barrido da 0 descuadres.
    //
    // Mandar `p_items` explícito además arregla el estado imposible de raíz: el
    // payload ya no puede llevar dos importes que se contradigan. El ítem
    // genérico que arma la RPC sola queda como red de seguridad, no como el
    // camino normal.
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
      p_items: [
        {
          descripcion: "Venta de mercadería",
          cantidad: 1,
          precio_unitario: Number((total / 1.18).toFixed(6)),
        },
      ],
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
          {puedeAdministrarSeries && (
            <button
              onClick={() => setModal("serie")}
              className="label-cayla border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo"
            >
              Registrar serie
            </button>
          )}
        </div>
        {series.length === 0 ? (
          <p className="font-display card-cayla py-6 text-center text-base italic text-tinta/40">
            Ninguna sede tiene serie registrada todavía. Sin esto, no se puede emitir nada.
            {!puedeAdministrarSeries && " Pídeselo a un Líder: es de una sola vez por sede."}
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
                  <th className="label-cayla px-3 py-2 text-[9px]">Documento</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">SUNAT</th>
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
                        <EnlacesDocumento respuesta={c.respuesta_sunat} />
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
            <p className="text-xs text-tinta/50">
              Reserva el número oficial y guarda el comprobante. Después, con
              &ldquo;Transmitir&rdquo; en la fila, se envía a SUNAT y vuelve el PDF.
            </p>

            <div>
              <label className="label-cayla block text-[9px] text-tinta/45">Sede</label>
              {/* La sede es de Líder: una colaboradora emite siempre desde la
                  suya. No es solo estética — la base rechaza emitir a nombre de
                  otra sede, así que mostrarle un menú de sedes que no puede usar
                  solo la haría equivocarse con la clienta en el mostrador. */}
              {puedeAdministrarSeries ? (
                <select value={sedeId} onChange={(e) => setSedeId(e.target.value)} className="mt-1 w-full border border-tinta/20 bg-crema px-3 py-2 text-sm">
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.codigo}</option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 border border-tinta/10 bg-sand/40 px-3 py-2 text-sm text-tinta/70">
                  {sedes.find((s) => s.id === sedeId)?.codigo ?? "—"}
                </p>
              )}
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
      {modal === "serie" && puedeAdministrarSeries && (
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
