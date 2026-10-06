"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Cake, Check, Gift, MessageCircle, Sparkles, Tag, type LucideIcon } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TABLA, Tabla } from "@/components/ui/Tabla";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { BeneficiosClubModal } from "@/components/clientas/BeneficiosClubModal";
import { useResponsable } from "@/lib/useResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { firmaOmitida, type ClaveSinResponsable } from "@/lib/responsable-omitido";
import { traducirError } from "@/lib/error-escritura";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { registrarBajaWhatsapp } from "@/lib/club-acciones";
import { deshacerAvisoEnviado, registrarAvisoEnviado } from "@/lib/club-avisos-acciones";
import type { BeneficiosClub } from "@/lib/club-beneficios-reglas";
import {
  INFO_TIPO_AVISO,
  TIPOS_AVISO,
  agruparPorTipo,
  celularAMedias,
  contarPorTipo,
  enlaceWhatsAppWeb,
  mismoCelular,
  problemaParaEnviar,
  sePuedeDeshacer,
  textoParaEnviar,
  type AvisoPendiente,
  type TipoAviso,
} from "@/lib/club-avisos-reglas";

// Clientas ▸ Avisos (ADR-0288, «Actualización 2026-10-01 (g)», G-8), con el dibujo de la pestaña «Avisos» del spike del club
// (`avisosHTML` en docs/maquetas/club-clientas-spike-2026-09/fuente/src/50-clientas.js, rama del spike): cabecera de su módulo →
// cifras (por mandar de cada tipo y enviados) → la nota de WhatsApp Web → filtros, responsable y la lista en UNA tarjeta, agrupada por
// tipo → nota con las reglas (CLAUDE.md «Paleta y orden de pantalla»).
//
// QUIÉN aparece lo decide la base (`fn_club_avisos_pendientes`: publicidad vigente de esta tienda, tope CL-21, grupo testigo CL-20);
// la pantalla no filtra a nadie. «Enviar» abre WhatsApp Web con el número y el texto listos y, en el mismo toque, lo anota
// (`registrar_aviso_enviado`); la fila queda «Enviada · Deshacer» en su lugar, sin saltar, durante 10 minutos.
//
// El responsable se elige UNA vez arriba de la lista y se queda mientras la pantalla esté abierta: mandar avisos es una tanda, y
// volver a elegir a la misma persona en cada fila sería un clic de más cada vez (como el Conteo, 2026-09-30). Si la base lo rechaza
// (ya no está de turno), el combo se vacía y relee la lista, como en todas partes.

const ICONO: Record<TipoAviso, LucideIcon> = { cumpleanos: Cake, aniversario: Gift, novedades: Sparkles, rebaja: Tag };
// Como el spike: las promesas del club en neutro; la publicidad en pizarra (informativo, no semáforo). Sin rojo: nada aquí es un error.
const TONO: Record<TipoAviso, TonoChip> = { cumpleanos: "neutro", aniversario: "neutro", novedades: "pizarra", rebaja: "pizarra" };

type Envio = { id: string; texto: string; enviadoEnMs: number };

/** La hora de un envío (fuera del componente: se llama al responder la base, nunca al dibujar). */
const relojMs = () => Date.now();

function sinClave<T>(registro: Record<string, T>, clave: string): Record<string, T> {
  const copia = { ...registro };
  delete copia[clave];
  return copia;
}

type Filtro = TipoAviso | "todos";

