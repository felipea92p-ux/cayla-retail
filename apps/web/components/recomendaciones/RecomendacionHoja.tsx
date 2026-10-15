"use client";

import { useRef, useState } from "react";
import { UserX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo } from "@/components/ui/campos";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { haceCuanto } from "@/lib/vender-hoy-reglas";
import { camposRecomendacion } from "@/lib/recomendaciones-guia";
import {
  INSIGNIA,
  MAX_RESPUESTA,
  accionPrincipal,
  cuando,
  estadoDe,
  hrefFicha,
  letras,
  pideReleer,
  sePuedeResponder,
  sobreQue,
  textoLimpio,
  type Recomendacion,
} from "@/lib/recomendaciones-reglas";

type Hecho = "leida" | "respondida" | "archivada" | "en_bandeja";

/**
 * La hoja de una recomendación (Clientes ▸ Recomendaciones): lo que escribió el cliente, quién es (con su ficha, si quien mira ve las
 * fichas) y sobre qué; lo que ya se hizo con ella (quién la leyó, la respondió o la archivó, y cuándo); y lo que falta: responderle (lo
 * lee en su cuenta de la tienda online; una sola vez), o solo marcarla como leída, o archivarla. Todo firmado con el combo
 * «Responsable» (ADR-0162). Un doble toque no manda dos veces: el botón se apaga mientras la base responde y la base no repite (la
 * misma respuesta otra vez es «ya estaba»; otra encima de una que ya está se rechaza y la lista se relee).
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
  const estado = estadoDe(r);
  const accion = accionPrincipal(r, respuesta);
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
      que === "leida"
        ? base.rpc("marcar_recomendacion_leida", { p_id: r.id })
        : que === "respondida"
          ? base.rpc("responder_recomendacion", { p_id: r.id, p_respuesta: textoLimpio(respuesta) })
          : base.rpc("archivar_recomendacion", { p_id: r.id, p_archivar: que === "archivada" });
    const { error } = await firmar(consulta, firma);
    enVuelo.current = false;
    setGuardando(null);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, que === "respondida" ? "enviar la respuesta" : que === "leida" ? "marcarla como leída" : "archivarla"));
      // Otra persona ya la respondió (o ya no está): la lista se relee para que se vea lo que hay de verdad.
      if (pideReleer(error.hint)) onCambio(r.id);
      return;
    }
    onCambio(r.id);
    cerrar();
    if (que === "respondida") {
      avisar.exito("Respuesta enviada", { detalle: `${r.cliente?.nombre ?? "El cliente"} la lee en su cuenta de la tienda online.` });
    } else if (que === "leida") {
      avisar.exito("Marcada como leída");
    } else if (que === "archivada") {
      // Archivar se deshace (ADR-0350, ley 7: perdonar antes que preguntar): sale de la bandeja y se puede traer de vuelta.
      avisar.exito("Archivada", {
        detalle: "Sale de la bandeja; la encuentras en «Archivadas».",
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
      titulo={nombre ? `Recomendación de ${nombre}` : "Recomendación sin nombre"}
      subtitulo={`Sobre ${sobreQue(r)}`}
      onClose={onClose}
      tamano="mediana"
      bloqueado={guardando !== null}
    >
      {(cerrar) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono={INSIGNIA[estado].tono} tachado={false}>
              {INSIGNIA[estado].texto}
            </Chip>
            <span className="text-[12.5px] text-taupe">
              Llegó {haceCuanto(r.creadaEn, ahora)} · {cuando(r.creadaEn)}
            </span>
          </div>

          {/* Lo que escribió, tal cual (es texto: lo que parezca código se lee como texto). */}
          <blockquote
            className="whitespace-pre-line break-words border-l-2 border-sand pl-4 font-serif text-[18px] leading-snug text-tinta"
            data-guia="recomendacion.texto"
          >
            {r.texto}
          </blockquote>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-guia="recomendacion.cliente">
            {r.cliente ? (
              <>
                <span className="flex min-w-0 items-center gap-2">
                  <AvatarPersona personaId={null} nombre={r.cliente.nombre} tamano={32} />
                  <span className="truncate font-semibold text-tinta">{r.cliente.nombre}</span>
                </span>
                {veFichas && (
                  <EnlaceVer href={hrefFicha(r.cliente.nombre)} alNavegar={onClose}>
                    Ver su ficha
                  </EnlaceVer>
                )}
              </>
            ) : (
              <span className="flex items-center gap-2 text-[13px] text-taupe">
                <UserX aria-hidden className="h-5 w-5 shrink-0" />
                Su ficha se anonimizó: la recomendación se queda, sin su nombre ni sus datos, y ya no se le responde.
              </span>
            )}
          </div>

          {(r.leidaEn || r.archivadaEn) && (
            <ul className="space-y-0.5 text-[12.5px] text-taupe">
              {r.leidaEn && (
                <li>
                  Leída {r.leidaPor ? `por ${r.leidaPor} ` : ""}el {cuando(r.leidaEn)}
                </li>
              )}
              {r.archivadaEn && (
                <li>
                  Archivada {r.archivadaPor ? `por ${r.archivadaPor} ` : ""}el {cuando(r.archivadaEn)}
                </li>
              )}
            </ul>
          )}

          {r.respuesta !== null && (
            <div className="rounded-2xl border border-sand bg-hueso/60 px-4 py-3" data-guia="recomendacion.respuesta-dada">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">Respuesta de CAYLA</p>
              <p className="mt-1 whitespace-pre-line break-words text-[14px] text-tinta">{r.respuesta}</p>
              <p className="mt-1.5 text-[12px] text-taupe">
                {r.respondidaPor ? `${r.respondidaPor} · ` : ""}
                {r.respondidaEn ? cuando(r.respondidaEn) : ""} · la lee en su cuenta de la tienda online
              </p>
            </div>
          )}

          {puedeResponder && (
            <CampoGuiado id="respuesta" guia={guia}>
              <div data-guia="recomendacion.respuesta">
                <Campo
                  etiqueta={guia.etiqueta("respuesta", "Tu respuesta")}
                  htmlFor={`respuesta-${r.id}`}
                  ayuda={r.leidaEn ? null : <span className="font-normal normal-case tracking-normal text-taupe"> · opcional</span>}
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

          <CampoGuiado id="responsable" guia={guia}>
            <div data-guia="recomendacion.responsable">
              <ComboResponsable control={responsable} deshabilitado={guardando !== null} />
            </div>
          </CampoGuiado>

          <div className="space-y-2 pt-1">
            <PieGuia guia={guia} listo={accion === "responder" ? "Lista para enviar." : "Todo listo."} />
            <PieAcciones
              guia="recomendacion.acciones"
              izquierda={
                // Archivar saca de la bandeja (lo de «quitar» va a la izquierda, en rojo: ADR-0358); se deshace desde el aviso.
                r.archivadaEn ? undefined : (
                  <Boton
                    type="button"
                    peso="peligro"
                    cargando={guardando === "archivada"}
                    textoCargando="Archivando…"
                    disabled={guardando !== null || !responsable.listo}
                    title={responsable.motivo ?? undefined}
                    onClick={() => guardar("archivada", cerrar)}
                  >
                    Archivar
                  </Boton>
                )
              }
            >
              <Boton type="button" onClick={cerrar} disabled={guardando !== null}>
                Cancelar
              </Boton>
              {accion === "leer" && (
                <Boton
                  type="button"
                  peso="primario"
                  cargando={guardando === "leida"}
                  textoCargando="Marcando…"
                  disabled={!guia.puedeConfirmar || guardando !== null}
                  title={guia.frase ?? undefined}
                  className={guia.claseConfirmar}
                  onClick={() => guardar("leida", cerrar)}
                >
                  Marcar como leída
                </Boton>
              )}
              {accion === "responder" && (
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
