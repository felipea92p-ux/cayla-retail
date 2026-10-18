"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowRight, UserX } from "lucide-react";
import { Cajon } from "@/components/ui/Cajon";
import { Boton, Campo } from "@/components/ui/campos";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { VistaDelCliente } from "@/components/recomendaciones/VistaDelCliente";
import { LoQuePide } from "@/components/recomendaciones/LoQuePide";
import { useCatalogoParaResponder } from "@/components/recomendaciones/useCatalogoParaResponder";
import { useQuienEsElCliente } from "@/components/recomendaciones/useQuienEsElCliente";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { haceCuanto } from "@/lib/vender-hoy-reglas";
import { camposRecomendacion } from "@/lib/recomendaciones-guia";
import { necesitaCatalogo, temasDe, type TemaId } from "@/lib/recomendaciones-temas";
import { lineaDelCliente } from "@/lib/recomendaciones-cliente";
import { diaLima } from "@/lib/fechas-lima";
import { ayudaDeLaCaja, iniciosDe } from "@/lib/sugerencias-recomendaciones";
import {
  MAX_RESPUESTA,
  SEGUNDOS_PARA_DESHACER,
  avisoDelError,
  cuando,
  hrefFicha,
  letras,
  pideReleer,
  segundosQueFaltan,
  sePuedeResponder,
  sobreQue,
  textoLimpio,
  type Recomendacion,
} from "@/lib/recomendaciones-reglas";

type Hecho = "respondida" | "archivada" | "en_bandeja";

