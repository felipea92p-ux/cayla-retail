"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Comprobante } from "@/lib/comprobantes-reglas";
import { ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import { soles } from "@/lib/compras-reglas";
import { chipDelComprobante } from "@/lib/facturacion-actividad";
import { accionesDelComprobante, camposDeBusquedaDelComprobante, enlaceWhatsApp, motivoDelComprobante, totalesPorTipo } from "@/lib/facturacion-comprobantes-reglas";
import { coincide } from "@/lib/facturacion-busqueda";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { Ayuda } from "@/components/Ayuda";
import { SinCoincidencias } from "@/components/SinCoincidencias";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";
import { DesplegablePildora, ItemDesplegable, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { CircleCheck, FileText, Store } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { useTransmitir } from "@/lib/useTransmitir";
import { avisar } from "@/components/ui/Avisos";

// Los botones de la fila y el motivo que va bajo su estado. Qué botones le tocan a cada estado lo
// decide `accionesDelComprobante` (con su prueba); esto solo los dibuja. Los handlers vienen por
// parámetro porque esta función vive fuera del componente: no tiene closure sobre `onTransmitir` ni
// sobre los `useState`. Cada botón dice sobre cuál comprobante actúa (`aria-label`): en una lista hay
// muchos «Anular» iguales. El chip sale de `chipDelComprobante` (el mismo del Resumen).
function accionComprobante(
  c: Comprobante,
  handlers: {
    transmitiendoId: string | null;
    consultandoId: string | null;
    onTransmitir: (id: string) => void;
    onAnularClick: (c: Comprobante) => void;
    onConsultarAnulacion: (id: string) => void;
    onLiberarClick: (c: Comprobante) => void;
    /** Anular y «liberar sin espera» son solo del líder (`anular_comprobante`, `marcar_comprobante_no_emitido`). */
    esLider: boolean;
  }
) {
  const numero = `${ETIQUETA_TIPO[c.tipo]} ${c.serie}-${String(c.numero).padStart(6, "0")}`;
  const botones = accionesDelComprobante(c)
    .filter((accion) => handlers.esLider || (accion !== "anular" && accion !== "liberar"))
    .map((accion) => {
    switch (accion) {
      case "reintentar": {
        const enVuelo = handlers.transmitiendoId === c.id;
        return (
          <BotonCompacto key={accion} variante="fila-alerta" cargando={enVuelo} aria-label={`Reintentar ${numero}`} onClick={() => handlers.onTransmitir(c.id)}>
            {enVuelo ? "Enviando…" : "Reintentar"}
          </BotonCompacto>
        );
      }
      case "liberar":
        return (
          <BotonCompacto key={accion} variante="fila" aria-label={`Liberar sin espera ${numero}`} onClick={() => handlers.onLiberarClick(c)}>
            Liberar sin espera
          </BotonCompacto>
        );
      case "anular":
        return (
          <BotonCompacto key={accion} variante="fila" aria-label={`Anular ${numero}`} onClick={() => handlers.onAnularClick(c)}>
            Anular
          </BotonCompacto>
        );
      case "consultar": {
        const enVuelo = handlers.consultandoId === c.id;
        return (
          <BotonCompacto key={accion} variante="fila" cargando={enVuelo} aria-label={`Consultar la anulación de ${numero}`} onClick={() => handlers.onConsultarAnulacion(c.id)}>
            {enVuelo ? "Consultando…" : "Consultar"}
          </BotonCompacto>
        );
      }
    }
  });
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
      {c.pdfUrl && (
        <a
          href={enlaceWhatsApp(`Hola${c.cliente_nombre ? ` ${c.cliente_nombre}` : ""}, aquí está tu ${ETIQUETA_TIPO[c.tipo].toLowerCase()} ${c.serie}-${String(c.numero).padStart(6, "0")} de CAYLA: ${c.pdfUrl}`)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Enviar por WhatsApp ${ETIQUETA_TIPO[c.tipo]} ${c.serie}-${c.numero}`}
          className="text-tinta/65 hover:text-rojo-profundo hover:underline"
        >
          WhatsApp
        </a>
      )}
      {c.xmlUrl && (
        <a href={c.xmlUrl} target="_blank" rel="noreferrer" className="text-tinta/65 hover:text-rojo-profundo hover:underline">
          XML
        </a>
      )}
      {c.cdrUrl && (
        <a href={c.cdrUrl} target="_blank" rel="noreferrer" className="text-tinta/65 hover:text-rojo-profundo hover:underline">
          CDR
        </a>
      )}
    </div>
  );
}

// Las columnas de la lista, en las dos versiones (con y sin «Cliente»), como la vieja «Actividad de hoy» y por
// el mismo motivo: según el ancho DE LA TARJETA (container queries) y no el de la ventana, porque con
// el menú lateral desplegado una ventana de 768 px deja ~480 px de contenido. Desde 900 px de tarjeta
// el cliente tiene su columna; entre 640 y 899 px pasa a la línea de abajo del número; por debajo
// de 640 px cada fila se apila.
const COLUMNAS = "@min-[640px]:grid @min-[640px]:grid-cols-[72px_minmax(0,1.1fr)_92px_minmax(0,1.4fr)] @min-[900px]:grid-cols-[72px_minmax(0,1.15fr)_minmax(0,1fr)_100px_minmax(0,1.7fr)]";

// Panel de Facturación electrónica: reserva el comprobante con su correlativo
// oficial ya mismo (RPC en Postgres puro) y lo transmite a SUNAT por Lucode en
// un paso aparte — el botón "Transmitir" de cada fila (ADR-0005, ADR-0009).
// Reservar y transmitir siguen separados a propósito: emitir no puede depender
// de que un proveedor externo esté arriba (principio 9).
// Un componente: la lista del mes y los dos modales de esta vista (anular y liberar). Las series
// viven en su propia vista (`SeriesPanel`) desde 2026-09-22. Las tarjetas de arriba las dibuja `ComprobantesTarjetas`.
export function ComprobantesPanel({
  comprobantes,
  periodo,
  esLider,
  tiendas,
}: {
  comprobantes: Comprobante[];
  /** Para el filtro de tienda y su nombre; solo se ofrece si en el mes hay comprobantes de más de una. */
  tiendas: { id: string; nombre: string }[];
  /** «este mes» o «en agosto»: cómo se dice el mes que se mira (`periodoDelMes`). */
  periodo: string;
  /** Anular y «liberar sin espera» son solo del líder; la terminal de ventas emite y reintenta. */
  esLider: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"anular" | "liberar" | null>(null);

  // Transmisión a Lucode (Fase 1, ADR-0009), por fila: la misma implementación que usa la
  // fila de «Actividad de hoy» del Resumen (`lib/useTransmitir.ts`).
  const { transmitiendoId, transmitir: onTransmitir, confirmacion: confirmacionTransmitir } = useTransmitir();

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

  function cerrarModal() {
    setModal(null);
  }

  const acciones = { transmitiendoId, consultandoId, onTransmitir, onAnularClick, onConsultarAnulacion, onLiberarClick, esLider };

  // Filtros de la lista (en memoria: el mes ya está entero en pantalla). Las opciones salen de lo que hay
  // en el mes, así nunca se ofrece un filtro que deja la lista vacía de entrada.
  const [filtroTipo, setFiltroTipo] = useState(TODOS);
  const [filtroTienda, setFiltroTienda] = useState(TODOS);
  const [filtroEstado, setFiltroEstado] = useState(TODOS);
  const tiposDelMes = [...new Set(comprobantes.map((c) => c.tipo))];
  const tiendasDelMes = tiendas.filter((t) => comprobantes.some((c) => c.ubicacion_id === t.id));
  const estadosDelMes = [...new Set(comprobantes.map((c) => chipDelComprobante(c).texto))];

  const { texto: busqueda } = useFacturacionBusqueda();
  const visibles = comprobantes.filter(
    (c) =>
      coincide(camposDeBusquedaDelComprobante(c), busqueda) &&
      (filtroTipo === TODOS || c.tipo === filtroTipo) &&
      (filtroTienda === TODOS || c.ubicacion_id === filtroTienda) &&
      (filtroEstado === TODOS || chipDelComprobante(c).texto === filtroEstado)
  );
  const totales = totalesPorTipo(visibles);

  return (
    <div className="space-y-6">
      {/* La confirmación con el combo «Responsable» antes de transmitir (ADR-0161). */}
      {confirmacionTransmitir}
      {/* Comprobantes del mes: una sola fila para todos los anchos (ver `COLUMNAS`). */}
      {/* `overflow-hidden` solo con filas: recorta el hover de la última fila contra las esquinas redondas. Sin filas
          (mes vacío o búsqueda sin resultados) la tarjeta es baja y recortaría el globo de ayuda del encabezado. */}
      <div className={`card-cayla anim-sube @container ${visibles.length > 0 ? "overflow-hidden" : ""}`} style={{ "--i": 7 } as CSSProperties}>
        <div className="px-5 pt-[18px] pb-3.5">
          <p className="label-cayla text-[11px] text-tinta/65">
            Comprobantes
            <Ayuda titulo="Estados de un comprobante">
              Pendiente de enviar: ya tiene su número oficial reservado (nadie más puede usarlo), pero todavía no se transmitió a SUNAT. Si SUNAT
              está caída, el número no se pierde: se reintenta después. De prueba: se transmitió a la plataforma de pruebas de Lucode, no a SUNAT;
              tiene número y PDF, pero no vale como comprobante de pago: no sustenta la venta ni el crédito fiscal de la clienta. Sale de ahí
              cuando el sistema apunta al ambiente de producción.
            </Ayuda>
          </p>
          <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">Todos los comprobantes</h2>
          <p className="mt-0.5 text-xs text-tinta/65">Los de {periodo}, con su estado ante SUNAT y lo que se puede hacer con cada uno.</p>
          {comprobantes.length > 0 && (
            <div className="mt-3 flex">
              <PanelPildoras>
                <DesplegablePildora icono={FileText} etiqueta="Tipo" valor={filtroTipo} onValor={setFiltroTipo}>
                  <ItemDesplegable value={TODOS}>Todos los tipos</ItemDesplegable>
                  {tiposDelMes.map((t) => (
                    <ItemDesplegable key={t} value={t}>
                      {ETIQUETA_TIPO[t]}
                    </ItemDesplegable>
                  ))}
                </DesplegablePildora>
                {tiendasDelMes.length > 1 && (
                  <DesplegablePildora icono={Store} etiqueta="Tienda" valor={filtroTienda} onValor={setFiltroTienda}>
                    <ItemDesplegable value={TODOS}>Todas las tiendas</ItemDesplegable>
                    {tiendasDelMes.map((t) => (
                      <ItemDesplegable key={t.id} value={t.id}>
                        {t.nombre}
                      </ItemDesplegable>
                    ))}
                  </DesplegablePildora>
                )}
                <DesplegablePildora icono={CircleCheck} etiqueta="Estado" valor={filtroEstado} onValor={setFiltroEstado}>
                  <ItemDesplegable value={TODOS}>Todos los estados</ItemDesplegable>
                  {estadosDelMes.map((e) => (
                    <ItemDesplegable key={e} value={e}>
                      {e}
                    </ItemDesplegable>
                  ))}
                </DesplegablePildora>
              </PanelPildoras>
            </div>
          )}
        </div>

        {comprobantes.length === 0 ? (
          <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Sin comprobantes {periodo}.</p>
        ) : visibles.length === 0 ? (
          <SinCoincidencias />
        ) : (
          <>
            <div className={`label-cayla hidden gap-x-4 border-t border-tinta/10 px-5 py-2 text-[11px] text-tinta/65 ${COLUMNAS}`}>
              <span>Fecha</span>
              <span>Comprobante</span>
              <span className="hidden @min-[900px]:inline">Cliente</span>
              <span className="text-right">Total</span>
              <span>Estado</span>
            </div>

            {visibles.map((c) => {
              const { botones, motivo, esRechazo } = accionComprobante(c, acciones);
              const { dia, hora } = diaYHoraLima(c.created_at);
              const chip = chipDelComprobante(c);
              const cliente = c.cliente_nombre ?? "Cliente varios";
              return (
                <div
                  key={c.id}
                  className={`flex flex-col gap-2 border-t border-tinta/10 px-5 py-3 transition-colors duration-150 hover:bg-tinta/[0.025] @min-[640px]:items-center @min-[640px]:gap-x-4 @min-[640px]:gap-y-0 ${COLUMNAS}`}
                >
                  <div className="flex items-baseline gap-2 @min-[640px]:block">
                    <p className="font-display text-lg leading-tight tabular-nums text-tinta">{dia}</p>
                    <p className="label-cayla text-[10px] text-tinta/65 @min-[640px]:mt-0.5">{hora}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[15px] leading-normal text-tinta">
                      <span className="text-tinta/65">{ETIQUETA_TIPO[c.tipo]}</span>{" "}
                      <b className="whitespace-nowrap font-semibold">
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
            {totales.length > 0 && (
              <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-tinta/10 bg-tinta/[0.02] px-5 py-3 text-[13px] text-tinta/70">
                {totales.map((t) => (
                  <span key={t.tipo}>
                    {ETIQUETA_TIPO[t.tipo]}: <b className="font-semibold tabular-nums text-tinta">{t.cantidad}</b> ·{" "}
                    <span className="tabular-nums text-tinta">{soles(t.monto)}</span>
                  </span>
                ))}
                <span className="text-tinta/55">Sin anulados ni liberados.</span>
              </p>
            )}
          </>
        )}
      </div>

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
