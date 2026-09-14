"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Comprobante, SerieComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";
import { ESTADO_ESTILO, ESTADO_ETIQUETA, ETIQUETA_TIPO, tipoDocumentoDeCliente } from "@/lib/comprobantes-reglas";
import { Ayuda } from "@/components/Ayuda";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, CampoTexto, Segmentado } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

type Ubicacion = { id: string; nombre: string };

// Un comprobante transmitido contra el sandbox de Lucode queda "aceptado" con
// su CDR y su PDF, exactamente igual que uno real — pero SUNAT nunca lo vio.
// La pantalla lo dice con palabras y con borde punteado; el color no alcanza,
// y el estado solo NO puede distinguirlos.
const ESTILO_PRUEBA = "border-dashed border-tinta/30 bg-tinta/5 text-tinta/75";

function esPrueba(c: Comprobante) {
  return c.entorno_transmision === "sandbox";
}
// La baja se pidió pero SUNAT no la confirmó: el resumen diario de boletas se
// procesa diferido. Decir "Anulado" acá sería adelantarse a SUNAT.
function anulacionEnTramite(c: Comprobante) {
  return c.estado === "aceptado" && c.anulacion_solicitada_at !== null;
}
function etiquetaEstado(c: Comprobante) {
  const base = anulacionEnTramite(c) ? "Anulación en trámite" : ESTADO_ETIQUETA[c.estado];
  return esPrueba(c) ? `${base} · prueba` : base;
}
function estiloEstado(c: Comprobante) {
  if (esPrueba(c)) return ESTILO_PRUEBA;
  if (anulacionEnTramite(c)) return "border-ambar/30 bg-ambar/10 text-ambar-profundo";
  return ESTADO_ESTILO[c.estado];
}

function money(n: number) {
  return "S/" + n.toFixed(2);
}

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

