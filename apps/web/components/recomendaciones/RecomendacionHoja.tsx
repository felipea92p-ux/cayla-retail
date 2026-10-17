"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Archive, UserX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo } from "@/components/ui/campos";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { haceCuanto } from "@/lib/vender-hoy-reglas";
import { camposRecomendacion } from "@/lib/recomendaciones-guia";
import {
  MAX_RESPUESTA,
  avisoDelError,
  cuando,
  hrefFicha,
  letras,
  pideReleer,
  sePuedeResponder,
  sobreQue,
  textoLimpio,
  type Recomendacion,
} from "@/lib/recomendaciones-reglas";

type Hecho = "respondida" | "archivada" | "en_bandeja";

/**
 * La hoja de una recomendación (Tienda web ▸ Recomendaciones): lo que escribió el cliente, quién es (con su ficha, si quien mira ve las
 * fichas) y sobre qué; lo que ya se hizo con ella (quién la respondió o la archivó, y cuándo); y lo que falta: responderle (lo lee en
 * su cuenta de la tienda online; una sola vez) o, si no hace falta, archivarla sin responder. Desde el 2026-10-17 (decisión #2 A) ya no
 * se «marca como leída»: leerla no le daba nada al cliente y la sacaba de los pendientes. Todo firmado con el combo «Responsable»
 * (ADR-0162). Un doble toque no manda dos veces: el botón se apaga mientras la base responde y la base no repite (la
 * misma respuesta otra vez es «ya estaba»; otra encima de una que ya está se rechaza y la lista se relee).
 *
 * Se lee como una conversación (Felipe 2026-10-16: «muy saturada y poco intuitiva»): quién y sobre qué una sola vez arriba; el mensaje
 * del cliente y la respuesta de CAYLA en dos globos, cada uno con su hora; el estado no lleva insignia porque lo dice la conversación.
 * Cuando ya no hay nada que escribir (respondida, archivada o sin nombre) la hoja solo se lee: se cierra con la ✕ y no lleva «Cancelar»
 * ni el pie de la guía, y a un Admin no se le muestra el aviso del responsable (no tiene nada que elegir).
 */