export function AvisosClubPanel({
  sede,
  esTienda,
  avisos,
  falla,
  beneficios,
}: {
  /** La sede activa del selector: los avisos salen del WhatsApp de esta tienda. */
  sede: { id: string; nombre: string };
  /** Los avisos los manda una TIENDA desde su número; en el Taller o un almacén no hay lista. */
  esTienda: boolean;
  avisos: AvisoPendiente[];
  /** La base no pudo dar la lista (la tanda 1g sin pegar): la pantalla lo dice y sigue. */
  falla: string | null;
  /** Solo para el líder: lo vigente del club para «Beneficios del club». `null` = no es líder (el botón no aparece). */
  beneficios: { valores: BeneficiosClub | null; falla: string | null } | null;
}) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: sede.id, etiqueta: sede.nombre });
  // Con la cuenta de una PERSONA, los avisos firman a su nombre sin elegir a nadie (Felipe, 2026-10-02): «Enviar», «Deshacer» y
  // «Pidió BAJA» son acciones sin responsable (`lib/responsable-omitido.ts`). Una terminal (la cuenta de la tienda, sin persona)
  // sigue eligiendo quién envía: la base anota a una persona en cada aviso (`club_avisos_enviados.enviado_por` es obligatorio).
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const listo = esPersona || responsable.listo;
  const motivo = esPersona ? null : responsable.motivo;
  const firmaDe = (clave: ClaveSinResponsable) => (esPersona ? firmaOmitida(clave) : responsable.firma());
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [envios, setEnvios] = useState<Record<string, Envio>>({});
  // Los avisos que se tocaron (enviados o deshechos) siguen a la vista aunque una relectura de la base ya no los traiga.
  const [tocados, setTocados] = useState<Record<string, AvisoPendiente>>({});
  // WhatsApp se abrió pero el envío no quedó anotado (la base no respondió): se ofrece anotarlo sin volver a abrir.
  const [sinAnotar, setSinAnotar] = useState<Record<string, string>>({});
  const [bajas, setBajas] = useState<string[]>([]);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [pidioBaja, setPidioBaja] = useState<AvisoPendiente | null>(null);
  const [beneficiosAbierto, setBeneficiosAbierto] = useState(false);
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
  const cuenta = contarPorTipo(todas.filter((a) => !envios[a.clave]));
  const enviados = Object.keys(envios).length;
  const grupos = agruparPorTipo(filtro === "todos" ? todas : todas.filter((a) => a.tipo === filtro));

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

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        sede={sede.nombre}
        titulo="Avisos"
        subtitulo="Los mensajes por mandar a cada miembro del club desde el WhatsApp de esta tienda."
        acciones={
          beneficios ? (
            <Boton onClick={() => setBeneficiosAbierto(true)} title="El % del cumpleaños, el aniversario y su vale">
              Beneficios del club
            </Boton>
          ) : undefined
        }
      />

      {esTienda && !falla && (
        <div className="anim-sube grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" style={{ "--i": 1 } as CSSProperties}>
          {TIPOS_AVISO.map((t) => (
            <TarjetaCifra key={t} etiqueta={INFO_TIPO_AVISO[t].titulo} valor={cuenta[t]}>
              {INFO_TIPO_AVISO[t].promocional ? "Promoción: máximo 2 al mes por miembro" : "Por mandar · no cuenta para el tope"}
            </TarjetaCifra>
          ))}
          <TarjetaCifra etiqueta="Enviados" valor={enviados} punto={enviados ? "verde" : undefined} className="col-span-2 sm:col-span-1">
            {enviados ? "Anotados desde que abriste esta pantalla" : "Todavía ninguno desde que abriste esta pantalla"}
          </TarjetaCifra>
        </div>
      )}

      {esTienda && (
        <p className="nota-cayla anim-sube" style={{ "--i": 2 } as CSSProperties}>
          Abre WhatsApp Web con el número de esta tienda antes de enviar.
        </p>
      )}

      <div className="anim-sube" style={{ "--i": 3 } as CSSProperties}>
        <Tabla>
          {esTienda && !falla && (
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 p-4">
              <nav className="flex flex-wrap gap-2" aria-label="Filtrar por tipo de aviso">
                {(["todos", ...TIPOS_AVISO] as const).map((t) => (
                  <button key={t} type="button" className="pildora-cayla" aria-pressed={filtro === t} onClick={() => setFiltro(t)}>
                    {t === "todos" ? "Todos" : INFO_TIPO_AVISO[t].titulo}
                    <span className="pildora-cayla__n">{t === "todos" ? cuenta.total : cuenta[t]}</span>
                  </button>
                ))}
              </nav>
              {!esPersona && (
                <CampoGuiado id="responsable" guia={guia} titulo="Quién envía" className="w-full sm:w-72">
                  <ComboResponsable control={responsable} deshabilitado={ocupado} />
                </CampoGuiado>
              )}
            </div>
          )}

          {!esTienda ? (
            <p className={TABLA.vacio}>Los avisos los manda cada tienda desde su número de WhatsApp. Elige una tienda en el selector de sede.</p>
          ) : falla ? (
            <p className={`${TABLA.vacio} text-rojo-profundo`}>{falla}</p>
          ) : grupos.length === 0 ? (
            <p className={TABLA.vacio}>{filtro === "todos" ? "Nada por mandar hoy desde esta tienda." : "Nada de este tipo por mandar."}</p>
          ) : (
            grupos.map((g) => (
              <section key={g.tipo} aria-label={INFO_TIPO_AVISO[g.tipo].titulo}>
                <div className="bg-hueso/40 px-5 py-2.5">
                  <p className="label-cayla text-[11px] text-tinta/70">
                    {INFO_TIPO_AVISO[g.tipo].titulo} <span className="tabular-nums text-tinta/50">· {g.avisos.filter((a) => !envios[a.clave]).length} por mandar</span>
                  </p>
                  <p className="text-xs text-taupe">{INFO_TIPO_AVISO[g.tipo].nota}</p>
                </div>
                <ul className="divide-y divide-sand">
                  {g.avisos.map((a) => (
                    <FilaAviso
                      key={a.clave}
                      a={a}
                      texto={envios[a.clave]?.texto ?? sinAnotar[a.clave] ?? textoDe(a)}
                      envio={envios[a.clave] ?? null}
                      sinAnotar={a.clave in sinAnotar}
                      ahora={ahora}
                      enCurso={enCurso === a.clave}
                      ocupado={ocupado}
                      motivoResponsable={listo ? null : motivo}
                      onEnviar={() => enviar(a)}
                      onAnotar={() => void anotar(a, sinAnotar[a.clave]!)}
                      onDeshacer={() => void deshacer(a)}
                      onBaja={() => setPidioBaja(a)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}

          {esTienda && !falla && (
            <p className={TABLA.pie}>Sin bot: cada tienda envía desde su propio número. «Enviar» abre WhatsApp Web con el texto listo y lo deja anotado.</p>
          )}
        </Tabla>
      </div>

      <p className="nota-cayla anim-sube" style={{ "--i": 4 } as CSSProperties}>
        La lista la arma la base: solo miembros que pidieron novedades por WhatsApp de esta tienda; <b>máximo 2 promociones al mes</b> por miembro
        (cumpleaños y aniversario no cuentan), y 1 de cada 5 miembros no recibe novedades ni rebajas para medir si los avisos sirven. Si un miembro
        responde <b>BAJA</b>, regístralo con «Pidió BAJA»: deja de recibir mensajes del club desde hoy, en las 3 tiendas.
      </p>

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

      {beneficiosAbierto && beneficios && (
        <BeneficiosClubModal
          lectura={beneficios}
          onClose={() => setBeneficiosAbierto(false)}
          onGuardado={() => {
            setBeneficiosAbierto(false);
            // Los textos de los avisos nombran el % y los vales: se vuelven a leer de la base.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Una socia y su aviso: por qué le toca, su celular a medias, el texto que le va a llegar y qué se puede hacer. */
function FilaAviso({
  a,
  texto,
  envio,
  sinAnotar,
  ahora,
  enCurso,
  ocupado,
  motivoResponsable,
  onEnviar,
  onAnotar,
  onDeshacer,
  onBaja,
}: {
  a: AvisoPendiente;
  texto: string;
  envio: Envio | null;
  sinAnotar: boolean;
  ahora: number;
  enCurso: boolean;
  ocupado: boolean;
  motivoResponsable: string | null;
  onEnviar: () => void;
  onAnotar: () => void;
  onDeshacer: () => void;
  onBaja: () => void;
}) {
  const Icono = envio ? Check : ICONO[a.tipo];
  const problema = envio ? null : problemaParaEnviar(a.telefono, texto);
  const bloqueo = problema ?? motivoResponsable;
  const deshacible = envio !== null && sePuedeDeshacer(envio.enviadoEnMs, ahora);
  const accionDiscreta =
    "label-cayla h-8 rounded-md px-2 text-[11px] text-tinta/65 transition-colors hover:bg-sand/40 hover:text-tinta disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <li className="flex gap-4 px-5 py-4 max-sm:flex-col max-sm:gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl max-sm:hidden ${envio ? "bg-verde/15 text-verde" : "bg-hueso text-taupe"}`} aria-hidden>
        <Icono className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-sm font-semibold text-tinta">{a.nombre}</b>
          <Chip tono={TONO[a.tipo]}>{INFO_TIPO_AVISO[a.tipo].chip}</Chip>
          <span className="text-xs tabular-nums text-tinta/60" title="El número completo va solo en el enlace de WhatsApp">
            {celularAMedias(a.telefono)}
          </span>
        </div>
        {a.detalle && <p className="mt-0.5 text-xs text-tinta/65">{a.detalle}</p>}
        <p className="mt-2 whitespace-pre-line break-words rounded-lg border border-sand bg-crema px-3 py-2 text-[13px] leading-snug text-tinta/80">{texto}</p>
        {problema && <p className="mt-1.5 text-xs text-ambar-profundo">{problema}</p>}
        {sinAnotar && !envio && <p className="mt-1.5 text-xs text-ambar-profundo">WhatsApp se abrió, pero el envío todavía no quedó anotado.</p>}
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 max-sm:flex-row max-sm:flex-wrap max-sm:items-center sm:w-44">
        {envio ? (
          <>
            <p className="text-xs text-verde sm:pt-2" role="status">
              Enviado · {diaYHoraLima(new Date(envio.enviadoEnMs).toISOString()).hora}
            </p>
            {deshacible && (
              <button type="button" className={accionDiscreta} onClick={onDeshacer} disabled={ocupado || motivoResponsable !== null} title={motivoResponsable ?? "Vuelve a la lista de por mandar"}>
                {enCurso ? "Deshaciendo…" : "Deshacer"}
              </button>
            )}
          </>
        ) : sinAnotar ? (
          <>
            <Boton peso="primario" className="!py-2.5 max-sm:flex-1" onClick={onAnotar} cargando={enCurso} disabled={ocupado || motivoResponsable !== null} title={motivoResponsable ?? undefined}>
              Anotar como enviado
            </Boton>
            <button type="button" className={accionDiscreta} onClick={onEnviar} disabled={ocupado || bloqueo !== null}>
              Abrir WhatsApp de nuevo
            </button>
          </>
        ) : (
          <Boton peso="primario" className="!py-2.5 max-sm:flex-1" onClick={onEnviar} cargando={enCurso} disabled={ocupado || bloqueo !== null} title={bloqueo ?? "Abre WhatsApp Web con su número y el texto listos"}>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {enCurso ? "Anotando…" : "Enviar"}
            </span>
          </Boton>
        )}
        <button type="button" className={accionDiscreta} onClick={onBaja} disabled={ocupado || !a.telefono || motivoResponsable !== null} title={motivoResponsable ?? "Respondió BAJA a un mensaje del club"}>
          Pidió BAJA
        </button>
      </div>
    </li>
  );
}
