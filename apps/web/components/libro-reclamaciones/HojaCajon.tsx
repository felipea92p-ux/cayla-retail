"use client";

import { useRef, useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { AvisoNoSeDeshace } from "@/components/ui/Aviso";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { avisar } from "@/components/ui/Avisos";
import { Cajon } from "@/components/ui/Cajon";
import { Boton, Campo } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { camposRespuesta } from "@/lib/libro-reclamaciones-guia";
import {
  INSIGNIA,
  MAX_RESPUESTA,
  NOMBRE_DOCUMENTO,
  avisoDelError,
  estadoDe,
  fechaCorta,
  fechaDelDia,
  letras,
  montoEnSoles,
  plazoEnPalabras,
  problemaDeLaRespuesta,
  textoLimpio,
  type HojaLibro,
} from "@/lib/libro-reclamaciones-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

type Navegacion = { indice: number; total: number; que: string; onNavegar: (d: 1 | -1) => void };

/**
 * Una hoja del Libro de Reclamaciones, completa, en el cajón de la derecha (ADR-0679): el plazo arriba (cuándo vence y cuántos días
 * hábiles quedan), lo mismo que firmó el cliente (sus datos, lo que compró o contrató, lo que reclama) y, si todavía no tiene, la
 * respuesta de CAYLA: se escribe, se elige quién responde y, como le llega al cliente por correo y no se corrige, se confirma antes de
 * enviarla. Con el velo de las hojas (difumina la lista de atrás); ↑ ↓ pasan a la hoja de al lado (lo escrito en cada una se guarda
 * mientras el cajón siga abierto). Vidrio Serena (ADR-0596): el plazo es una placa (`nota-cayla`), la confirmación, `AvisoNoSeDeshace`.
 */
export function HojaCajon({
  hoja,
  hoy,
  navegacion,
  onClose,
  onCambio,
}: {
  hoja: HojaLibro;
  hoy: string;
  navegacion?: Navegacion;
  onClose: () => void;
  /** La base guardó algo: la lista se relee. */
  onCambio: () => void;
}) {
  const responsable = useResponsable();
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // La respuesta recién enviada se muestra al instante, mientras la lista se relee.
  const [enviadas, setEnviadas] = useState<Record<string, string>>({});
  const enVuelo = useRef(false);

  const h: HojaLibro = enviadas[hoja.id] && !hoja.respuesta ? { ...hoja, respuesta: enviadas[hoja.id]!, respondida_en: new Date().toISOString() } : hoja;
  const respuesta = borradores[h.id] ?? "";
  const escribir = (t: string) => {
    setBorradores((b) => ({ ...b, [h.id]: t }));
    setConfirmando(null);
  };
  const guia = useGuiaCampos(camposRespuesta({ hoja: h, respuesta, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));
  const e = estadoDe(h);
  const monto = montoEnSoles(h.bien.monto);
  const n = letras(respuesta);
  const porResponder = !h.respuesta;

  async function enviar() {
    if (enVuelo.current || !guia.puedeConfirmar) return;
    enVuelo.current = true;
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("responder_hoja_reclamacion", { p_id: h.id, p_respuesta: textoLimpio(respuesta) }), responsable.firma());
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      const propio = esFalloDeRed(error) ? null : avisoDelError(error);
      if (propio) avisar.error(propio.titulo, { detalle: propio.detalle });
      else avisar.error(traducirError(error, "enviar la respuesta"));
      if (error.hint === "libro_ya_respondida") onCambio();
      return;
    }
    setEnviadas((x) => ({ ...x, [h.id]: textoLimpio(respuesta) }));
    setBorradores((b) => ({ ...b, [h.id]: "" }));
    setConfirmando(null);
    avisar.exito(`Respuesta enviada a ${h.consumidor.correo}`);
    onCambio();
  }

  return (
    <Cajon
      onCerrar={onClose}
      clave={h.id}
      guia="libro.cajon"
      sobre={h.tipo === "reclamo" ? "Reclamo" : "Queja"}
      titulo={`Hoja N.° ${h.codigo}`}
      frase={`Llegó el ${fechaCorta(h.creada_en)} · ${h.tienda ?? "Tienda online"} · Libro ${h.libro_codigo}`}
      marca={<AvatarPersona personaId={null} nombre={h.consumidor.nombre} tamano={40} />}
      debajo={
        <span className="flex flex-wrap items-center gap-2">
          <Chip tono={INSIGNIA[e].tono}>{INSIGNIA[e].texto}</Chip>
          {!h.copia_enviada && (
            <Chip tono="pizarra" title="La copia al correo del cliente todavía no salió: la tienda la reintenta cada 5 minutos">
              Copia por enviar
            </Chip>
          )}
        </span>
      }
      navegacion={
        navegacion && {
          ...navegacion,
          onNavegar: (d) => {
            if (guardando) return;
            setConfirmando(null);
            navegacion.onNavegar(d);
          },
        }
      }
      encimaDelPie={
        porResponder ? (
          <div className="space-y-2 border-t border-tinta/10 px-6 pt-3">
            <CampoGuiado id="responsable" guia={guia}>
              <div data-guia="libro.responsable">
                <ComboResponsable control={responsable} deshabilitado={guardando} compacto />
              </div>
            </CampoGuiado>
            {confirmando !== h.id && <PieGuia guia={guia} listo="Lista para enviar." />}
            {confirmando === h.id && <AvisoNoSeDeshace />}
          </div>
        ) : undefined
      }
      pie={
        porResponder ? (
          <span className="pie-acciones w-full" data-guia="libro.acciones">
            {confirmando === h.id ? (
              <>
                <Boton type="button" peso="fantasma" disabled={guardando} onClick={() => setConfirmando(null)}>
                  Seguir escribiendo
                </Boton>
                <Boton type="button" peso="primario" cargando={guardando} textoCargando="Enviando…" onClick={() => void enviar()}>
                  Sí, enviar
                </Boton>
              </>
            ) : (
              <Boton
                type="button"
                peso="primario"
                confirma={guia}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
                onClick={() => setConfirmando(h.id)}
              >
                Enviar respuesta
              </Boton>
            )}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <section data-guia="libro.plazo" className="nota-cayla sin-i text-sm">
          <p className="font-semibold text-tinta">{plazoEnPalabras(h)}</p>
          {!h.respuesta && (
            <p className="text-taupe">
              {h.vence_el < hoy ? "Venció" : "Vence"} el {fechaDelDia(h.vence_el)}: 15 días hábiles desde que llegó.
            </p>
          )}
        </section>

        {h.respuesta && (
          <section className="space-y-2" data-guia="libro.respuesta-dada">
            <TituloGrupo>La respuesta de CAYLA</TituloGrupo>
            <p className="whitespace-pre-line break-words text-detalle leading-relaxed text-tinta">{h.respuesta}</p>
            <p className="texto-detalle">
              {h.respuesta_enviada === false
                ? "En camino al correo del cliente: la tienda la manda en unos minutos."
                : `Le llegó a ${h.consumidor.correo}.`}
            </p>
          </section>
        )}

        <section className="space-y-2">
          <TituloGrupo>El cliente</TituloGrupo>
          <Datos
            filas={[
              ["Nombre", h.consumidor.nombre],
              [NOMBRE_DOCUMENTO[h.consumidor.tipo_documento], h.consumidor.documento],
              ["Correo", h.consumidor.correo],
              ["Teléfono", h.consumidor.telefono],
              ["Domicilio", h.consumidor.domicilio],
              ...(h.consumidor.menor_de_edad
                ? ([
                    ["Menor de edad, lo representa", h.consumidor.apoderado ?? ""],
                    ...(h.consumidor.apoderado_datos?.documento
                      ? [[`Su ${NOMBRE_DOCUMENTO[h.consumidor.apoderado_datos.tipo_documento ?? "dni"]}`, h.consumidor.apoderado_datos.documento]]
                      : []),
                    ...(h.consumidor.apoderado_datos?.domicilio ? [["Su domicilio", h.consumidor.apoderado_datos.domicilio]] : []),
                    ...(h.consumidor.apoderado_datos?.telefono ? [["Su teléfono", h.consumidor.apoderado_datos.telefono]] : []),
                    ...(h.consumidor.apoderado_datos?.correo ? [["Su correo", h.consumidor.apoderado_datos.correo]] : []),
                  ] as [string, string][])
                : []),
            ]}
          />
        </section>

        <section className="space-y-2">
          <TituloGrupo>Lo que compró o contrató</TituloGrupo>
          <Datos
            filas={[
              ["Fue", h.bien.tipo === "producto" ? "Un producto" : "Un servicio"],
              ["Qué", h.bien.descripcion],
              ["Monto reclamado", monto ?? "No lo indicó"],
            ]}
          />
        </section>

        <section className="space-y-2" data-guia="libro.detalle">
          <TituloGrupo>{h.tipo === "reclamo" ? "Lo que reclama" : "Su queja"}</TituloGrupo>
          <p className="whitespace-pre-line break-words text-detalle leading-relaxed text-tinta">{h.detalle}</p>
          <TituloGrupo>Lo que pide</TituloGrupo>
          <p className="whitespace-pre-line break-words text-detalle leading-relaxed text-tinta">{h.pedido}</p>
        </section>

        {porResponder && (
          <CampoGuiado id="respuesta" guia={guia}>
            <div data-guia="libro.respuesta">
              <Campo
                etiqueta={guia.etiqueta("respuesta", "La respuesta de CAYLA")}
                htmlFor={`respuesta-${h.id}`}
                tono={n > MAX_RESPUESTA ? "error" : "neutro"}
                pie={
                  n > MAX_RESPUESTA
                    ? problemaDeLaRespuesta(respuesta)
                    : n > 0
                      ? `${n} de ${MAX_RESPUESTA} letras. Le llega a ${h.consumidor.correo}.`
                      : `Le llega a ${h.consumidor.correo}. Responde a lo que pide: «${h.pedido.length > 60 ? `${h.pedido.slice(0, 60)}…` : h.pedido}».`
                }
              >
                <div className="caja-cayla caja-campo caja-campo-texto-largo">
                  <textarea
                    id={`respuesta-${h.id}`}
                    lang="es"
                    spellCheck
                    className="self-stretch resize-none"
                    rows={5}
                    value={respuesta}
                    onChange={(ev) => escribir(ev.target.value)}
                    disabled={guardando}
                  />
                </div>
              </Campo>
            </div>
          </CampoGuiado>
        )}
      </div>
    </Cajon>
  );
}

function Datos({ filas }: { filas: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {filas.map(([t, v]) => (
        <div key={t} className="contents">
          <dt className="text-taupe">{t}</dt>
          <dd className="break-words text-tinta">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