export function RecomendacionHoja({
  recomendacion: r,
  veFichas,
  ahora,
  onClose,
  onCambio,
}: {
  recomendacion: Recomendacion;
  veFichas: boolean;
  ahora: number;
  onClose: () => void;
  /** Algo cambió en la base: la lista se relee y la fila respira. */
  onCambio: (id: string) => void;
}) {
  const responsable = useResponsable();
  const [respuesta, setRespuesta] = useState("");
  const [guardando, setGuardando] = useState<Hecho | null>(null);
  const enVuelo = useRef(false);
  const guia = useGuiaCampos(
    camposRecomendacion({ recomendacion: r, respuesta, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }),
  );
  // Sin nada que escribir (respondida, archivada o con la ficha anonimizada), la hoja solo se lee: la ✕ la cierra y no lleva «Cancelar»
  // (ADR-0358, familia `modal`: una salida a la vista, nunca las dos).
  const soloSeLee = !sePuedeResponder(r);
  // Un Admin no elige responsable (todo queda a su nombre): en una hoja que solo se lee, ese aviso no le dice nada que hacer.
  const verResponsable = !(soloSeLee && responsable.estado === "admin");
  const puedeResponder = sePuedeResponder(r);
  const n = letras(respuesta);

  async function guardar(que: Hecho, cerrar: () => void) {
    if (enVuelo.current) return;
    if (que !== "archivada" && que !== "en_bandeja" && !guia.puedeConfirmar) return;
    if (!responsable.listo) return;
    enVuelo.current = true;
    setGuardando(que);
    const base = createClient();
    const firma = responsable.firma();
    const consulta =
      que === "respondida"
        ? base.rpc("responder_recomendacion", { p_id: r.id, p_respuesta: textoLimpio(respuesta) })
        : base.rpc("archivar_recomendacion", { p_id: r.id, p_archivar: que === "archivada" });
    const { error } = await firmar(consulta, firma);
    enVuelo.current = false;
    setGuardando(null);
    responsable.despues(error);
    if (error) {
      const propio = avisoDelError(error, esFalloDeRed(error));
      if (propio) avisar.error(propio.titulo, { detalle: propio.detalle });
      else avisar.error(traducirError(error, que === "respondida" ? "enviar la respuesta" : "archivarla"));
      // Otra persona ya la respondió (o ya no está): la lista se relee para que se vea lo que hay de verdad.
      if (pideReleer(error.hint)) onCambio(r.id);
      return;
    }
    onCambio(r.id);
    cerrar();
    if (que === "respondida") {
      avisar.exito("Respuesta enviada", { detalle: `${r.cliente?.nombre ?? "El cliente"} la lee en su cuenta de la tienda online.` });
    } else if (que === "archivada") {
      // Archivar se deshace (ADR-0350, ley 7: perdonar antes que preguntar): sale de la bandeja y se puede traer de vuelta.
      avisar.exito("Archivada", {
        detalle: r.respuesta === null ? "Sale de la bandeja y el cliente la ve como leída; la encuentras en «Archivadas»." : "Sale de la bandeja; la encuentras en «Archivadas».",
        accion: {
          texto: "Deshacer",
          onClick: async () => {
            const { error: e2 } = await firmar(createClient().rpc("archivar_recomendacion", { p_id: r.id, p_archivar: false }), firma);
            if (e2) avisar.error(traducirError(e2, "sacarla del archivo"));
            else {
              onCambio(r.id);
              avisar.exito("De vuelta en la bandeja");
            }
          },
        },
      });
    } else {
      avisar.exito("De vuelta en la bandeja");
    }
  }

  const nombre = r.cliente?.nombre ?? null;
  return (
    <Modal
      titulo={
        nombre ? (
          <span className="flex min-w-0 items-center gap-3" data-guia="recomendacion.cliente">
            <AvatarPersona personaId={null} nombre={nombre} tamano={40} />
            <span className="min-w-0 break-words">{nombre}</span>
          </span>
        ) : (
          "Recomendación sin nombre"
        )
      }
      subtitulo={
        <>
          Sobre {sobreQue(r)}
          {nombre && veFichas && (
            <>
              {" · "}
              <Link href={hrefFicha(nombre)} onClick={onClose} className="btn-enlace">
                ver su ficha
              </Link>
            </>
          )}
        </>
      }
      onClose={onClose}
      tamano="mediana"
      conCerrar={soloSeLee}
      bloqueado={guardando !== null}
      // Primero se LEE lo que escribió el cliente: el foco va a la hoja (no a «Archivar» ni a la respuesta); Tab entra a los controles.
      focoEnLaHoja
    >
      {(cerrar) => (
        <div className="space-y-4">
          {/* La conversación: el cliente a la izquierda, CAYLA a la derecha, cada mensaje con su hora. */}
          <div className="space-y-3">
            <div className="max-w-[88%]">
              {/* Lo que escribió, tal cual (es texto: lo que parezca código se lee como texto). */}
              <blockquote
                className="whitespace-pre-line break-words rounded-2xl rounded-tl-md border border-sand bg-hueso/70 px-4 py-3 font-serif text-[18px] leading-snug text-tinta"
                data-guia="recomendacion.texto"
              >
                {r.texto}
              </blockquote>
              <p className="mt-1.5 pl-1 text-[12px] text-taupe">
                Llegó {haceCuanto(r.creadaEn, ahora)} · {cuando(r.creadaEn)}
                {/* Respondida, se leyó: el «visto» solo dice algo mientras no hay respuesta. */}
                {r.leidaEn && r.respuesta === null && <> · vista {r.leidaPor ? `por ${r.leidaPor}` : `el ${cuando(r.leidaEn)}`}</>}
              </p>
            </div>

            {r.respuesta !== null && (
              <div className="ml-auto max-w-[88%]" data-guia="recomendacion.respuesta-dada">
                <p className="whitespace-pre-line break-words rounded-2xl rounded-tr-md bg-tinta px-4 py-3 text-[14.5px] leading-snug text-crema">
                  {r.respuesta}
                </p>
                <p className="mt-1.5 pr-1 text-right text-[12px] text-taupe">
                  Respondió {r.respondidaPor ?? "CAYLA"}
                  {r.respondidaEn ? ` · ${cuando(r.respondidaEn)}` : ""} · lo lee en su cuenta de la tienda online
                </p>
              </div>
            )}

            {!r.cliente && (
              <p className="flex items-center gap-2 text-[13px] text-taupe">
                <UserX aria-hidden className="h-5 w-5 shrink-0" />
                Su ficha se anonimizó: la recomendación se queda, sin su nombre ni sus datos, y ya no se le responde.
              </p>
            )}

            {r.archivadaEn && (
              <p className="flex items-center gap-1.5 text-[12px] text-taupe">
                <Archive aria-hidden className="h-3.5 w-3.5 shrink-0" />
                Archivada {r.archivadaPor ? `por ${r.archivadaPor} ` : ""}el {cuando(r.archivadaEn)}
              </p>
            )}
          </div>

          {puedeResponder && (
            <CampoGuiado id="respuesta" guia={guia}>
              <div data-guia="recomendacion.respuesta">
                <Campo
                  etiqueta={guia.etiqueta("respuesta", "Tu respuesta")}
                  htmlFor={`respuesta-${r.id}`}
                  tono={n > MAX_RESPUESTA ? "error" : "neutro"}
                  pie={
                    n > MAX_RESPUESTA
                      ? `Te pasaste por ${n - MAX_RESPUESTA} ${n - MAX_RESPUESTA === 1 ? "letra" : "letras"}: acórtala un poco.`
                      : n > 0
                        ? `${n} de ${MAX_RESPUESTA} letras. La lee en su cuenta de la tienda online.`
                        : "La lee en su cuenta de la tienda online, en «Recomendaciones». Se escribe una sola vez."
                  }
                >
                  <div className="caja-cayla caja-campo caja-campo-texto-largo">
                    <textarea
                      id={`respuesta-${r.id}`}
                      className="self-stretch resize-none"
                      rows={3}
                      value={respuesta}
                      onChange={(e) => setRespuesta(e.target.value)}
                      placeholder="Escribe una respuesta corta y cálida…"
                      disabled={guardando !== null}
                    />
                  </div>
                </Campo>
              </div>
            </CampoGuiado>
          )}

          {verResponsable && (
            <CampoGuiado id="responsable" guia={guia}>
              <div data-guia="recomendacion.responsable">
                <ComboResponsable control={responsable} deshabilitado={guardando !== null} compacto />
              </div>
            </CampoGuiado>
          )}

          <div className={`space-y-2 ${soloSeLee ? "border-t border-sand pt-4" : "pt-1"}`}>
            {!soloSeLee && <PieGuia guia={guia} listo="Lista para enviar." />}
            <PieAcciones
              guia="recomendacion.acciones"
              izquierda={
                r.archivadaEn ? undefined : (
                  // Archivar no borra: la saca de la bandeja y se deshace desde el aviso. Por eso va tranquilo, con su ícono, y no en el
                  // rojo de «quitar» (Felipe 2026-10-16, excepción a `accion.eliminar` anotada en docs/unificar/boton.md).
                  <Boton
                    type="button"
                    peso="fantasma"
                    cargando={guardando === "archivada"}
                    textoCargando="Archivando…"
                    disabled={guardando !== null || !responsable.listo}
                    title={responsable.motivo ?? (puedeResponder ? "Si no hace falta responder: sale de la bandeja y el cliente la ve como leída" : undefined)}
                    onClick={() => guardar("archivada", cerrar)}
                  >
                    <span className="flex items-center gap-2">
                      <Archive aria-hidden className="-my-1 h-4 w-4 shrink-0" />
                      {puedeResponder ? "Archivar sin responder" : "Archivar"}
                    </span>
                  </Boton>
                )
              }
            >
              {!soloSeLee && (
                <Boton type="button" onClick={cerrar} disabled={guardando !== null}>
                  Cancelar
                </Boton>
              )}
              {puedeResponder && (
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando === "respondida"}
                  textoCargando="Enviando…"
                  disabled={!guia.puedeConfirmar || guardando !== null}
                  title={guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                  onClick={() => guardar("respondida", cerrar)}
                >
                  Enviar respuesta
                </Boton>
              )}
              {r.archivadaEn && (
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando === "en_bandeja"}
                  textoCargando="Sacando…"
                  disabled={guardando !== null || !responsable.listo}
                  title={responsable.motivo ?? undefined}
                  className={guia.claseConfirmar}
                  onClick={() => guardar("en_bandeja", cerrar)}
                >
                  Sacar del archivo
                </Boton>
              )}
            </PieAcciones>
          </div>
        </div>
      )}
    </Modal>
  );
}
