"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Comprobante, SerieComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";
import { ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import { soles } from "@/lib/compras-reglas";
import { accionDeLaFila, chipDelComprobante } from "@/lib/facturacion-actividad";
import { motivoDelComprobante, nombreCorto, seriesFaltantes, TIPOS_CON_SERIE, textoDeSeriesFaltantes } from "@/lib/facturacion-comprobantes-reglas";
import type { Ubicacion } from "@/lib/ubicaciones";
import { Ayuda } from "@/components/Ayuda";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { useTransmitir } from "@/lib/useTransmitir";
import { avisar } from "@/components/ui/Avisos";

// La baja se pidió pero SUNAT no la confirmó: el resumen diario de boletas se
// procesa diferido. Decir "Anulado" acá sería adelantarse a SUNAT.
function anulacionEnTramite(c: Comprobante) {
  return c.estado === "aceptado" && c.anulacion_solicitada_at !== null;
}

// Los botones de la fila y el motivo que va bajo su estado — extraído porque la fila los pinta
// con la misma decisión en todos los anchos y no pueden desincronizarse. Los handlers vienen por
// parámetro porque esta función vive fuera del componente: no tiene closure sobre `onTransmitir`
// ni sobre los `useState`. El chip sale de `chipDelComprobante` (el mismo del Resumen).
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
  const transmitir = accionDeLaFila(c);
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
  if (transmitir?.tipo === "transmitir") {
    const enVuelo = handlers.transmitiendoId === c.id;
    botones.push(
      <BotonCompacto key="transmitir" variante={transmitir.alerta ? "fila-alerta" : "fila"} cargando={enVuelo} onClick={() => handlers.onTransmitir(c.id)}>
        {enVuelo ? "Transmitiendo…" : transmitir.etiqueta}
      </BotonCompacto>
    );
  }
  if (puedeLiberar) {
    botones.push(
      <BotonCompacto key="liberar" variante="fila" onClick={() => handlers.onLiberarClick(c)}>
        Liberar sin espera
      </BotonCompacto>
    );
  }
  if (puedeAnular) {
    botones.push(
      <BotonCompacto key="anular" variante="fila" onClick={() => handlers.onAnularClick(c)}>
        Anular
      </BotonCompacto>
    );
  }
  if (anulacionEnTramite(c)) {
    const enVuelo = handlers.consultandoId === c.id;
    botones.push(
      <BotonCompacto key="consultar" variante="fila" cargando={enVuelo} onClick={() => handlers.onConsultarAnulacion(c.id)}>
        {enVuelo ? "Consultando…" : "Consultar"}
      </BotonCompacto>
    );
  }
  return { botones: botones.length > 0 ? <div className="flex flex-wrap items-center gap-1.5">{botones}</div> : null, ...motivoDelComprobante(c) };
}

// PDF/XML/CDR (2026-09-18): Lucode los devuelve al transmitir y hasta hoy
// nadie los mostraba — SUNAT ya tenía el documento pero la clienta nunca
// podía verlo ni descargarlo. `pdfUrl` es el que de verdad importa (se le
// manda a la clienta); XML/CDR quedan como enlaces chicos al lado para
// cuando hace falta el respaldo técnico (una reclamación, una auditoría).
function DocumentosSunat({ c }: { c: Comprobante }) {
  if (!c.pdfUrl && !c.xmlUrl && !c.cdrUrl) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px]">
      {c.pdfUrl && (
        <a href={c.pdfUrl} target="_blank" rel="noreferrer" className="font-medium text-rojo-profundo hover:underline">
          Ver PDF
        </a>
      )}
      {c.xmlUrl && (
        <a href={c.xmlUrl} target="_blank" rel="noreferrer" className="text-tinta/55 hover:text-rojo-profundo hover:underline">
          XML
        </a>
      )}
      {c.cdrUrl && (
        <a href={c.cdrUrl} target="_blank" rel="noreferrer" className="text-tinta/55 hover:text-rojo-profundo hover:underline">
          CDR
        </a>
      )}
    </div>
  );
}