/** Una respuesta que espera sus 8 segundos para salir (actividad 3): con quién firmó al tocar «Enviar», no al salir. */
type Envio = { id: string; nombre: string | null; texto: string; firma: Parameters<typeof firmar>[1]; vence: number };

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
  // La respuesta que espera para salir (una a la vez). La base no deja corregir una respuesta: estos 8 segundos son para arrepentirse.
  const [envio, setEnvio] = useState<Envio | null>(null);
  const envioRef = useRef<Envio | null>(null);
  // La hora con que se dibuja la cuenta regresiva (la pone el clic en «Enviar» y la avanza el reloj: el dibujo no lee la hora).
  const [ahoraMs, setAhoraMs] = useState(0);

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

  // «Lo que pide» (actividad 4): de qué habla, el tema elegido en cada una y el catálogo, solo si algún tema lo necesita.
  const temas = useMemo(() => temasDe(r.texto), [r.texto]);
  const [temasElegidos, setTemasElegidos] = useState<Record<string, TemaId>>({});
  const tema = temas.find((t) => t.id === temasElegidos[r.id]) ?? temas[0] ?? null;
  const catalogo = useCatalogoParaResponder(necesitaCatalogo(temas));
  const primerNombre = r.cliente?.nombre.split(" ")[0] ?? null;
  // Quién es (actividad 5): su club, sus compras y su tienda, solo para quien ve las fichas de clientes (regla B-03).
  const quien = useQuienEsElCliente(r.cliente?.fichaId ?? null, veFichas);
  const inicios = iniciosDe(tema, { nombre: primerNombre, tienda: r.tienda?.nombre ?? null, datos: catalogo.estado === "ok" ? catalogo.datos : null });
  // Lo que había escrito antes de tocar una forma de empezar, para «Deshacer» (se olvida apenas vuelve a escribir).
  const [antesDelInicio, setAntesDelInicio] = useState<Record<string, string>>({});
  const caja = useRef<HTMLTextAreaElement>(null);
  function usarInicio(texto: string) {
    if (respuesta.trim() && respuesta !== texto) setAntesDelInicio((a) => ({ ...a, [r.id]: respuesta }));
    else setAntesDelInicio((a) => sinClave(a, r.id));
    escribir(texto);
    requestAnimationFrame(() => {
      const c = caja.current;
      if (!c) return;
      c.focus();
      c.setSelectionRange(c.value.length, c.value.length);
    });
  }
  const guia = useGuiaCampos(
    camposRecomendacion({ recomendacion: v, respuesta, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }),
  );
  const puedeResponder = sePuedeResponder(v);
  // Un Admin no elige responsable (todo queda a su nombre): en una hoja que solo se lee, ese aviso no le dice nada que hacer.
  const verResponsable = !(!puedeResponder && responsable.estado === "admin");
  const n = letras(respuesta);

  /** Manda una respuesta que esperaba (al vencer sus 8 s, con «Enviar ahora» o al salir de ella). Si falla, lo escrito se queda para
   *  volver a intentarlo. Va con `x-espera: no`: puede salir mientras se lee otra, y el loader de pantalla completa la taparía. */
  async function mandar(e: Envio) {
    if (envioRef.current?.id !== e.id) return; // ya se deshizo, o ya salió
    envioRef.current = null;
    setEnvio((x) => (x?.id === e.id ? null : x));
    enVuelo.current = true;
    setGuardando("respondida");
    const consulta = createClient().rpc("responder_recomendacion", { p_id: e.id, p_respuesta: e.texto }).setHeader("x-espera", "no");
    const { error } = await firmar(consulta, e.firma);
    enVuelo.current = false;
    setGuardando(null);
    responsable.despues(error);
    if (error) {
      const propio = avisoDelError(error, esFalloDeRed(error));
      if (propio) avisar.error(propio.titulo, { detalle: propio.detalle });
      else avisar.error(traducirError(error, "enviar la respuesta"));
      // Otra persona ya la respondió (o ya no está): la lista se relee para que se vea lo que hay de verdad.
      if (pideReleer(error.hint)) onCambio(e.id);
      return;
    }
    setConfirmados((c) => ({ ...c, [e.id]: { tipo: "respondida", texto: e.texto, en: new Date().toISOString() } }));
    setBorradores((b) => sinClave(b, e.id));
    onCambio(e.id);
    // Desde la actividad 6 (2026-10-17) la tienda online le avisa al entrar («CAYLA te respondió», 30 días) y la deja en su cuenta.
    avisar.exito("Respuesta enviada", { detalle: `${e.nombre ?? "El cliente"} la verá al entrar a la tienda online, y queda en su cuenta.` });
  }
  // El reloj y el cierre del cajón llaman a la última versión de `mandar` (la de la última vuelta, con su `onCambio`).
  const mandarRef = useRef(mandar);
  useEffect(() => {
    mandarRef.current = mandar;
  });

  // Los 8 segundos: al vencer, sale; mientras, la cuenta regresiva se repinta.
  useEffect(() => {
    if (!envio) return;
    const salir = window.setTimeout(() => void mandarRef.current(envio), Math.max(0, envio.vence - Date.now()));
    const tic = window.setInterval(() => setAhoraMs(Date.now()), 250);
    return () => {
      window.clearTimeout(salir);
      window.clearInterval(tic);
    };
  }, [envio]);
  // Cerrar la pestaña con una respuesta esperando: el navegador pregunta antes (si se va igual, no sale y lo escrito se pierde).
  useEffect(() => {
    if (!envio) return;
    const alSalir = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [envio]);
  // Irse a otra pantalla con una respuesta esperando: sale en ese momento.
  useEffect(
    () => () => {
      const e = envioRef.current;
      if (e) void mandarRef.current(e);
    },
    [],
  );

  /** Lo que espera, si espera, sale ya: al cerrar el cajón o al pasar a otra recomendación no se pierde. */
  const sacarLoQueEspera = () => {
    const e = envioRef.current;
    if (e) void mandar(e);
  };
  function enviar() {
    if (enVuelo.current || !guia.puedeConfirmar || !responsable.listo) return;
    if (envioRef.current) {
      if (envioRef.current.id === r.id) return; // un segundo toque no programa otra
      sacarLoQueEspera(); // la de otra recomendación sale ya, para que esta tenga sus propios 8 s
    }
    const ya = Date.now();
    const e: Envio = {
      id: r.id,
      nombre: r.cliente?.nombre ?? null,
      texto: textoLimpio(respuesta),
      firma: responsable.firma(),
      vence: ya + SEGUNDOS_PARA_DESHACER * 1000,
    };
    envioRef.current = e;
    setAhoraMs(ya);
    setEnvio(e);
  }
  function deshacerEnvio() {
    envioRef.current = null;
    setEnvio(null);
  }

  /** Archivar o sacar del archivo: van directo (se deshacen con «Deshacer» o «Sacar del archivo»). */
  async function archivar(que: "archivada" | "en_bandeja") {
    if (enVuelo.current || !responsable.listo) return;
    enVuelo.current = true;
    setGuardando(que);
    const id = r.id;
    const firma = responsable.firma();
    const { error } = await firmar(createClient().rpc("archivar_recomendacion", { p_id: id, p_archivar: que === "archivada" }), firma);
    enVuelo.current = false;
    setGuardando(null);
    responsable.despues(error);
    if (error) {
      const propio = avisoDelError(error, esFalloDeRed(error));
      if (propio) avisar.error(propio.titulo, { detalle: propio.detalle });
      else avisar.error(traducirError(error, que === "archivada" ? "archivarla" : "sacarla del archivo"));
      if (pideReleer(error.hint)) onCambio(id);
      return;
    }
    if (que === "archivada") setConfirmados((c) => ({ ...c, [id]: { tipo: "archivada", en: new Date().toISOString() } }));
    else setConfirmados((c) => sinClave(c, id));
    onCambio(id);
    if (que === "archivada") {
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
  // La respuesta de ESTA recomendación que espera para salir (la de otra, si la hay, sigue su reloj aunque no se vea).
  const pendiente = envio?.id === r.id ? envio : null;
  const cerrarHoja = () => {
    sacarLoQueEspera();
    onClose();
  };
  return (
    <Cajon
      onCerrar={cerrarHoja}
      velo={false}
      ancho="ancho"
      clave={r.id}
      marca={nombre ? <AvatarPersona personaId={null} nombre={nombre} tamano={40} /> : <UserX aria-hidden className="h-10 w-10 p-2 text-taupe" />}
      sobre={`Recomendación · ${sobreQue(r)}`}
      titulo={nombre ?? "Recomendación sin nombre"}
      frase={
        nombre && veFichas ? (
          <>
            {quien && <span data-guia="recomendacion.quien-es">{lineaDelCliente(quien, diaLima(new Date(ahora).toISOString()) ?? "")} · </span>}
            <Link href={hrefFicha(nombre)} onClick={cerrarHoja} className="btn-enlace">
              Ver su ficha
            </Link>
          </>
        ) : undefined
      }
      guiaCabecera="recomendacion.cliente"
      navegacion={
        navegacion && {
          ...navegacion,
          onNavegar: (d) => {
            if (ocupado) return;
            sacarLoQueEspera();
            navegacion.onNavegar(d);
          },
          que: "Recomendación",
        }
      }
      claseCuerpo="space-y-4"
      encimaDelPie={
        verResponsable ? (
          <div className="space-y-2 border-t border-tinta/10 px-6 pt-3">
            <CampoGuiado id="responsable" guia={guia}>
              <div data-guia="recomendacion.responsable">
                <ComboResponsable control={responsable} deshabilitado={ocupado} compacto />
              </div>
            </CampoGuiado>
            {puedeResponder && !pendiente && <PieGuia guia={guia} listo="Lista para enviar." />}
          </div>
        ) : undefined
      }
      pie={
        <span className="flex flex-wrap items-center gap-2.5" data-guia="recomendacion.acciones">
          {pendiente ? (
            // Mientras espera sus 8 s: «Deshacer» va junto a la respuesta; aquí, salir ya sin esperar.
            <Boton
              type="button"
              peso="primario"
              cargando={guardando === "respondida"}
              textoCargando="Enviando…"
              disabled={ocupado}
              onClick={() => void mandar(pendiente)}
            >
              Enviar ahora
            </Boton>
          ) : v.archivadaEn ? (
            <Boton
              type="button"
              peso="fantasma"
              cargando={guardando === "en_bandeja"}
              textoCargando="Sacando…"
              disabled={ocupado || !responsable.listo}
              title={responsable.motivo ?? undefined}
              onClick={() => void archivar("en_bandeja")}
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
              onClick={() => void archivar("archivada")}
            >
              <span className="flex items-center gap-2">
                <Archive aria-hidden className="-my-1 h-4 w-4 shrink-0" />
                {puedeResponder ? "Archivar sin responder" : "Archivar"}
              </span>
            </Boton>
          )}
          {pendiente ? null : puedeResponder ? (
            <Boton
              type="button"
              peso="primario"
              cargando={guardando === "respondida"}
              textoCargando="Enviando…"
              disabled={!guia.puedeConfirmar || ocupado}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
              onClick={enviar}
            >
              Enviar respuesta
            </Boton>
          ) : siguiente ? (
            // Ya no queda nada que hacer con esta: el paso que sigue es la próxima que espera (como «Seguir» de un paso a paso).
            <Boton
              type="button"
              peso="primario"
              disabled={ocupado}
              onClick={() => {
                sacarLoQueEspera();
                onSiguiente(siguiente.id);
              }}
            >
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

        {pendiente && (
          // Lo que va a salir, ya en su lugar de la conversación pero tenue: todavía se puede deshacer.
          <div className="ml-auto max-w-[88%]" data-guia="recomendacion.por-salir">
            <p className="whitespace-pre-line break-words rounded-2xl rounded-tr-md bg-tinta px-4 py-3 text-[14.5px] leading-snug text-crema opacity-60">
              {pendiente.texto}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center justify-end gap-x-2 pr-1 text-right text-[12px] text-taupe" role="status">
              Se envía en {segundosQueFaltan(pendiente.vence, ahoraMs)} s
              <BotonDeshacer onClick={deshacerEnvio} disabled={ocupado} />
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

      {puedeResponder && !pendiente && temas.length > 0 && tema && (
        <LoQuePide
          temas={temas}
          elegido={tema.id}
          onElegir={(id) => setTemasElegidos((t) => ({ ...t, [r.id]: id }))}
          lectura={catalogo}
          tienda={r.tienda?.nombre ?? null}
        />
      )}

      {puedeResponder && !pendiente && (
        // Formas de empezar que siguen lo que escribió (ADR-0290): saludan por su nombre y dicen qué se hará; el resto lo escribe quien responde.
        <div className="flex flex-wrap items-center gap-1.5" data-guia="recomendacion.inicios">
          <span className="mr-0.5 text-[12px] text-taupe">Empieza con</span>
          {inicios.map((i) => (
            <button key={i.etiqueta} type="button" className="pildora-cayla" disabled={ocupado} onClick={() => usarInicio(i.texto)}>
              {i.etiqueta}
            </button>
          ))}
          {antesDelInicio[r.id] !== undefined && (
            <BotonDeshacer
              onClick={() => {
                escribir(antesDelInicio[r.id]!);
                setAntesDelInicio((a) => sinClave(a, r.id));
              }}
            >
              Recuperar lo que escribí
            </BotonDeshacer>
          )}
        </div>
      )}

      {puedeResponder && !pendiente && (
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
                  ref={caja}
                  id={`respuesta-${r.id}`}
                  // El corrector del navegador en español: subraya «tenderemos» antes de que salga una respuesta que no se corrige.
                  lang="es"
                  spellCheck
                  className="self-stretch resize-none"
                  rows={4}
                  value={respuesta}
                  onChange={(e) => {
                    escribir(e.target.value);
                    if (antesDelInicio[r.id] !== undefined) setAntesDelInicio((a) => sinClave(a, r.id));
                  }}
                  placeholder={ayudaDeLaCaja(tema, primerNombre)}
                  disabled={ocupado}
                />
              </div>
            </Campo>
          </div>
        </CampoGuiado>
      )}

      {puedeResponder && !pendiente && <VistaDelCliente recomendacion={r} respuesta={respuesta} ahoraIso={new Date(ahora).toISOString()} />}
    </Cajon>
  );
}
