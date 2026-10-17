"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Archive, ArrowRight, UserX } from "lucide-react";
import { Cajon } from "@/components/ui/Cajon";
import { Boton, Campo } from "@/components/ui/campos";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
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

/** Lo que la base ya confirmó y la lista todavía no trae (`router.refresh` tarda un momento): se muestra en su lugar para que la
 *  respuesta enviada no desaparezca ni vuelva la caja de escribir. Se olvida apenas la lista lo trae. */
type Confirmado = { tipo: "respondida"; texto: string; en: string } | { tipo: "archivada"; en: string };

/** El mismo registro sin una de sus claves. */
function sinClave<T>(registro: Record<string, T>, clave: string): Record<string, T> {
  const copia = { ...registro };
  delete copia[clave];
  return copia;
}

/**
 * La hoja de una recomendación (Tienda web ▸ Recomendaciones): lo que escribió el cliente, quién es (con su ficha, si quien mira ve las
 * fichas) y sobre qué; lo que ya se hizo con ella (quién la respondió o la archivó, y cuándo); y lo que falta: responderle (lo lee en
 * su cuenta de la tienda online; una sola vez) o, si no hace falta, archivarla sin responder. Desde el 2026-10-17 (decisión #2 A) ya no
 * se «marca como leída»: leerla no le daba nada al cliente y la sacaba de los pendientes. Todo firmado con el combo «Responsable»
 * (ADR-0162). Un doble toque no manda dos veces: el botón se apaga mientras la base responde y la base no repite (la
 * misma respuesta otra vez es «ya estaba»; otra encima de una que ya está se rechaza y la lista se relee).
 *
 * Es un cajón lateral SIN velo (Felipe 2026-10-17, maqueta `docs/maquetas/recomendacion-hoja-2026-10/`): la bandeja sigue viva detrás,
 * tocar otra fila o ↑ ↓ cambia la recomendación sin cerrar el cajón, y lo escrito en cada una se guarda mientras el cajón esté abierto.
 * Al responder o archivar, la hoja se queda mostrando lo hecho y ofrece «Siguiente por responder». Se lee como una conversación
 * (Felipe 2026-10-16): el mensaje del cliente y la respuesta de CAYLA en dos globos, cada uno con su hora; el estado no lleva insignia
 * porque lo dice la conversación. A un Admin no se le muestra el aviso del responsable cuando no hay nada que hacer.
 */