// Fecha y hora por separado (la fila las pone una sobre otra), siempre en hora de Lima.
const PARTES_DIA_LIMA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" });
/** «19/09»: `es-PE` no rellena el mes con cero, y una columna de fechas se lee mejor alineada. */
function diaLima(iso: string) {
  const partes = Object.fromEntries(PARTES_DIA_LIMA.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${partes.day.padStart(2, "0")}/${partes.month.padStart(2, "0")}`;
}
const HORA_LIMA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

// Las columnas de la lista, en las dos versiones (con y sin «Cliente»), como `ActividadDeHoy` y por
// el mismo motivo: según el ancho DE LA TARJETA (container queries) y no el de la ventana, porque con
// el menú lateral desplegado una ventana de 768 px deja ~480 px de contenido. Desde 900 px de tarjeta
// el cliente tiene su columna; entre 640 y 899 px pasa a la línea de abajo del número; por debajo
// de 640 px cada fila se apila.
const COLUMNAS = "@min-[640px]:grid @min-[640px]:grid-cols-[72px_minmax(0,1.1fr)_92px_minmax(0,1.4fr)] @min-[900px]:grid-cols-[72px_minmax(0,1.15fr)_minmax(0,1fr)_100px_minmax(0,1.7fr)]";

const ORDEN_TIPO: TipoComprobante[] = ["boleta", "factura", "nota_credito", "nota_debito"];

// Panel de Facturación electrónica: reserva el comprobante con su correlativo
// oficial ya mismo (RPC en Postgres puro) y lo transmite a SUNAT por Lucode en
// un paso aparte — el botón "Transmitir" de cada fila (ADR-0005, ADR-0009).
// Reservar y transmitir siguen separados a propósito: emitir no puede depender
// de que un proveedor externo esté arriba (principio 9).
// Un componente: la franja de series, la lista del mes y los tres modales de esta vista (registrar
// serie, anular y liberar). Las tarjetas de arriba las dibuja `ComprobantesTarjetas`; «Emitir
// comprobante» vive en la cabecera de Facturación (`FacturacionCabecera`).
export function ComprobantesPanel({
  comprobantes,
  series,
  ubicaciones,
  ubicacionActualId,
  periodo,
}: {
  comprobantes: Comprobante[];
  series: SerieComprobante[];
  /** Las tiendas operativas (solo ellas emiten, así que solo a ellas les pueden faltar series). */
  ubicaciones: Pick<Ubicacion, "id" | "nombre" | "tipo">[];
  ubicacionActualId: string;
  /** «este mes» o «en agosto»: cómo se dice el mes que se mira (`periodoDelMes`). */
  periodo: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"serie" | "anular" | "liberar" | null>(null);
  const [loading, setLoading] = useState(false);

  // Transmisión a Lucode (Fase 1, ADR-0009), por fila: la misma implementación que usa la
  // fila de «Actividad de hoy» del Resumen (`lib/useTransmitir.ts`).
  const { transmitiendoId, transmitir: onTransmitir } = useTransmitir();

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

  // Qué series le faltan a cada tienda (boleta, factura y nota de crédito). Sin la de nota de crédito
  // una devolución de un comprobante aceptado no se puede aprobar (ADR-0100).
  const faltantes = seriesFaltantes(series, ubicaciones);
  const nombreDe = (id: string) => ubicaciones.find((u) => u.id === id)?.nombre ?? "—";
  const seriesOrdenadas = [...series].sort(
    (a, b) => nombreDe(a.ubicacion_id).localeCompare(nombreDe(b.ubicacion_id), "es") || ORDEN_TIPO.indexOf(a.tipo) - ORDEN_TIPO.indexOf(b.tipo)
  );

  // «Registrar serie» abre el formulario ya puesto en la primera que falta: lo normal es venir a
  // completar exactamente eso.
  function abrirSerie() {
    const primera = faltantes[0];
    if (primera) {
      setSerieTipo(primera.tipo);
      setSerieUbicacionId(primera.tiendas[0].id);
    }
    setModal("serie");
  }

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

  const acciones = { transmitiendoId, consultandoId, onTransmitir, onAnularClick, onConsultarAnulacion, onLiberarClick };

  return (
    <div className="space-y-6">
      {/* Series registradas: una franja que dice si falta alguna y, aparte, el detalle. */}
      <section className="card-cayla anim-sube px-5 py-4" style={{ "--i": 4 } as CSSProperties} aria-labelledby="series-titulo">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h2 id="series-titulo" className="label-cayla text-[11px] text-tinta/65">
              Series de comprobantes
              <Ayuda titulo="Series de comprobantes">
                La serie identifica desde qué tienda salió el comprobante: una letra según el tipo (B para boleta, F para factura) más tres
                caracteres. En facturación electrónica las defines tú, no SUNAT — no hay que pedir autorización. Lo normal es una serie por
                tienda (B004 Trujillo, B005 Arequipa, B006 Lima) para saber de dónde vino cada venta. Regístrala una sola vez por ubicación y
                tipo; el correlativo lo lleva el sistema. La de nota de crédito hace falta para aprobar devoluciones de ventas ya aceptadas por
                SUNAT.
              </Ayuda>
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-snug text-tinta">
              {series.length === 0 ? (
                <>
                  <Chip tono="rojo">Sin series</Chip>
                  Ninguna tienda tiene serie registrada todavía. Sin esto, no se puede emitir nada.
                </>
              ) : faltantes.length > 0 ? (
                <>
                  <Chip tono="ambar">Incompleto</Chip>
                  {textoDeSeriesFaltantes(faltantes)}
                </>
              ) : (
                <>
                  <Chip tono="verde">Al día</Chip>
                  Cada tienda tiene su serie de boleta, factura y nota de crédito.
                </>
              )}
            </p>
          </div>
          <BotonCompacto variante="fila" onClick={abrirSerie}>
            Registrar serie
          </BotonCompacto>
        </div>

        {series.length > 0 && (
          <details className="group mt-3 border-t border-tinta/10 pt-3">
            <summary className="label-cayla inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-[11px] text-tinta/60 outline-none transition-colors duration-200 hover:text-tinta focus-visible:outline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60 [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden size={13} strokeWidth={1.75} className="transition-transform duration-200 group-open:rotate-90" />
              Ver {series.length === 1 ? "la serie registrada" : `las ${series.length} series registradas`}
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {seriesOrdenadas.map((s) => (
                <div key={s.id} className="rounded-[10px] border border-tinta/10 bg-tinta/[0.025] p-3">
                  <p className="text-xs text-tinta/70">
                    {nombreCorto(nombreDe(s.ubicacion_id))} · {ETIQUETA_TIPO[s.tipo]}
                  </p>
                  <p className="font-display mt-0.5 text-lg tabular-nums text-tinta">
                    {s.serie}-{String(s.siguiente_numero).padStart(6, "0")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-tinta/65">próximo número</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Comprobantes del mes: una sola fila para todos los anchos (ver `COLUMNAS`). */}
      <div className="card-cayla anim-sube @container overflow-hidden" style={{ "--i": 5 } as CSSProperties}>
        <div className="px-5 pt-[18px] pb-3.5">
          <p className="label-cayla text-[11px] text-tinta/65">Comprobantes</p>
          <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">Emitidos {periodo}</h2>
          <p className="mt-0.5 text-xs text-tinta/65">Con su estado ante SUNAT y lo que se puede hacer con cada uno</p>
        </div>

        {comprobantes.length === 0 ? (
          <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Sin comprobantes emitidos {periodo}.</p>
        ) : (
          <>
            <div className={`label-cayla hidden gap-x-4 border-t border-tinta/10 px-5 py-2 text-[11px] text-tinta/55 ${COLUMNAS}`}>
              <span>Fecha</span>
              <span>Comprobante</span>
              <span className="hidden @min-[900px]:inline">Cliente</span>
              <span className="text-right">Total</span>
              <span>Estado</span>
            </div>

            {comprobantes.map((c) => {
              const { botones, motivo, esRechazo } = accionComprobante(c, acciones);
              const chip = chipDelComprobante(c);
              const cliente = c.cliente_nombre ?? "Cliente varios";
              return (
                <div
                  key={c.id}
                  className={`flex flex-col gap-2 border-t border-tinta/10 px-5 py-3 transition-colors duration-150 hover:bg-tinta/[0.025] @min-[640px]:items-center @min-[640px]:gap-x-4 @min-[640px]:gap-y-0 ${COLUMNAS}`}
                >
                  <div className="flex items-baseline gap-2 @min-[640px]:block">
                    <p className="font-display text-lg leading-tight tabular-nums text-tinta">{diaLima(c.created_at)}</p>
                    <p className="label-cayla text-[10px] text-tinta/55 @min-[640px]:mt-0.5">{HORA_LIMA.format(new Date(c.created_at))}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[15px] leading-normal text-tinta">
                      <span className="text-tinta/65">{ETIQUETA_TIPO[c.tipo]}</span>{" "}
                      <b className="font-semibold">
                        {c.serie}-{String(c.numero).padStart(6, "0")}
                      </b>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-tinta/65 @min-[900px]:hidden">{cliente}</p>
                    <DocumentosSunat c={c} />
                  </div>

                  <p className="hidden min-w-0 truncate text-[13px] text-tinta/75 @min-[900px]:block">{cliente}</p>

                  <p className="font-display text-lg leading-tight tabular-nums text-tinta @min-[640px]:text-right">{soles(Number(c.total))}</p>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <Chip tono={chip.tono} className={chip.punteado ? "border-dashed border-tinta/30" : ""}>
                        {chip.texto}
                      </Chip>
                      {motivo && <p className={`mt-1.5 text-[13px] leading-snug ${esRechazo ? "text-rojo-profundo" : "text-tinta/65"}`}>{motivo}</p>}
                    </div>
                    {botones}
                  </div>
                </div>
              );
            })}
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
              opciones={TIPOS_CON_SERIE.map((t) => ({ valor: t, texto: ETIQUETA_TIPO[t] }))}
            />
            <CampoTexto
              etiqueta="Serie"
              pie={
                serieTipo === "nota_credito"
                  ? "Cuatro caracteres. Empieza con B si corrige boletas o con F si corrige facturas (por ejemplo BC01)."
                  : "Una letra según el tipo más tres dígitos."
              }
              mono
              required
              value={serieTexto}
              onChange={(e) => setSerieTexto(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder={serieTipo === "factura" ? "F001" : serieTipo === "nota_credito" ? "BC01" : "B001"}
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
                {anulando.cliente_nombre ?? "Cliente varios"} · {soles(Number(anulando.total))}
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
                {liberando.cliente_nombre ?? "Cliente varios"} · {soles(Number(liberando.total))}
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
