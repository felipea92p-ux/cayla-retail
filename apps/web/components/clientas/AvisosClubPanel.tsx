"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, MessageCircle, PartyPopper, Send, Store } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { firmaOmitida, type ClaveSinResponsable } from "@/lib/responsable-omitido";
import { traducirError } from "@/lib/error-escritura";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { registrarBajaWhatsapp } from "@/lib/club-acciones";
import { deshacerAvisoEnviado, registrarAvisoEnviado } from "@/lib/club-avisos-acciones";
import type { TextosDeAvisos } from "@/lib/club-avisos-mensajes";
import {
  INFO_TIPO_AVISO,
  agruparPorTipo,
  celularAMedias,
  enlaceWhatsAppWeb,
  mismoCelular,
  problemaParaEnviar,
  sePuedeDeshacer,
  textoParaEnviar,
  type AvisoPendiente,
  type TipoAviso,
} from "@/lib/club-avisos-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BurbujaAviso } from "./BurbujaAviso";
import { EditarMensajesAvisos } from "./EditarMensajesAvisos";

// Clientas ▸ Avisos (ADR-0288, «Actualización 2026-10-01 (g)», G-8), con el diseño «Uno a la vez» que Felipe eligió el 2026-10-20
// (`docs/maquetas/avisos-club-2026-10/`, opción A): la pantalla es una tanda. Arriba, cuánto va de hoy y quién envía; en el centro, UN
// miembro grande con su mensaje tal como le llega; «Enviar» abre WhatsApp Web y lo anota, y «Siguiente» pasa al que falta (o Enter);
// a la derecha, la fila de hoy agrupada por tipo, tocable. «Editar mensajes» abre la hoja que cambia lo que dicen los de ESTA tienda
// (quien tiene el módulo lo hace, Felipe 2026-10-20).
//
// QUIÉN aparece lo decide la base (`fn_club_avisos_pendientes`: publicidad vigente de esta tienda, tope CL-21, grupo testigo CL-20);
// la pantalla no filtra a nadie. «Enviar» abre WhatsApp Web con el número y el texto listos y, en el mismo toque, lo anota
// (`registrar_aviso_enviado`); queda «Enviado · Deshacer» durante 10 minutos.
//
// El responsable se elige UNA vez arriba y se queda mientras la pantalla esté abierta: mandar avisos es una tanda, y volver a elegir a
// la misma persona en cada miembro sería un clic de más cada vez (como el Conteo, 2026-09-30). Si la base lo rechaza (ya no está de
// turno), el combo se vacía y relee la lista, como en todas partes.

// Como el spike: las promesas del club en neutro; la publicidad en pizarra (informativo, no semáforo). Sin rojo: nada aquí es un error.
const TONO: Record<TipoAviso, TonoChip> = { cumpleanos: "neutro", puntos: "neutro", novedades: "pizarra", rebaja: "pizarra" };

type Envio = { id: string; texto: string; enviadoEnMs: number };

/** La hora de un envío (fuera del componente: se llama al responder la base, nunca al dibujar). */
const relojMs = () => Date.now();

function sinClave<T>(registro: Record<string, T>, clave: string): Record<string, T> {
  const copia = { ...registro };
  delete copia[clave];
  return copia;
}

