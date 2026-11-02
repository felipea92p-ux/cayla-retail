"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pedirAviso, quitarAviso } from "@/app/acciones/club";
import {
  etiquetaBotonAvisame,
  etiquetaQuitarAviso,
  mensajeAviso,
  MENSAJES_CLUB,
  textoAvisoAnotado,
  textoAvisoQuitado,
  textoBotonAvisame,
  TEXTO_CASILLA_WHATSAPP,
} from "@/lib/club";
import { Icono } from "../Icono";
import { useAvisoBreve } from "./useAvisoBreve";
import "@/app/estilos/club.css";

/**
 * «Avísame cuando llegue la M» (maqueta v4, `vProducto`: el botón ancho que reemplaza a «Agregar a la bolsa» cuando la talla no
 * hay). Anota en la base que esta cuenta espera ESA prenda (modelo, color y talla) en esa tienda; sin tienda elegida («Todas»), en
 * cualquier tienda de la web. Ya anotado dice «Te avisaremos cuando llegue». El aviso llega a «Mi cuenta ▸ Te avisamos cuando llegue»
 * (nunca por WhatsApp: el Club no manda mensajes personales, ADR-0288 G-5), y la tienda lo ve en Vitrina web ▸ Esperan una talla. Si
 * mientras tanto llegó, la base no lo anota (`hay`): el aviso lo dice y la página se vuelve a leer, para que la ficha ofrezca
 * agregarla a la bolsa.
 *
 * El permiso de WhatsApp (2026-10-31, maqueta `docs/maquetas/tienda-avisame-2026-10`, opción B): al tocar «Avísame» se abre una casilla
 * APAGADA de fábrica, «Escríbeme por WhatsApp cuando llegue». Solo si la marca, la tienda ve su celular en Vitrina web ▸ Esperan una talla.
 * Nunca se pre-marca ni se esconde: un permiso que no se pidió a la vista no vale (Ley 29733). Quitar el aviso lo retira.
 *
 * Quitarlo desde aquí (2026-10-15; antes, solo desde «Mi cuenta»): «Te avisaremos cuando llegue ×» es un botón que lo quita, como el
 * corazón quita un favorito, cuando se sabe CUÁL espera es: la que se acaba de pedir con este botón, o la que diga la ficha
 * (`esperaId`). Sin saberlo, se queda apagado como antes: nunca se adivina (con «Todas» y con una tienda elegida son esperas distintas).
 *
 * Dónde va: en la ficha (`FichaPrenda`), en lugar del botón principal, cuando la talla elegida no hay en ninguna tienda de la web
 * (`botonDeLaFicha`). `varianteId` es la prenda de ese color y esa talla; `sedeId`/`sedeNombre`, la tienda de «Ver lo que hay en» (o
 * `null`). `pedido` sale de `leerGuardadosEnBase(usuario).esperas.has(claveEspera(varianteId, sedeId))` (lib/club.ts) y `esperaId`,
 * del mismo mapa (`.get(…)`). Un botón por prenda y tienda (la ficha le pone su `key`): uno anotado no le presta su «Te avisaremos» a
 * la talla siguiente. `alAnotar` y `alQuitar` le cuentan a la ficha lo que pasó (la ficha lo dibuja dos veces: en la fila y en la
 * barra del celular).
 */