export function RecomendacionHoja({
  recomendacion: r,
  veFichas,
  ahora,
  navegacion,
  siguiente,
  onSiguiente,
  onClose,
  onCambio,
}: {
  recomendacion: Recomendacion;
  veFichas: boolean;
  ahora: number;
  /** Dónde está en la lista que se ve, para ↑ ↓ y «3 de 12». Sin ella (salió del filtro al responderla) no hay flechas. */
  navegacion?: { indice: number; total: number; onNavegar: (delta: 1 | -1) => void };
  /** La que sigue esperando respuesta (otra que esta), o null si no queda ninguna. */
  siguiente: { id: string } | null;
  onSiguiente: (id: string) => void;
  onClose: () => void;
  /** Algo cambió en la base: la lista se relee y la fila respira. */
  onCambio: (id: string) => void;
}) {
  const responsable = useResponsable();
  // Lo escrito en cada recomendación, mientras el cajón siga abierto (pasar a otra con ↑ ↓ no lo borra).
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [confirmados, setConfirmados] = useState<Record<string, Confirmado>>({});
  const [guardando, setGuardando] = useState<Hecho | null>(null);
  const enVuelo = useRef(false);

  // Cuando la lista ya trae lo que la base confirmó, manda la lista (y su «quién y cuándo» de verdad). «Deshacer» un archivo borra
  // su confirmado; lo demás se olvida al cerrar el cajón.
  const confirmado = confirmados[r.id];
  const yaLlego = !confirmado || (confirmado.tipo === "respondida" ? r.respuesta !== null : r.archivadaEn !== null);

  // La recomendación como se ve: la de la lista, o con lo que la base ya confirmó encima mientras la lista se relee.
  const v: Recomendacion =
    !confirmado || yaLlego
      ? r
      : confirmado.tipo === "respondida"
        ? { ...r, respuesta: confirmado.texto, respondidaEn: confirmado.en, leidaEn: r.leidaEn ?? confirmado.en }
        : { ...r, archivadaEn: confirmado.en, leidaEn: r.leidaEn ?? confirmado.en };

  const respuesta = borradores[r.id] ?? "";
  const escribir = (texto: string) => setBorradores((b) => ({ ...b, [r.id]: texto }));
  const guia = useGuiaCampos(
    camposRecomendacion({ recomendacion: v, respuesta, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }),
  );
  const puedeResponder = sePuedeResponder(v);
  // Un Admin no elige responsable (todo queda a su nombre): en una hoja que solo se lee, ese aviso no le dice nada que hacer.
  const verResponsable = !(!puedeResponder && responsable.estado === "admin");
  const n = letras(respuesta);

  async function guardar(que: Hecho) {
    if (enVuelo.current) return;
    if (que === "respondida" && !guia.puedeConfirmar) return;
    if (!responsable.listo) return;
    enVuelo.current = true;
    setGuardando(que);
    const id = r.id;
    const texto = textoLimpio(respuesta);
    const base = createClient();
    const firma = responsable.firma();
    const consulta =
      que === "respondida"
        ? base.rpc("responder_recomendacion", { p_id: id, p_respuesta: texto })
        : base.rpc("archivar_recomendacion", { p_id: id, p_archivar: que === "archivada" });
    const { error } = await firmar(consulta, firma);
    enVuelo.current = false;
    setGuardando(null);
    responsable.despues(error);
    if (error) {
      const propio = avisoDelError(error, esFalloDeRed(error));
      if (propio) avisar.error(propio.titulo, { detalle: propio.detalle });
      else avisar.error(traducirError(error, que === "respondida" ? "enviar la respuesta" : "archivarla"));
      // Otra persona ya la respondió (o ya no está): la lista se relee para que se vea lo que hay de verdad.
      if (pideReleer(error.hint)) onCambio(id);
      return;
    }
    const en = new Date().toISOString();
    if (que === "respondida") {
      setConfirmados((c) => ({ ...c, [id]: { tipo: "respondida", texto, en } }));
      setBorradores((b) => sinClave(b, id));
    } else if (que === "archivada") {
      setConfirmados((c) => ({ ...c, [id]: { tipo: "archivada", en } }));
    } else {
      setConfirmados((c) => sinClave(c, id));
    }
    onCambio(id);
    if (que === "respondida") {
      avisar.exito("Respuesta enviada", { detalle: `${r.cliente?.nombre ?? "El cliente"} la lee en su cuenta de la tienda online.` });
    } else if (que === "archivada") {
      // Archivar se deshace (ADR-0350, ley 7: perdonar antes que preguntar): sale de la bandeja y se puede traer de vuelta.
      avisar.exito("Archivada", {
        detalle: r.respuesta === null ? "Sale de la bandeja y el cliente la ve como leída; la encuentras en «Archivadas»." : "Sale de la bandeja; la encuentras en «Archivadas».",
        accion: {
          texto: "Deshacer",
          onClick: async () => {
            const { error: e2 } = await firmar(createClient().rpc("archivar_recomendacion", { p_id: id, p_archivar: false }), firma);
            if (e2) avisar.error(traducirError(e2, "sacarla del archivo"));
            else {
              setConfirmados((c) => sinClave(c, id));
              onCambio(id);
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
  const ocupado = guardando !== null;
  return (
    <Cajon
      onCerrar={onClose}
      velo={false}
      ancho="ancho"
      clave={r.id}
      marca={nombre ? <AvatarPersona personaId={null} nombre={nombre} tamano={40} /> : <UserX aria-hidden className="h-10 w-10 p-2 text-taupe" />}
      sobre={`Recomendación · ${sobreQue(r)}`}
      titulo={nombre ?? "Recomendación sin nombre"}
      frase={
        nombre && veFichas ? (
          <Link href={hrefFicha(nombre)} onClick={onClose} className="btn-enlace">
            Ver su ficha
          </Link>
        ) : undefined
      }
      guiaCabecera="recomendacion.cliente"
      navegacion={navegacion && { ...navegacion, onNavegar: (d) => !ocupado && navegacion.onNavegar(d), que: "Recomendación" }}
      claseCuerpo="space-y-4"
      encimaDelPie={
        verResponsable ? (
          <div className="space-y-2 border-t border-tinta/10 px-6 pt-3">
            <CampoGuiado id="responsable" guia={guia}>
              <div data-guia="recomendacion.responsable">
                <ComboResponsable control={responsable} deshabilitado={ocupado} compacto />
              </div>
            </CampoGuiado>
            {puedeResponder && <PieGuia guia={guia} listo="Lista para enviar." />}
          </div>
        ) : undefined
      }
      pie={
        <span className="flex flex-wrap items-center gap-2.5" data-guia="recomendacion.acciones">
          {v.archivadaEn ? (
            <Boton
              type="button"
              peso="fantasma"
              cargando={guardando === "en_bandeja"}
              textoCargando="Sacando…"
              disabled={ocupado || !responsable.listo}
              title={responsable.motivo ?? undefined}
              onClick={() => guardar("en_bandeja")}
            >
              Sacar del archivo
            </Boton>
          ) : (
            // Archivar no borra: la saca de la bandeja y se deshace desde el aviso. Por eso va tranquilo, con su ícono, y no en el
            // rojo de «quitar» (Felipe 2026-10-16, excepción a `accion.eliminar` anotada en docs/unificar/boton.md).
            <Boton
              type="button"
              peso="fantasma"
              cargando={guardando === "archivada"}
              textoCargando="Archivando…"
              disabled={ocupado || !responsable.listo}
              title={responsable.motivo ?? (puedeResponder ? "Si no hace falta responder: sale de la bandeja y el cliente la ve como leída" : undefined)}
              onClick={() => guardar("archivada")}
            >
              <span className="flex items-center gap-2">
                <Archive aria-hidden className="-my-1 h-4 w-4 shrink-0" />
                {puedeResponder ? "Archivar sin responder" : "Archivar"}
              </span>
            </Boton>
          )}
          {puedeResponder ? (
            <Boton
              type="button"
              peso="primario"
              cargando={guardando === "respondida"}
              textoCargando="Enviando…"
              disabled={!guia.puedeConfirmar || ocupado}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
              onClick={() => guardar("respondida")}
            >
              Enviar respuesta
            </Boton>
          ) : siguiente ? (
            // Ya no queda nada que hacer con esta: el paso que sigue es la próxima que espera (como «Seguir» de un paso a paso).
            <Boton type="button" peso="primario" disabled={ocupado} onClick={() => onSiguiente(siguiente.id)}>
              <span className="flex items-center gap-2">
                Siguiente por responder
                <ArrowRight aria-hidden className="-my-1 h-4 w-4 shrink-0" />
              </span>
            </Boton>
          ) : null}
        </span>
      }
    >
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
            {/* Una vieja que alguien marcó leída sin responder: el «visto» dice algo mientras no hay respuesta. */}
            {v.leidaEn && v.respuesta === null && !v.archivadaEn && <> · vista {v.leidaPor ? `por ${v.leidaPor}` : `el ${cuando(v.leidaEn)}`}</>}
          </p>
        </div>

        {v.respuesta !== null && (
          <div className="ml-auto max-w-[88%]" data-guia="recomendacion.respuesta-dada">
            <p className="whitespace-pre-line break-words rounded-2xl rounded-tr-md bg-tinta px-4 py-3 text-[14.5px] leading-snug text-crema">
              {v.respuesta}
            </p>
            <p className="mt-1.5 pr-1 text-right text-[12px] text-taupe">
              Respondió {v.respondidaPor ?? "CAYLA"}
              {v.respondidaEn ? ` · ${cuando(v.respondidaEn)}` : ""} · lo lee en su cuenta de la tienda online
            </p>
          </div>
        )}

        {!r.cliente && (
          <p className="flex items-center gap-2 text-[13px] text-taupe">
            <UserX aria-hidden className="h-5 w-5 shrink-0" />
            Su ficha se anonimizó: la recomendación se queda, sin su nombre ni sus datos, y ya no se le responde.
          </p>
        )}

        {v.archivadaEn && (
          <p className="flex items-center gap-1.5 text-[12px] text-taupe">
            <Archive aria-hidden className="h-3.5 w-3.5 shrink-0" />
            Archivada {v.archivadaPor ? `por ${v.archivadaPor} ` : ""}el {cuando(v.archivadaEn)}
            {v.respuesta === null ? " sin responder: el cliente la ve como leída" : ""}
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
                  rows={4}
                  value={respuesta}
                  onChange={(e) => escribir(e.target.value)}
                  placeholder="Escribe una respuesta corta y cálida…"
                  disabled={ocupado}
                />
              </div>
            </Campo>
          </div>
        </CampoGuiado>
      )}
    </Cajon>
  );
}