export function AvisosClubPanel({
  sede,
  esTienda,
  avisos,
  falla,
  textos,
}: {
  /** La sede activa del selector: los avisos salen del WhatsApp de esta tienda. */
  sede: { id: string; nombre: string };
  /** Los avisos los manda una TIENDA desde su número; en el Taller o un almacén no hay lista. */
  esTienda: boolean;
  avisos: AvisoPendiente[];
  /** La base no pudo dar la lista (la tanda 1g sin pegar): la pantalla lo dice y sigue. */
  falla: string | null;
  /** Los mensajes que rigen en esta tienda (`fn_club_avisos_textos`); null fuera de una tienda o si la base no los dio. */
  textos: TextosDeAvisos | null;
}) {
  const responsable = useResponsable({ ubicacionId: sede.id, etiqueta: sede.nombre });
  // Con la cuenta de una PERSONA, los avisos firman a su nombre sin elegir a nadie (Felipe, 2026-10-02): «Enviar», «Deshacer» y
  // «Pidió BAJA» son acciones sin responsable (`lib/responsable-omitido.ts`). Una terminal (la cuenta de la tienda, sin persona)
  // sigue eligiendo quién envía: la base anota a una persona en cada aviso (`club_avisos_enviados.enviado_por` es obligatorio).
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const listo = esPersona || responsable.listo;
  const motivo = esPersona ? null : responsable.motivo;
  const firmaDe = (clave: ClaveSinResponsable) => (esPersona ? firmaOmitida(clave) : responsable.firma());
  // El miembro que está en el centro. Sin elegir, el primero que falta.
  const [elegido, setElegido] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [envios, setEnvios] = useState<Record<string, Envio>>({});
  // Los avisos que se tocaron (enviados o deshechos) siguen a la vista aunque una relectura de la base ya no los traiga.
  const [tocados, setTocados] = useState<Record<string, AvisoPendiente>>({});
  // WhatsApp se abrió pero el envío no quedó anotado (la base no respondió): se ofrece anotarlo sin volver a abrir.
  const [sinAnotar, setSinAnotar] = useState<Record<string, string>>({});
  const [bajas, setBajas] = useState<string[]>([]);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [pidioBaja, setPidioBaja] = useState<AvisoPendiente | null>(null);
  const [ahora, setAhora] = useState(relojMs);
  // Guía de foco (CLAUDE.md «Guía de foco»): lo único que se llena aquí, y solo en una terminal, es quién envía. Sin nadie elegido
  // el combo se enciende y dice que es lo que sigue; «Enviar» ya dice lo mismo en su `title` mientras está apagado. Con la cuenta de
  // una persona no hay nada que llenar.
  const guia = useGuiaCampos(
    esPersona ? [] : [{ id: "responsable", nombre: "Quién envía", requerido: true, hecho: responsable.listo, pendiente: "Elige quién envía los avisos." }],
    { enModal: false },
  );

  const todas = useMemo(() => {
    const llegaron = new Set(avisos.map((a) => a.clave));
    return [...avisos, ...Object.values(tocados).filter((a) => !llegaron.has(a.clave))].filter((a) => !bajas.some((t) => mismoCelular(t, a.telefono)));
  }, [avisos, tocados, bajas]);
  const grupos = agruparPorTipo(todas);
  const fila = grupos.flatMap((g) => g.avisos);
  const faltan = fila.filter((a) => !envios[a.clave]);
  const enviados = fila.length - faltan.length;
  const actual = fila.find((a) => a.clave === elegido) ?? faltan[0] ?? null;

  // «Deshacer» se apaga solo a los 10 minutos: mientras haya alguno vigente, el reloj de la pantalla avanza cada 15 s.
  const hayDeshacibles = Object.values(envios).some((e) => sePuedeDeshacer(e.enviadoEnMs, ahora));
  useEffect(() => {
    if (!hayDeshacibles) return;
    const reloj = setInterval(() => setAhora(relojMs()), 15_000);
    return () => clearInterval(reloj);
  }, [hayDeshacibles]);

  const textoDe = (a: AvisoPendiente) => textoParaEnviar(a.texto, { nombre: a.nombre, tienda: sede.nombre });

  async function anotar(a: AvisoPendiente, texto: string) {
    setEnCurso(a.clave);
    const { id, error } = await registrarAvisoEnviado({ clientaId: a.clientaId, tipo: a.tipo, referencia: a.referencia, texto, ubicacionId: sede.id }, firmaDe("aviso_club_enviar"));
    setEnCurso(null);
    if (error || !id) {
      if (error && !esPersona) responsable.despues(error);
      setSinAnotar((s) => ({ ...s, [a.clave]: texto }));
      avisar.error(traducirError(error, "anotar el aviso como enviado"), { detalle: "WhatsApp ya se abrió: cuando lo mandes, toca «Anotar como enviado»." });
      return;
    }
    const enviadoEnMs = relojMs();
    setSinAnotar((s) => sinClave(s, a.clave));
    setTocados((t) => ({ ...t, [a.clave]: a }));
    setEnvios((e) => ({ ...e, [a.clave]: { id, texto, enviadoEnMs } }));
    setAhora(enviadoEnMs);
  }

  // `window.open` va ANTES de cualquier espera: abierto después de un `await`, el navegador lo toma por una ventana emergente y la
  // bloquea. Si igual la bloquea, no se anota nada: un aviso que no se abrió no se mandó.
  function enviar(a: AvisoPendiente) {
    const texto = textoDe(a);
    const problema = problemaParaEnviar(a.telefono, texto);
    const enlace = enlaceWhatsAppWeb(a.telefono, texto);
    if (problema || !enlace) {
      avisar.error(problema ?? "Este aviso no se puede mandar.");
      return;
    }
    if (!listo) {
      if (motivo) avisar.error(motivo);
      return;
    }
    const pestana = window.open(enlace, "_blank");
    if (!pestana) {
      avisar.error("El navegador no dejó abrir WhatsApp Web.", { detalle: "Permite las ventanas emergentes de este sitio y vuelve a tocar «Enviar»." });
      return;
    }
    try {
      pestana.opener = null;
    } catch {
      // Una pestaña de otro origen puede no dejar tocarlo: no importa, solo corta el vínculo con el ERP.
    }
    void anotar(a, texto);
  }

  async function deshacer(a: AvisoPendiente) {
    const envio = envios[a.clave];
    if (!envio) return;
    if (!listo) {
      if (motivo) avisar.error(motivo);
      return;
    }
    setEnCurso(a.clave);
    const { error } = await deshacerAvisoEnviado(envio.id, firmaDe("aviso_club_deshacer"));
    setEnCurso(null);
    if (error) {
      if (!esPersona) responsable.despues(error);
      avisar.error(traducirError(error, "deshacer el envío"));
      return;
    }
    setEnvios((e) => sinClave(e, a.clave));
    avisar.exito("Envío deshecho", { detalle: `${a.nombre} vuelve a la lista de por mandar.` });
  }

  async function registrarBaja(a: AvisoPendiente) {
    if (!a.telefono) return;
    if (!listo) {
      if (motivo) avisar.error(motivo);
      return;
    }
    const { fichas, error } = await registrarBajaWhatsapp(a.telefono, sede.id, firmaDe("aviso_club_baja"));
    if (error) {
      if (!esPersona) responsable.despues(error);
      avisar.error(traducirError(error, "registrar la BAJA"));
      return;
    }
    setBajas((b) => [...b, a.telefono!]);
    avisar.exito("BAJA registrada", {
      detalle: `${a.nombre} no recibe más mensajes del club desde hoy${fichas > 1 ? ` (${fichas} fichas con ese número)` : ""}.`,
    });
  }


  const ocupado = enCurso !== null;

  /** «Siguiente» y «Saltar por ahora»: el próximo que falta DESPUÉS del de ahora (y si no hay, el primero que falta). */
  function pasarAlQueSigue() {
    if (!actual) return;
    const i = fila.findIndex((a) => a.clave === actual.clave);
    const sigue = [...fila.slice(i + 1), ...fila.slice(0, i)].find((a) => !envios[a.clave]);
    if (sigue) setElegido(sigue.clave);
  }

  function enviarAhora(a: AvisoPendiente) {
    setElegido(a.clave);
    enviar(a);
  }

  // Enter en la pantalla (fuera de un campo, un botón o una hoja): manda el de ahora o, si ya se mandó, pasa al que sigue. Así, al
  // volver de WhatsApp Web, la tanda sigue con una tecla.
  const alEnter = useRef<() => void>(() => {});
  alEnter.current = () => {
    if (!actual || ocupado || editando || pidioBaja) return;
    if (envios[actual.clave]) pasarAlQueSigue();
    else if (!sinAnotar[actual.clave] && listo && !problemaParaEnviar(actual.telefono, textoDe(actual))) enviarAhora(actual);
  };
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.repeat || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, button, a, [role=dialog], [role=listbox], [contenteditable=true]")) return;
      e.preventDefault();
      alEnter.current();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const pct = fila.length ? (enviados / fila.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede.nombre}
        titulo="Avisos"
        subtitulo="Los mensajes que hoy le tocan a cada miembro del club, listos para mandar desde el WhatsApp de esta tienda."
        acciones={
          textos && (
            <BotonEditar onClick={() => setEditando(true)} title={`Cambia lo que dice cada aviso de ${sede.nombre}`} guia="avisos.editar">
              Editar mensajes
            </BotonEditar>
          )
        }
      />

      {!esTienda ? (
        <Vacio guia="avisos.sin-tienda" icono={<Store />} titulo="Elige una tienda">
          Los avisos los manda cada tienda desde su número de WhatsApp. Elige una tienda en el selector de sede.
        </Vacio>
      ) : falla ? (
        <Aviso tono="error">{falla}</Aviso>
      ) : (
        <>
          <div
            className="anim-sube flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-sand bg-papel px-5 py-4"
            style={{ "--i": 1 } as CSSProperties}
            data-guia="avisos.avance"
          >
            <div className="min-w-60 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <b className="font-semibold text-tinta">Hoy en {sede.nombre}</b>
                <span className="tabular-nums text-tinta/70">
                  {fila.length === 0 ? "Nada por mandar" : `${enviados} de ${fila.length} enviados`}
                </span>
              </div>
              <BarraAvance pct={pct} decorativa />
            </div>
            {!esPersona && (
              <CampoGuiado id="responsable" guia={guia} titulo="Quién envía" className="w-full sm:w-72">
                <div data-guia="avisos.responsable">
                  <ComboResponsable control={responsable} deshabilitado={ocupado} />
                </div>
              </CampoGuiado>
            )}
          </div>

          {fila.length === 0 ? (
            <Vacio guia="avisos.vacio" icono={<Send />} titulo="Nada por mandar hoy">
              Ningún miembro de esta tienda tiene un aviso pendiente. Mañana la lista se arma sola otra vez.
            </Vacio>
          ) : (
            <div className="anim-sube grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ "--i": 2 } as CSSProperties}>
              <section className="rounded-xl border border-sand bg-papel p-5 sm:p-6" aria-label="El aviso de ahora" data-guia="avisos.foco">
                {actual && (
                  <Foco
                    key={actual.clave}
                    a={actual}
                    sede={sede.nombre}
                    texto={envios[actual.clave]?.texto ?? sinAnotar[actual.clave] ?? textoDe(actual)}
                    cierre={textos?.cierre}
                    envio={envios[actual.clave] ?? null}
                    sinAnotar={actual.clave in sinAnotar}
                    ahora={ahora}
                    enCurso={enCurso === actual.clave}
                    ocupado={ocupado}
                    motivoResponsable={listo ? null : motivo}
                    siguiente={faltan.find((x) => x.clave !== actual.clave) ?? null}
                    onEnviar={() => enviarAhora(actual)}
                    onAnotar={() => void anotar(actual, sinAnotar[actual.clave]!)}
                    onDeshacer={() => void deshacer(actual)}
                    onBaja={() => setPidioBaja(actual)}
                    onSiguiente={pasarAlQueSigue}
                  />
                )}
              </section>

              <aside className="rounded-xl border border-sand bg-papel p-4 lg:sticky lg:top-24" aria-label="La fila de hoy" data-guia="avisos.fila">
                <p className="font-serif text-[21px] leading-tight text-tinta">La fila de hoy</p>
                <p className="mb-1 text-xs text-taupe">Toca a alguien para ir a su mensaje.</p>
                {grupos.map((g) => (
                  <div key={g.tipo} className="mt-3">
                    <TituloGrupo cuenta={g.avisos.filter((a) => !envios[a.clave]).length} className="px-2">
                      {INFO_TIPO_AVISO[g.tipo].titulo}
                    </TituloGrupo>
                    <ul className="mt-1">
                      {g.avisos.map((a) => {
                        const hecho = Boolean(envios[a.clave]);
                        return (
                          <li key={a.clave}>
                            <button
                              type="button"
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sand/40 aria-[current=true]:bg-hueso aria-[current=true]:shadow-[inset_3px_0_0_var(--color-rojo)] ${hecho ? "text-tinta/55" : "text-tinta"}`}
                              aria-current={actual?.clave === a.clave}
                              onClick={() => setElegido(a.clave)}
                            >
                              {hecho ? (
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-verde/15 text-verde" aria-hidden>
                                  <Check className="h-4 w-4" />
                                </span>
                              ) : (
                                <AvatarPersona personaId={null} nombre={a.nombre} tamano={32} />
                              )}
                              <span className="min-w-0 flex-1 text-[13px]">
                                <span className="block truncate">{a.nombre}</span>
                                <span className="block truncate text-[11.5px] text-taupe">{hecho ? "Enviado" : (a.detalle ?? INFO_TIPO_AVISO[a.tipo].chip)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </aside>
            </div>
          )}
        </>
      )}

      {esTienda && (
        <p className="nota-cayla anim-sube" style={{ "--i": 3 } as CSSProperties} data-guia="avisos.reglas">
          Abre WhatsApp Web con el número de esta tienda. «Enviar» abre el chat con el mensaje escrito: allá solo aprietas Enter y vuelves
          aquí. La lista la arma la base: solo miembros que pidieron novedades por WhatsApp de esta tienda; <b>máximo 2 promociones al mes</b>{" "}
          por miembro (cumpleaños y puntos por vencer no cuentan), y 1 de cada 5 miembros no recibe novedades ni rebajas para medir si los
          avisos sirven. Si un miembro responde <b>BAJA</b>, márcalo con «Pidió BAJA»: deja de recibir mensajes del club desde hoy, en las 3 tiendas.
        </p>
      )}

      {editando && textos && <EditarMensajesAvisos textos={textos} sede={sede} onClose={() => setEditando(false)} />}

      {pidioBaja && (
        <ConfirmarConResponsable
          confirmacion={{
            titulo: `¿${pidioBaja.nombre} pidió BAJA?`,
            bajada:
              "Desde hoy no recibe ningún mensaje del club por WhatsApp, en las 3 tiendas: ni novedades, ni rebajas, ni los avisos de sus cupones. Sigue siendo miembro y usa sus beneficios en la tienda.",
            verbo: "Registrar BAJA",
            accion: () => registrarBaja(pidioBaja),
          }}
          onClose={() => setPidioBaja(null)}
        />
      )}
    </div>
  );
}

/** El miembro del centro: quién es, por qué le toca, su mensaje tal como le llega y qué se puede hacer. */
function Foco({
  a,
  sede,
  texto,
  cierre,
  envio,
  sinAnotar,
  ahora,
  enCurso,
  ocupado,
  motivoResponsable,
  siguiente,
  onEnviar,
  onAnotar,
  onDeshacer,
  onBaja,
  onSiguiente,
}: {
  a: AvisoPendiente;
  sede: string;
  texto: string;
  cierre?: string;
  envio: Envio | null;
  sinAnotar: boolean;
  ahora: number;
  enCurso: boolean;
  ocupado: boolean;
  motivoResponsable: string | null;
  /** El próximo que falta, para decir a quién lleva «Siguiente». */
  siguiente: AvisoPendiente | null;
  onEnviar: () => void;
  onAnotar: () => void;
  onDeshacer: () => void;
  onBaja: () => void;
  onSiguiente: () => void;
}) {
  const problema = envio ? null : problemaParaEnviar(a.telefono, texto);
  const bloqueo = problema ?? motivoResponsable;
  const deshacible = envio !== null && sePuedeDeshacer(envio.enviadoEnMs, ahora);
  const info = INFO_TIPO_AVISO[a.tipo];

  return (
    <div className="anim-sube">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          {envio ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-verde/15 text-verde" aria-hidden>
              <Check className="h-5 w-5" />
            </span>
          ) : (
            <AvatarPersona personaId={null} nombre={a.nombre} tamano={40} />
          )}
          <div className="min-w-0">
            <p className="truncate font-serif text-[28px] leading-tight text-tinta">{a.nombre}</p>
            {a.detalle && <p className="text-[13px] text-taupe">{a.detalle}</p>}
          </div>
        </div>
        <Chip tono={TONO[a.tipo]}>{info.chip}</Chip>
      </div>

      <div className="my-5 rounded-xl border border-sand bg-crema p-4" data-guia="avisos.texto">
        <div className="mb-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-taupe">
          <span title="El número completo va solo en el enlace de WhatsApp">
            Para {celularAMedias(a.telefono)} · desde el WhatsApp de {sede}
          </span>
          <span>{info.promocional ? "Promoción · máximo 2 al mes" : "Promesa del club · no cuenta para el tope"}</span>
        </div>
        <BurbujaAviso texto={texto} cierre={cierre} className="max-w-[460px]" />
      </div>

      {problema && <p className="mb-3 text-xs text-ambar-profundo">{problema}</p>}
      {sinAnotar && !envio && <p className="mb-3 text-xs text-ambar-profundo">WhatsApp se abrió, pero el envío todavía no quedó anotado.</p>}

      <div className="flex flex-wrap items-center gap-2.5" data-guia="avisos.acciones">
        {envio ? (
          <>
            <Chip tono="verde">Enviado · {diaYHoraLima(new Date(envio.enviadoEnMs).toISOString()).hora}</Chip>
            {deshacible && (
              <BotonDeshacer onClick={onDeshacer} disabled={ocupado || motivoResponsable !== null}>
                {enCurso ? "Deshaciendo…" : "Deshacer"}
              </BotonDeshacer>
            )}
            <span className="flex-1" />
            {siguiente ? (
              <Boton peso="primario" onClick={onSiguiente} title="También con Enter">
                <span className="inline-flex items-center gap-1.5">
                  Siguiente: {siguiente.nombre.split(/\s+/)[0]}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </Boton>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-verde" role="status">
                <PartyPopper className="h-4 w-4" aria-hidden />
                Listo: no queda nadie por hoy.
              </span>
            )}
          </>
        ) : sinAnotar ? (
          <>
            <Boton peso="primario" onClick={onAnotar} cargando={enCurso} disabled={ocupado || motivoResponsable !== null} title={motivoResponsable ?? undefined}>
              Anotar como enviado
            </Boton>
            <Boton peso="fantasma" onClick={onEnviar} disabled={ocupado || bloqueo !== null}>
              Abrir WhatsApp de nuevo
            </Boton>
          </>
        ) : (
          <>
            <Boton
              peso="primario"
              onClick={onEnviar}
              cargando={enCurso}
              textoCargando="Anotando…"
              disabled={ocupado || bloqueo !== null}
              title={bloqueo ?? "Abre WhatsApp Web con su número y el texto listos (también con Enter)"}
            >
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" aria-hidden />
                Enviar por WhatsApp
              </span>
            </Boton>
            {siguiente && (
              <Boton peso="fantasma" onClick={onSiguiente} disabled={ocupado}>
                Saltar por ahora
              </Boton>
            )}
          </>
        )}
        {!envio && (
          <button
            type="button"
            className="btn-cayla btn-sutil btn-chico ml-auto"
            onClick={onBaja}
            disabled={ocupado || !a.telefono || motivoResponsable !== null}
            title={motivoResponsable ?? "Respondió BAJA a un mensaje del club"}
          >
            Pidió BAJA
          </button>
        )}
      </div>
    </div>
  );
}