export function BotonAvisame({
  varianteId,
  talla,
  sedeId = null,
  sedeNombre = null,
  pedido = false,
  esperaId = null,
  alAnotar,
  alQuitar,
}: {
  varianteId: string;
  talla: string;
  sedeId?: string | null;
  /** El nombre web de la tienda elegida («Trujillo»), para decir dónde. */
  sedeNombre?: string | null;
  /** Ya lo había pedido (la página lo sabe por `leerGuardadosEnBase`). */
  pedido?: boolean;
  /** Cuál es esa espera (su id, del mismo `leerGuardadosEnBase`): con él, se puede quitar desde aquí. */
  esperaId?: string | null;
  alAnotar?: () => void;
  alQuitar?: () => void;
}) {
  const router = useRouter();
  const [anotado, setAnotado] = useState(pedido);
  const [deServidor, setDeServidor] = useState(pedido);
  // La espera que se pidió con ESTE botón (la base devuelve su id al anotarla).
  const [idPropio, setIdPropio] = useState<string | null>(null);
  if (deServidor !== pedido) {
    setDeServidor(pedido);
    setAnotado(pedido);
  }
  const [eligiendo, setEligiendo] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const { aviso, mostrar } = useAvisoBreve();
  const nombreSede = sedeId ? sedeNombre : null;
  const idDeLaEspera = idPropio ?? esperaId;

  function tocar() {
    if (pendiente || anotado) return;
    iniciar(async () => {
      const r = await pedirAviso(varianteId, sedeId, whatsapp);
      if (r.estado === "anotada") {
        setAnotado(true);
        setEligiendo(false);
        setIdPropio(r.esperaId);
        alAnotar?.();
        // Pidió WhatsApp y la base no lo registró: no tenemos su celular. Se le dice, no se calla.
        mostrar(whatsapp && !r.whatsapp ? TEXTO_CASILLA_WHATSAPP.sinCelular : textoAvisoAnotado(talla, nombreSede, r.whatsapp), true);
        setWhatsapp(false);
        return;
      }
      mostrar(mensajeAviso(r.estado), false);
      // Llegó mientras la miraba: que la ficha se vuelva a leer y ofrezca agregarla.
      if (r.estado === "hay") router.refresh();
    });
  }

  function quitar() {
    if (pendiente || !anotado || !idDeLaEspera) return;
    const id = idDeLaEspera;
    iniciar(async () => {
      const r = await quitarAviso(id);
      if (r === "quitada" || r === "no_esta") {
        // «No estaba»: ya se había quitado (en «Mi cuenta» o en otra pestaña). Para la persona, el resultado es el mismo.
        setAnotado(false);
        setIdPropio(null);
        alQuitar?.();
        mostrar(textoAvisoQuitado(talla), true);
        // La ficha vuelve a leer lo que la cuenta espera: el otro botón (fila o barra del celular) también se entera.
        router.refresh();
        return;
      }
      mostrar(r === "sin_sesion" ? "Entra a tu cuenta para quitarlo." : MENSAJES_CLUB.quitarSinRespuesta, false);
    });
  }

  return (
    <>
      {anotado && idDeLaEspera ? (
        <button
          type="button"
          className="t-btn t-btn-ancho t-btn-sec c-avisame c-avisame-pedido"
          onClick={quitar}
          disabled={pendiente}
          aria-busy={pendiente || undefined}
          aria-label={etiquetaQuitarAviso(talla, nombreSede)}
          title="Quitar el aviso"
        >
          <Icono nombre="check" />
          {/* En el celular, con la ×, la frase entera no cabe en una línea: «Te avisaremos» (la dice entera el aviso de abajo). */}
          <span>
            Te avisaremos<span className="c-avisame-largo"> cuando llegue</span>
          </span>
          <span className="c-avisame-x" aria-hidden="true">
            <Icono nombre="cerrar" />
          </span>
        </button>
      ) : anotado ? (
        <button type="button" className="t-btn t-btn-ancho t-btn-sec c-avisame" disabled>
          <Icono nombre="check" />
          Te avisaremos cuando llegue
        </button>
      ) : eligiendo ? (
        <div className="c-avisame-elige">
          <label className="c-avisame-casilla">
            <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} disabled={pendiente} />
            <span>
              <b>{TEXTO_CASILLA_WHATSAPP.titulo}</b>
              <span className="c-avisame-ayuda">{TEXTO_CASILLA_WHATSAPP.ayuda}</span>
            </span>
          </label>
          <button
            type="button"
            className="t-btn t-btn-ancho c-avisame"
            onClick={tocar}
            disabled={pendiente}
            aria-busy={pendiente || undefined}
            aria-label={etiquetaBotonAvisame(talla, nombreSede)}
          >
            <Icono nombre="campana" />
            {textoBotonAvisame(talla)}
          </button>
          <button type="button" className="c-avisame-cancelar" onClick={() => setEligiendo(false)} disabled={pendiente}>
            Ahora no
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="t-btn t-btn-ancho t-btn-sec c-avisame"
          onClick={() => setEligiendo(true)}
          disabled={pendiente}
          aria-label={etiquetaBotonAvisame(talla, nombreSede)}
        >
          <Icono nombre="campana" />
          {textoBotonAvisame(talla)}
        </button>
      )}
      {aviso}
    </>
  );
}
