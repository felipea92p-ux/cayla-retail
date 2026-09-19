"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Comprobante, SerieComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";
import { ESTADO_ESTILO, ESTADO_ETIQUETA, ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import { Ayuda } from "@/components/Ayuda";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { useFacturacionAcciones } from "@/lib/useFacturacionAcciones";
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

// Botón(es) de la columna "SUNAT" + su motivo, si hay uno — extraído porque
// tabla (escritorio) y tarjeta (celular, ADR pendiente de numerar) pintan la
// misma decisión en dos layouts distintos y no pueden desincronizarse. Los
// handlers vienen por parámetro porque esta función vive fuera del
// componente: no tiene closure sobre `onTransmitir` ni sobre los `useState`.
function accionComprobante(
  c: Comprobante,
  handlers: {
    transmitiendoId: string | null;
    consultandoId: string | null;
    onTransmitir: (id: string) => void;
    onAnularClick: (c: Comprobante) => void;
    onConsultarAnulacion: (id: string) => void;
    onLiberarClick: (c: Comprobante) => void;
  }
) {
  const puedeTransmitir = c.estado === "pendiente" || c.estado === "rechazado";
  const puedeAnular = c.estado === "aceptado" && !anulacionEnTramite(c);
  // ADR-0093: solo "pendiente" — nunca se transmitió a SUNAT, así que liberar el
  // correlativo no le avisa nada a nadie. Un "rechazado" SÍ llegó a SUNAT y tiene
  // una respuesta real: su único camino sigue siendo reintentar "Transmitir" con
  // el mismo número, no una segunda salida acá.
  const puedeLiberar = c.estado === "pendiente";

  // Un "pendiente" puede Transmitir O Liberar — las dos conviven en la misma fila
  // (decisión de Felipe: "Liberar sin espera" se agrega JUNTO A Transmitir, no en
  // su lugar), así que esto arma una lista en vez de elegir un solo botón.
  const botones: React.ReactNode[] = [];
  if (puedeTransmitir) {
    botones.push(
      <Boton
        key="transmitir"
        type="button"
        peso="discreto"
        onClick={() => handlers.onTransmitir(c.id)}
        cargando={handlers.transmitiendoId === c.id}
        className="border-rojo/30 px-2.5 py-1.5 text-[11px] text-rojo hover:bg-rojo/8"
      >
        {handlers.transmitiendoId === c.id ? "Transmitiendo…" : "Transmitir"}
      </Boton>
    );
  }
  if (puedeLiberar) {
    botones.push(
      <Boton key="liberar" type="button" peso="discreto" onClick={() => handlers.onLiberarClick(c)} className="px-2.5 py-1.5 text-[11px]">
        Liberar sin espera
      </Boton>
    );
  }
  if (puedeAnular) {
    botones.push(
      <Boton key="anular" type="button" peso="discreto" onClick={() => handlers.onAnularClick(c)} className="px-2.5 py-1.5 text-[11px]">
        Anular
      </Boton>
    );
  }
  if (anulacionEnTramite(c)) {
    botones.push(
      <Boton
        key="consultar"
        type="button"
        peso="discreto"
        onClick={() => handlers.onConsultarAnulacion(c.id)}
        cargando={handlers.consultandoId === c.id}
        className="px-2.5 py-1.5 text-[11px]"
      >
        {handlers.consultandoId === c.id ? "Consultando…" : "Consultar"}
      </Boton>
    );
  }
  const boton = botones.length > 0 ? <div className="flex flex-wrap gap-1.5">{botones}</div> : <span className="text-tinta/65">—</span>;

  const motivo =
    c.estado === "rechazado" && c.motivo_rechazo
      ? c.motivo_rechazo
      : c.estado === "no_emitido"
        ? c.motivo_no_emitido
        : c.motivo_anulacion;
  const motivoEsRechazo = c.estado === "rechazado" && !!c.motivo_rechazo;

  return { boton, motivo, motivoEsRechazo };
}

// PDF/XML/CDR (2026-09-18): Lucode los devuelve al transmitir y hasta hoy
// nadie los mostraba — SUNAT ya tenía el documento pero la clienta nunca
// podía verlo ni descargarlo. `pdfUrl` es el que de verdad importa (se le
// manda a la clienta); XML/CDR quedan como enlaces chicos al lado para
// cuando hace falta el respaldo técnico (una reclamación, una auditoría).
function DocumentosSunat({ c }: { c: Comprobante }) {
  if (!c.pdfUrl && !c.xmlUrl && !c.cdrUrl) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] font-normal normal-case">
      {c.pdfUrl && (
        <a href={c.pdfUrl} target="_blank" rel="noreferrer" className="text-rojo hover:underline">
          Ver PDF
        </a>
      )}
      {c.xmlUrl && (
        <a href={c.xmlUrl} target="_blank" rel="noreferrer" className="text-tinta/50 hover:text-rojo hover:underline">
          XML
        </a>
      )}
      {c.cdrUrl && (
        <a href={c.cdrUrl} target="_blank" rel="noreferrer" className="text-tinta/50 hover:text-rojo hover:underline">
          CDR
        </a>
      )}
    </div>
  );
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
  const { abrirEmitir } = useFacturacionAcciones();
  const [modal, setModal] = useState<"serie" | "anular" | "liberar" | null>(null);
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

  function onAnularClick(c: Comprobante) {
    setAnulando(c);
    setMotivoAnulacion("");
    setModal("anular");
  }

  // Liberar un "pendiente" que nunca se transmitió (ADR-0093). A diferencia de
  // anular, esto NUNCA habla con Lucode/SUNAT — el número no se reutiliza, solo
  // deja de contar como pendiente — así que es una RPC directa desde el cliente
  // (mismo patrón que `onRegistrarSerie` en este mismo componente, no
  // el de `onAnular`, que sí necesita el servidor para orquestar la baja real).
  const [liberando, setLiberando] = useState<Comprobante | null>(null);
  const [motivoLiberacion, setMotivoLiberacion] = useState("");
  const [enviandoLiberacion, setEnviandoLiberacion] = useState(false);

  async function onLiberar(e: React.FormEvent) {
    e.preventDefault();
    if (!liberando) return;
    if (!motivoLiberacion.trim()) return void avisar.error("Escribe el motivo para liberar el comprobante.", { enfocar: "liberacion-motivo" });
    setEnviandoLiberacion(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("marcar_comprobante_no_emitido", {
      p_comprobante_id: liberando.id,
      p_motivo: motivoLiberacion,
    });
    if (error) {
      avisar.error(traducirError(error, "liberar el comprobante"));
      setEnviandoLiberacion(false);
      return;
    }
    avisar.exito("Comprobante liberado", {
      detalle: "Nunca se transmitió a SUNAT, así que no hacía falta avisarle nada. Su número queda sin usar.",
    });
    setModal(null);
    setLiberando(null);
    setMotivoLiberacion("");
    setEnviandoLiberacion(false);
    router.refresh();
  }

  function onLiberarClick(c: Comprobante) {
    setLiberando(c);
    setMotivoLiberacion("");
    setModal("liberar");
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

  function cerrarModal() {
    setModal(null);
    setSerieTexto("");
    setSerieNumero("");
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
      {/* Resumen del mes. Cuatro tiles, no tres: "Rechazados" tenía su propio
          número escondido como sub-línea roja dentro de "Pendientes de enviar"
          — dos urgencias distintas (una normal, una que exige acción) peleando
          por el mismo espacio de una oración. Ahora cada una tiene su lugar. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12 sm:grid-cols-4">
        <div className="bg-crema p-4">
          <p className="label-cayla text-[11px] text-tinta/65">Emitidos este mes</p>
          <p className="font-display mt-1 text-2xl text-tinta">{comprobantes.length}</p>
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
        </div>
        <div className="bg-crema p-4">
          <p className="label-cayla text-[11px] text-tinta/65">Rechazados</p>
          <p className={`font-display mt-1 text-2xl ${rechazados > 0 ? "text-rojo" : "text-tinta"}`}>{rechazados}</p>
          {rechazados > 0 && (
            <p className="mt-0.5 text-xs text-rojo">SUNAT no los aceptó — el motivo está en la fila.</p>
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
          <Boton peso="primario" onClick={abrirEmitir}>
            Emitir comprobante
          </Boton>
        </div>
        {comprobantes.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
            Sin comprobantes emitidos este mes.
          </p>
        ) : (
          <>
            {/* Tabla — 640px (`sm`) y más ancho. Por debajo, una tabla de 6
                columnas no cabe sin scroll horizontal ni encogiendo el texto
                hasta ilegible, así que esa franja usa las tarjetas de abajo
                en su lugar (mismo dato, layout vertical). */}
            <div className="scroll-cayla card-cayla hidden overflow-hidden sm:block">
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
                    const { boton, motivo, motivoEsRechazo } = accionComprobante(c, {
                      transmitiendoId,
                      consultandoId,
                      onTransmitir,
                      onAnularClick,
                      onConsultarAnulacion,
                      onLiberarClick,
                    });
                    return (
                      <tr key={c.id} className="transition-colors duration-150 hover:bg-tinta/[0.025]">
                        <td className="whitespace-nowrap px-3 py-3 text-tinta/75">{formatearFecha(c.created_at)}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-tinta">
                          {ETIQUETA_TIPO[c.tipo]} {c.serie}-{String(c.numero).padStart(6, "0")}
                          <DocumentosSunat c={c} />
                        </td>
                        <td className="px-3 py-3 text-tinta/75">{c.cliente_nombre ?? "Cliente varios"}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums text-tinta">{money(Number(c.total))}</td>
                        <td className="px-3 py-3">
                          <span className={`label-cayla inline-block whitespace-nowrap rounded-full border px-3 py-1 text-[11px] ${estiloEstado(c)}`}>
                            {etiquetaEstado(c)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {boton}
                          {motivo && (
                            <p
                              className={`mt-1 max-w-[14rem] whitespace-normal text-[11px] leading-snug ${
                                motivoEsRechazo ? "text-rojo-profundo" : "text-tinta/65"
                              }`}
                            >
                              {motivo}
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

            {/* Tarjetas — por debajo de `sm`. Mismos datos que la tabla, sin
                columnas: nada obliga a desplazar la pantalla hacia el costado
                para leer el estado de un comprobante desde el teléfono. */}
            <div className="space-y-2 sm:hidden">
              {comprobantes.map((c) => {
                const { boton, motivo, motivoEsRechazo } = accionComprobante(c, {
                  transmitiendoId,
                  consultandoId,
                  onTransmitir,
                  onAnularClick,
                  onConsultarAnulacion,
                  onLiberarClick,
                });
                return (
                  <div key={c.id} className="card-cayla p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-base text-tinta">
                          {ETIQUETA_TIPO[c.tipo]} {c.serie}-{String(c.numero).padStart(6, "0")}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-tinta/65">{c.cliente_nombre ?? "Cliente varios"}</p>
                        <DocumentosSunat c={c} />
                      </div>
                      <p className="font-display shrink-0 text-base tabular-nums text-tinta">{money(Number(c.total))}</p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <span className={`label-cayla inline-block whitespace-nowrap rounded-full border px-3 py-1 text-[11px] ${estiloEstado(c)}`}>
                        {etiquetaEstado(c)}
                      </span>
                      <span className="text-[11px] text-tinta/55">{formatearFecha(c.created_at)}</span>
                    </div>
                    <div className="mt-2.5">
                      {boton}
                      {motivo && (
                        <p className={`mt-1 whitespace-normal text-[11px] leading-snug ${motivoEsRechazo ? "text-rojo-profundo" : "text-tinta/65"}`}>
                          {motivo}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

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

      {/* ==================== Modal: liberar (ADR-0093) ==================== */}
      {modal === "liberar" && liberando && (
        <Modal titulo="Liberar comprobante" onClose={cerrarModal}>
          {(cerrar) => (
          <form onSubmit={onLiberar} className="mt-5 space-y-2">
            <div className="border-l-2 border-tinta/30 pl-3">
              <p className="font-display text-base text-tinta">
                {ETIQUETA_TIPO[liberando.tipo]} {liberando.serie}-{String(liberando.numero).padStart(6, "0")}
              </p>
              <p className="text-xs leading-relaxed text-tinta/75">
                {liberando.cliente_nombre ?? "Cliente varios"} · {money(Number(liberando.total))}
              </p>
            </div>

            <p className="border-l-2 border-ambar/50 pl-3 text-xs leading-relaxed text-tinta/75">
              Este comprobante reservó su número pero nunca se transmitió a SUNAT — no hay nada
              que avisarle. Su número queda sin usar para siempre (un hueco en la numeración es
              normal y legal); lo único que cambia es que deja de aparecer como pendiente. Esta
              acción no se puede deshacer.
            </p>

            <CampoTexto
              id="liberacion-motivo"
              etiqueta="Motivo"
              ayuda={
                <Ayuda titulo="Por qué se pide el motivo">
                  Queda guardado en el comprobante, con tu nombre y la fecha — igual que al
                  anular. Sé concreto: “la clienta se arrepintió antes de pagar” dice más que “no
                  se usó”.
                </Ayuda>
              }
              required
              minLength={3}
              value={motivoLiberacion}
              onChange={(e) => setMotivoLiberacion(e.target.value)}
              placeholder="La clienta se arrepintió antes de pagar"
            />

            <div className="flex gap-2 pt-3">
              <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" className="flex-1" cargando={enviandoLiberacion}>
                {enviandoLiberacion ? "Liberando…" : "Liberar sin espera"}
              </Boton>
            </div>
          </form>
          )}
        </Modal>
      )}
    </div>
  );
}