// Panel de Facturación electrónica: reserva el comprobante con su correlativo
// oficial ya mismo (RPC en Postgres puro) y lo transmite a SUNAT por Lucode en
// un paso aparte — el botón "Transmitir" de cada fila (ADR-0005, ADR-0009).
// Reservar y transmitir siguen separados a propósito: emitir no puede depender
// de que un proveedor externo esté arriba (principio 9).
// Mismo patrón que EfectivoPanel: un componente, dos modales, una tabla.
export function ComprobantesPanel({
  comprobantes,
  series,
  ubicaciones,
  ubicacionActualId,
}: {
  comprobantes: Comprobante[];
  series: SerieComprobante[];
  ubicaciones: Ubicacion[];
  ubicacionActualId: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"emitir" | "serie" | "anular" | null>(null);
  const [loading, setLoading] = useState(false);

  // Transmisión a Lucode (Fase 1, ADR-0009) — por fila, no un solo estado
  // global: transmitir la fila 3 no debe deshabilitar el botón de la fila 1.
  const [transmitiendoId, setTransmitiendoId] = useState<string | null>(null);

  async function onTransmitir(comprobanteId: string) {
    setTransmitiendoId(comprobanteId);
    const cerrarProceso = avisar.proceso("Transmitiendo a SUNAT…");
    try {
      const respuesta = await fetch("/api/lucode/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comprobante_id: comprobanteId }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        avisar.error("No se pudo transmitir el comprobante", { detalle: datos.error ?? undefined });
        return;
      }
      avisar.exito("Comprobante transmitido", { detalle: "SUNAT lo tiene; el estado se actualiza en la lista." });
      router.refresh();
    } catch {
      avisar.error("No se pudo transmitir el comprobante", { detalle: "No se pudo conectar con el servidor." });
    } finally {
      cerrarProceso();
      setTransmitiendoId(null);
    }
  }

  // Anulación (paso c, ADR-0016). Solo líder — la pantalla entera ya lo es,
  // pero `anular_comprobante` lo vuelve a exigir en la base.
  const [anulando, setAnulando] = useState<Comprobante | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [enviandoAnulacion, setEnviandoAnulacion] = useState(false);

  async function onAnular(e: React.FormEvent) {
    e.preventDefault();
    if (!anulando) return;
    if (!motivoAnulacion.trim()) return void avisar.error("Escribe el motivo de la anulación.", { enfocar: "anulacion-motivo" });
    setEnviandoAnulacion(true);
    try {
      const respuesta = await fetch("/api/lucode/anular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comprobante_id: anulando.id, motivo: motivoAnulacion }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        avisar.error("No se pudo anular el comprobante", { detalle: datos.error ?? undefined });
        return;
      }
      avisar.exito("Anulación enviada a SUNAT", { detalle: "Queda «en trámite» hasta que SUNAT confirme; consúltala desde la fila." });
      setModal(null);
      setAnulando(null);
      setMotivoAnulacion("");
      router.refresh();
    } catch {
      avisar.error("No se pudo anular el comprobante", { detalle: "No se pudo conectar con el servidor." });
    } finally {
      setEnviandoAnulacion(false);
    }
  }

  // Consultar una baja en trámite. Va por fila, igual que transmitir.
  const [consultandoId, setConsultandoId] = useState<string | null>(null);

  async function onConsultarAnulacion(comprobanteId: string) {
    setConsultandoId(comprobanteId);
    const cerrarProceso = avisar.proceso("Consultando a SUNAT…");
    try {
      const respuesta = await fetch("/api/lucode/consultar-anulacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comprobante_id: comprobanteId }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        avisar.error("No se pudo consultar la anulación", { detalle: datos.error ?? undefined });
        return;
      }
      if (datos.anulacion === "confirmada") {
        avisar.exito("SUNAT confirmó la anulación", { detalle: "El comprobante ya figura como anulado." });
        router.refresh();
        return;
      }
      avisar.aviso(
        datos.anulacion === "en_tramite" ? "SUNAT todavía la está procesando" : "SUNAT no la reporta como anulada",
        { detalle: datos.anulacion === "en_tramite" ? "Vuelve a consultar en unos minutos." : `Dice "${datos.estadoCrudo}". Revisa el panel de Lucode.` },
      );
    } catch {
      avisar.error("No se pudo consultar la anulación", { detalle: "No se pudo conectar con el servidor." });
    } finally {
      cerrarProceso();
      setConsultandoId(null);
    }
  }

  // Formulario de emisión
  const [ubicacionId, setUbicacionId] = useState(ubicacionActualId);
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");
  const [total, setTotal] = useState(0);
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  // Estado imposible eliminado por diseño: el tipo de documento NO es un estado
  // aparte que pueda contradecir al tipo de comprobante — se deriva de él. Antes,
  // tipear un DNI y luego cambiar a Factura dejaba "factura + dni", y la venta se
  // caía recién al apretar Emitir, con la clienta esperando en el mostrador.
  const clienteTipoDoc = tipoDocumentoDeCliente(tipo, clienteNumDoc);

  // Formulario de serie
  const [serieUbicacionId, setSerieUbicacionId] = useState(ubicacionActualId);
  const [serieTipo, setSerieTipo] = useState<TipoComprobante>("boleta");
  const [serieTexto, setSerieTexto] = useState("");
  // Vacío = el sistema sigue llevando el correlativo solo. Se llena únicamente
  // para continuar una serie que ya venía emitiéndose fuera de este sistema.
  const [serieNumero, setSerieNumero] = useState("");

  const totalMes = comprobantes.reduce((acc, c) => acc + Number(c.total), 0);
  const pendientes = comprobantes.filter((c) => c.estado === "pendiente" || c.estado === "enviado").length;
  const rechazados = comprobantes.filter((c) => c.estado === "rechazado").length;
  const pruebas = comprobantes.filter(esPrueba).length;

  // Serie que le toca a la combinación elegida en el modal de emisión. Es
  // derivado puro de props + estado que ya existían: no consulta nada nuevo.
  const serieDelComprobante = series.find((s) => s.ubicacion_id === ubicacionId && s.tipo === tipo);

  function cerrarModal() {
    setModal(null);
    setTotal(0);
    setClienteNumDoc("");
    setClienteNombre("");
    setSerieTexto("");
    setSerieNumero("");
  }

  async function onEmitir(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    // IGV incluido en el total (19.83% del total = IGV, práctica estándar
    // cuando el precio ya lo incluye) — la desagregación exacta por línea
    // queda para cuando esto se conecte a `ventas` (ver nota al pie).
    const igv = Math.round((total - total / 1.18) * 100) / 100;
    const subtotal = Math.round((total - igv) * 100) / 100;
    const { error } = await supabase.rpc("emitir_comprobante", {
      p_ubicacion_id: ubicacionId,
      p_tipo: tipo,
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: clienteNombre || undefined,
    });
    if (error) {
      avisar.error(traducirError(error, "emitir el comprobante"));
      setLoading(false);
      return;
    }
    setLoading(false);
    avisar.exito(`${ETIQUETA_TIPO[tipo]} emitida`, { detalle: "Aparece en la lista; transmítela a SUNAT desde la fila." });
    cerrarModal();
    router.refresh();
  }

  async function onRegistrarSerie(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_serie_comprobante", {
      p_ubicacion_id: serieUbicacionId,
      p_tipo: serieTipo,
      p_serie: serieTexto,
      // undefined se cae del JSON: sin número, la RPC no toca el correlativo.
      p_siguiente_numero: serieNumero ? Number(serieNumero) : undefined,
    });
    if (error) {
      avisar.error(traducirError(error, "registrar la serie"));
      setLoading(false);
      return;
    }
    setLoading(false);
    avisar.exito(`Serie ${serieTexto} registrada`);
    cerrarModal();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Resumen del mes */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12 sm:grid-cols-3">
        <div className="bg-crema p-4">
          <p className="label-cayla text-[11px] text-tinta/65">Emitidos este mes</p>
          <p className="font-display mt-1 text-2xl text-tinta">{comprobantes.length}</p>
        </div>
        <div className="bg-crema p-4">
          <p className="label-cayla text-[11px] text-tinta/65">Monto facturado</p>
          <p className="font-display mt-1 text-2xl text-tinta">{money(totalMes)}</p>
        </div>
        <div className="bg-crema p-4">
          <p className="label-cayla text-[11px] text-tinta/65">
            Pendientes de enviar
            <Ayuda titulo="Pendiente de enviar">
              El comprobante ya tiene su número oficial reservado (nadie más puede usarlo), pero
              todavía no se transmitió a SUNAT. Si SUNAT está caída, el número no se pierde: se
              reintenta después.
            </Ayuda>
          </p>
          <p className={`font-display mt-1 text-2xl ${pendientes > 0 ? "text-ambar" : "text-tinta"}`}>{pendientes}</p>
          {rechazados > 0 && <p className="mt-0.5 text-xs text-rojo">{rechazados} rechazado{rechazados > 1 ? "s" : ""}</p>}
          {pruebas > 0 && (
            <p className="mt-0.5 text-xs text-tinta/75">
              {pruebas} de prueba
              <Ayuda titulo="Comprobante de prueba">
                Se transmitió a la plataforma de pruebas de Lucode, no a SUNAT. Tiene número y PDF,
                pero no vale como comprobante de pago: no sustenta la venta ni el crédito fiscal de
                la clienta. Sale de ahí cuando el sistema apunta al ambiente de producción.
              </Ayuda>
            </p>
          )}
        </div>
      </div>

      {/* Series registradas */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label-cayla text-[11px] text-tinta/65">
            Series por ubicación
            <Ayuda titulo="Series de comprobantes">
              La serie identifica desde qué tienda salió el comprobante: una letra según el tipo
              (B para boleta, F para factura) más tres dígitos. En facturación electrónica las
              defines tú, no SUNAT — no hay que pedir autorización. Lo normal es una serie por
              tienda (B004 Trujillo, B005 Arequipa, B006 Lima) para saber de dónde vino cada venta.
              Regístrala una sola vez por ubicación y tipo; el correlativo lo lleva el sistema.
            </Ayuda>
          </h2>
          <Boton peso="discreto" onClick={() => setModal("serie")}>
            Registrar serie
          </Boton>
        </div>
        {series.length === 0 ? (
          <p className="font-display card-cayla py-6 text-center text-base italic text-tinta/65">
            Ninguna ubicación tiene serie registrada todavía. Sin esto, no se puede emitir nada.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12 sm:grid-cols-3">
            {series.map((s) => {
              const ubicacion = ubicaciones.find((u) => u.id === s.ubicacion_id);
              return (
                <div key={s.id} className="bg-crema p-3">
                  <p className="text-xs text-tinta/70">{ubicacion?.nombre ?? "—"} · {ETIQUETA_TIPO[s.tipo]}</p>
                  <p className="font-display mt-0.5 text-lg text-tinta">
                    {s.serie}-{String(s.siguiente_numero).padStart(6, "0")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-tinta/65">próximo número</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Comprobantes del mes */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label-cayla text-[11px] text-tinta/65">Comprobantes</h2>
          <Boton peso="primario" onClick={() => setModal("emitir")}>
            Emitir comprobante
          </Boton>
        </div>
        {comprobantes.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
            Sin comprobantes emitidos este mes.
          </p>
        ) : (
          <div className="scroll-cayla card-cayla overflow-hidden">
            <div className="scroll-cayla overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/65">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[11px]">Fecha</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Comprobante</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Cliente</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Total</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Estado</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">SUNAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {comprobantes.map((c) => {
                  const puedeTransmitir = c.estado === "pendiente" || c.estado === "rechazado";
                  const puedeAnular = c.estado === "aceptado" && !anulacionEnTramite(c);
                  return (
                    <tr key={c.id} className="transition-colors duration-150 hover:bg-tinta/[0.025]">
                      <td className="whitespace-nowrap px-3 py-3 text-tinta/75">{formatearFecha(c.created_at)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium text-tinta">
                        {ETIQUETA_TIPO[c.tipo]} {c.serie}-{String(c.numero).padStart(6, "0")}
                      </td>
                      <td className="px-3 py-3 text-tinta/75">{c.cliente_nombre ?? "Cliente varios"}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums text-tinta">{money(Number(c.total))}</td>
                      <td className="px-3 py-3">
                        <span className={`label-cayla inline-block whitespace-nowrap rounded-full border px-3 py-1 text-[11px] ${estiloEstado(c)}`}>
                          {etiquetaEstado(c)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {puedeTransmitir ? (
                          <Boton
                            type="button"
                            peso="discreto"
                            onClick={() => onTransmitir(c.id)}
                            cargando={transmitiendoId === c.id}
                            className="border-rojo/30 px-2.5 py-1.5 text-[11px] text-rojo hover:bg-rojo/8"
                          >
                            {transmitiendoId === c.id ? "Transmitiendo…" : "Transmitir"}
                          </Boton>
                        ) : puedeAnular ? (
                          <Boton
                            type="button"
                            peso="discreto"
                            onClick={() => {
                              setAnulando(c);
                              setMotivoAnulacion("");
                              setModal("anular");
                            }}
                            className="px-2.5 py-1.5 text-[11px]"
                          >
                            Anular
                          </Boton>
                        ) : anulacionEnTramite(c) ? (
                          <Boton
                            type="button"
                            peso="discreto"
                            onClick={() => onConsultarAnulacion(c.id)}
                            cargando={consultandoId === c.id}
                            className="px-2.5 py-1.5 text-[11px]"
                          >
                            {consultandoId === c.id ? "Consultando…" : "Consultar"}
                          </Boton>
                        ) : (
                          <span className="text-tinta/65">—</span>
                        )}
                        {c.motivo_anulacion && (
                          <p className="mt-1 max-w-[14rem] whitespace-normal text-[11px] leading-snug text-tinta/65">
                            {c.motivo_anulacion}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* ==================== Modal: emitir comprobante ==================== */}
      {modal === "emitir" && (
        <Modal titulo="Emitir comprobante" ancho="max-w-md" onClose={cerrarModal}>
          {(cerrar) => (
          <form onSubmit={onEmitir} className="mt-5 space-y-2">
            {/* Ubicación y tipo son las dos decisiones que determinan el correlativo,
                así que van juntas y arriba de él: se leen como los dos diales
                que mueven la cifra de abajo. */}
            <div className="grid gap-x-5 sm:grid-cols-2">
            <CampoSelect
              etiqueta="Ubicación"
              valor={ubicacionId}
              onValor={setUbicacionId}
              opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
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
                cuando cambia la ubicación o el tipo — así el ojo nota que cambió. */}
            <div className="rounded-xl border border-sand bg-papel px-5 py-4">
              <p className="label-cayla text-[11px] text-tinta/65">Se va a reservar el número</p>
              {serieDelComprobante ? (
                <p
                  key={`${serieDelComprobante.serie}-${serieDelComprobante.siguiente_numero}`}
                  className="font-display anim-asentar mt-1.5 text-[1.75rem] leading-none tabular-nums text-tinta"
                >
                  {serieDelComprobante.serie}
                  <span className="text-tinta/65">-</span>
                  {String(serieDelComprobante.siguiente_numero).padStart(6, "0")}
                </p>
              ) : (
                <p className="anim-asentar mt-1.5 text-xs leading-relaxed text-ambar">
                  {ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "Esta ubicación"} todavía no tiene serie
                  de {ETIQUETA_TIPO[tipo].toLowerCase()} registrada. Regístrala antes de emitir.
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
            <p className="border-l-2 border-ambar/50 pl-3 text-xs leading-relaxed text-tinta/75">
              Esto reserva el número oficial y guarda el comprobante — todavía no lo manda a
              SUNAT. Queda &ldquo;Pendiente de enviar&rdquo; hasta que aprietes
              &ldquo;Transmitir&rdquo; en la lista de abajo, que es lo que lo envía.
            </p>

            <div className="flex gap-2 pt-3">
              <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
                {loading ? "Emitiendo…" : "Emitir"}
              </Boton>
            </div>
          </form>
          )}
        </Modal>
      )}

      {/* ==================== Modal: registrar serie ==================== */}
      {modal === "serie" && (
        <Modal titulo="Registrar serie" onClose={cerrarModal}>
          {(cerrar) => (
          <form onSubmit={onRegistrarSerie} className="mt-5 space-y-2">
            <CampoSelect
              etiqueta="Ubicación"
              valor={serieUbicacionId}
              onValor={setSerieUbicacionId}
              opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
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
            <div className="flex gap-2 pt-3">
              <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
                {loading ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </form>
          )}
        </Modal>
      )}

      {/* ==================== Modal: anular ==================== */}
      {modal === "anular" && anulando && (
        <Modal titulo="Anular comprobante" onClose={cerrarModal}>
          {(cerrar) => (
          <form onSubmit={onAnular} className="mt-5 space-y-2">
            <div className="border-l-2 border-rojo/50 pl-3">
              <p className="font-display text-base text-tinta">
                {ETIQUETA_TIPO[anulando.tipo]} {anulando.serie}-{String(anulando.numero).padStart(6, "0")}
              </p>
              <p className="text-xs leading-relaxed text-tinta/75">
                {anulando.cliente_nombre ?? "Cliente varios"} · {money(Number(anulando.total))}
              </p>
            </div>

            <p className="border-l-2 border-ambar/50 pl-3 text-xs leading-relaxed text-tinta/75">
              {anulando.tipo === "boleta"
                ? "Las boletas se dan de baja por el resumen diario. SUNAT lo procesa después, así que queda en “Anulación en trámite” hasta que confirme — no es un error."
                : "Se envía la comunicación de baja. SUNAT también la procesa después, así que queda en “Anulación en trámite”. Si ya pasó el plazo la rechaza, y entonces toca una nota de crédito en vez de anular."}
            </p>

            <CampoTexto
              id="anulacion-motivo"
              etiqueta="Motivo"
              ayuda={
                <Ayuda titulo="Por qué se pide el motivo">
                  Queda guardado en el comprobante, con tu nombre y la fecha. Anular es dar de baja
                  un documento legal: dentro de seis meses, “se anuló” sin razón no le sirve a
                  nadie. Sé concreto — “se emitió por error, la venta no se hizo” dice más que
                  “error”.
                </Ayuda>
              }
              required
              minLength={3}
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
              placeholder="Se emitió por error, la venta no se hizo"
            />


            <div className="flex gap-2 pt-3">
              <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" className="flex-1" cargando={enviandoAnulacion}>
                {enviandoAnulacion ? "Anulando…" : "Anular"}
              </Boton>
            </div>
          </form>
          )}
        </Modal>
      )}
    </div>
  );
}
