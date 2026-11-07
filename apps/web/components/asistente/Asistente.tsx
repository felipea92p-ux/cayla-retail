"use client";

import { MessageCircleQuestion } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { esAtajoDelAsistente } from "@/lib/asistente/atajo";


// «Pregúntale a CAYLA» (ADR-0536): el botón de la cabecera y su cajón. Mientras la persona escribe, busca sin IA las guías interactivas
// (ADR-0389) de las pantallas que su rol ve (`preseleccionar`); al apretar «Preguntar» (o Enter), la pregunta va a la IA
// (`/api/asistente`, actividad 2), que elige el recorrido (hasta 3 pantallas, cada una con el paso que responde), y «Muéstrame» lo arranca
// en la pantalla de verdad, desde ese paso (actividad 3: `components/guias/recorrido.ts` y `MotorGuias`). Si la IA
// no está, queda la búsqueda sin ella (el «modo básico» del ADR): nunca se cae. Lo ve toda cuenta, también una terminal: no es un
// módulo, es una ayuda, como «Demo» (ADR-0306). Se abre con el botón, con «?» fuera de un campo o con ⌘/ (Ctrl+/) desde cualquier lado.

//
// El cajón (`CajonAsistente.tsx`) se descarga recién al abrirlo, o al acercarse al botón (ADR-0623): trae las 79 guías y no tiene por qué
// viajar con cada pantalla.
const cargarCajon = () => import("@/components/asistente/CajonAsistente");
const CajonAsistente = dynamic(() => cargarCajon().then((m) => m.CajonAsistente), { ssr: false });

export function BotonAsistente({ rutasDelMenu }: { /** Las entradas del menú de esta cuenta, ya resueltas por rol. */ rutasDelMenu: readonly string[] }) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      const destino = e.target instanceof HTMLElement ? e.target : null;
      const enCampo = !!destino && (destino.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(destino.tagName));
      // Sobre otra hoja abierta no se abre: espera su turno (ADR-0136), como el buscador de ⌘K.
      const hayHoja = !!document.querySelector('[role="dialog"]');
      if (!esAtajoDelAsistente({ tecla: e.key, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, enCampo, hayHoja, usada: e.defaultPrevented })) return;
      e.preventDefault();
      setAbierto(true);
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        onPointerEnter={() => void cargarCajon()}
        onFocus={() => void cargarCajon()}
        aria-label="Pregúntale a CAYLA cómo hacer algo"
        aria-haspopup="dialog"
        title="Pregúntale a CAYLA cómo hacer algo  ( ? )"
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-tinta/65 transition-colors hover:bg-sand/60 hover:text-rojo sm:px-2.5"
      >
        <MessageCircleQuestion /* unificar-fijo: el botón de la cabecera es del marco, trazo 1,5 y 18 px como «Actividad» y «Demo» (ronda 16) */ className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
        <span className="label-cayla hidden text-[11px] sm:inline">Preguntar</span>
      </button>
      {abierto ? <CajonAsistente rutasDelMenu={rutasDelMenu} onCerrar={() => setAbierto(false)} /> : null}
    </>
  );
}
