"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Comprobante, SerieComprobante, TipoComprobante } from "@/lib/comprobantes";
import { Ayuda } from "@/components/Ayuda";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, CampoTexto, Segmentado } from "@/components/ui/campos";

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
  // Vacío = el sistema sigue llevando el correlativo solo. Se llena únicamente
  // para continuar una serie que ya venía emitiéndose fuera de este sistema.
  const [serieNumero, setSerieNumero] = useState("");

  const totalMes = comprobantes.reduce((acc, c) => acc + Number(c.total), 0);
  const pendientes = comprobantes.filter((c) => c.estado === "pendiente" || c.estado === "enviado").length;
  const rechazados = comprobantes.filter((c) => c.estado === "rechazado").length;

  // Serie que le toca a la combinación elegida en el modal de emisión. Es
  // derivado puro de props + estado que ya existían: no consulta nada nuevo.
  const serieDelComprobante = series.find((s) => s.sede_id === sedeId && s.tipo === tipo);

  function cerrarModal() {
    setModal(null);
    setError(null);
    setTotal(0);
    setClienteNumDoc("");
    setClienteNombre("");
    setSerieTexto("");
    setSerieNumero("");
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
          <Boton peso="discreto" onClick={() => setModal("serie")}>
            Registrar serie
          </Boton>
        </div>
        {series.length === 0 ? (
          <p className="font-display card-cayla py-6 text-center text-base italic text-tinta/40">
            Ninguna sede tiene serie registrada todavía. Sin esto, no se puede emitir nada.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-px border border-tinta/10 bg-tinta/10 sm:grid-cols-3">
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
          <Boton peso="primario" onClick={() => setModal("emitir")}>
            Emitir comprobante
          </Boton>
        </div>
        {comprobantes.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/40">
            Sin comprobantes emitidos este mes.
          </p>
        ) : (
          <div className="overflow-x-auto card-cayla">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/40">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[9px]">Fecha</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Comprobante</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Cliente</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Total</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Estado</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">SUNAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {comprobantes.map((c) => {
                  const puedeTransmitir = c.estado === "pendiente" || c.estado === "rechazado";
                  return (
                    <tr key={c.id} className="transition-colors duration-150 hover:bg-tinta/[0.025]">
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
                          <Boton
                            type="button"
                            peso="discreto"
                            onClick={() => onTransmitir(c.id)}
                            cargando={transmitiendoId === c.id}
                            className="border-rojo/30 px-2.5 py-1.5 text-[9px] text-rojo hover:bg-rojo/8"
                          >
                            {transmitiendoId === c.id ? "Transmitiendo…" : "Transmitir"}
                          </Boton>
                        ) : (
                          <span className="text-tinta/30">—</span>
                        )}
                        {errorTransmision?.id === c.id && (
                          <p className="mt-1 max-w-[14rem] whitespace-normal text-[10px] leading-snug text-rojo/80">{errorTransmision.detalle}</p>
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
        <Modal titulo="Emitir comprobante" ancho="max-w-md" onClose={cerrarModal}>
          <form onSubmit={onEmitir} className="mt-5 space-y-2">
            {/* Sede y tipo son las dos decisiones que determinan el correlativo,
                así que van juntas y arriba de él: se leen como los dos diales
                que mueven la cifra de abajo. */}
            <div className="grid gap-x-5 sm:grid-cols-2">
            <CampoSelect
              etiqueta="Sede"
              valor={sedeId}
              onValor={setSedeId}
              opciones={sedes.map((s) => ({ valor: s.id, texto: s.codigo }))}
            />

            <Segmentado
              etiqueta="Tipo"
              valor={tipo}
              onValor={(t) => {
                setTipo(t);
                setClienteNumDoc("");
                setClienteNombre("");
              }}
              opciones={[
                { valor: "boleta", texto: ETIQUETA_TIPO.boleta },
                { valor: "factura", texto: ETIQUETA_TIPO.factura },
              ] as const}
            />
            </div>

            {/* El número que se va a reservar, antes de reservarlo. Es lo más
                importante del formulario: un correlativo es irreversible y hasta
                ahora solo se veía DESPUÉS de emitir, en la tabla. El dato ya
                llegaba en `series`; lo único que faltaba era mostrarlo.
                La `key` fuerza el remontaje para que la cifra se re-asiente
                cuando cambia la sede o el tipo — así el ojo nota que cambió. */}
            <div className="-mx-6 border-y border-sand bg-papel px-6 py-3.5">
              <p className="label-cayla text-[9px] text-tinta/40">Se va a reservar el número</p>
              {serieDelComprobante ? (
                <p
                  key={`${serieDelComprobante.serie}-${serieDelComprobante.siguiente_numero}`}
                  className="font-display anim-asentar mt-1.5 text-[1.75rem] leading-none tabular-nums text-tinta"
                >
                  {serieDelComprobante.serie}
                  <span className="text-tinta/25">-</span>
                  {String(serieDelComprobante.siguiente_numero).padStart(6, "0")}
                </p>
              ) : (
                <p className="anim-asentar mt-1.5 text-xs leading-relaxed text-ambar">
                  {sedes.find((s) => s.id === sedeId)?.codigo ?? "Esta sede"} todavía no tiene serie de{" "}
                  {ETIQUETA_TIPO[tipo].toLowerCase()} registrada. Regístrala antes de emitir.
                </p>
              )}
            </div>

            <CampoMonto
              etiqueta="Total (incluye IGV)"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={total || ""}
              onChange={(e) => setTotal(Number(e.target.value))}
            />

            <ConsultaDocumento
              tipo={tipo === "factura" ? "ruc" : "dni"}
              obligatorio={tipo === "factura"}
              numero={clienteNumDoc}
              onNumero={setClienteNumDoc}
              nombre={clienteNombre}
              onNombre={setClienteNombre}
            />

            {/* La nota va acá abajo y no arriba: explica qué pasa DESPUÉS de
                apretar Emitir, así que se lee junto al botón que lo provoca. */}
            <p className="border-l-2 border-ambar/50 pl-3 text-[11px] leading-relaxed text-tinta/60">
              Esto reserva el número oficial y guarda el comprobante. El envío a SUNAT todavía no
              está conectado — ver el punto pendiente que Claude le explicó a Felipe sobre SEE
              propio vs. OSE. El comprobante queda &ldquo;Pendiente de enviar&rdquo; hasta que esa
              decisión se tome.
            </p>

            {error && (
              <p className="anim-revelar border-l-2 border-rojo pl-3 text-xs leading-relaxed text-rojo">{error}</p>
            )}

            <div className="flex gap-2 pt-3">
              <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrarModal}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
                {loading ? "Emitiendo…" : "Emitir"}
              </Boton>
            </div>
          </form>
        </Modal>
      )}

      {/* ==================== Modal: registrar serie ==================== */}
      {modal === "serie" && (
        <Modal titulo="Registrar serie" onClose={cerrarModal}>
          <form onSubmit={onRegistrarSerie} className="mt-5 space-y-2">
            <CampoSelect
              etiqueta="Sede"
              valor={serieSedeId}
              onValor={setSerieSedeId}
              opciones={sedes.map((s) => ({ valor: s.id, texto: s.codigo }))}
            />
            <CampoSelect
              etiqueta="Tipo"
              valor={serieTipo}
              onValor={setSerieTipo}
              opciones={[
                { valor: "boleta", texto: ETIQUETA_TIPO.boleta },
                { valor: "factura", texto: ETIQUETA_TIPO.factura },
              ] as const}
            />
            <CampoTexto
              etiqueta="Serie"
              pie="Una letra según el tipo más tres dígitos."
              mono
              required
              value={serieTexto}
              onChange={(e) => setSerieTexto(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder={serieTipo === "factura" ? "F001" : "B001"}
              className="uppercase"
            />
            <CampoTexto
              etiqueta="Próximo número"
              ayuda={
                <Ayuda titulo="Próximo número">
                  Déjalo vacío si esta serie empieza de cero: el sistema arranca en 1 y lleva el
                  correlativo solo. Llénalo únicamente si esta serie ya venía emitiéndose fuera de
                  este sistema — pon el número que sigue al último emitido. Mandarle a SUNAT un
                  número ya usado hace que el comprobante se rechace por duplicado.
                </Ayuda>
              }
              pie="Vacío = el sistema lo lleva solo."
              mono
              type="number"
              min="1"
              value={serieNumero}
              onChange={(e) => setSerieNumero(e.target.value)}
              placeholder="1"
            />
            {error && (
              <p className="anim-revelar border-l-2 border-rojo pl-3 text-xs leading-relaxed text-rojo">{error}</p>
            )}
            <div className="flex gap-2 pt-3">
              <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrarModal}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
                {loading ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
