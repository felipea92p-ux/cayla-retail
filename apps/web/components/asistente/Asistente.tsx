"use client";

import { ChevronRight, MessageCircleQuestion, PlayCircle, SearchX } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { abrirGuiaAqui } from "@/components/guias/MotorGuias";
import { Buscador } from "@/components/ui/Buscador";
import { Cajon } from "@/components/ui/Cajon";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { esAtajoDelAsistente } from "@/lib/asistente/atajo";
import { preseleccionar, type Sugerencia } from "@/lib/asistente/preseleccion";
import { GUIAS } from "@/lib/guias/registro";
import { guiaDeRuta } from "@/lib/guias/reglas";

// «Pregúntale a CAYLA» (ADR-0529, actividad 1): el botón de la cabecera y su cajón. Hoy, sin IA: lo que la persona escribe busca, mientras
// escribe, las guías interactivas (ADR-0389) de las pantallas que su rol ve (`preseleccionar`), y la que elige arranca en la pantalla de
// verdad. Es también lo que queda cuando la IA no está (el «modo básico» del ADR). Lo ve toda cuenta, también una terminal: no es un
// módulo, es una ayuda, como «Demo» (ADR-0306). Se abre con el botón, con «?» fuera de un campo o con ⌘/ (Ctrl+/) desde cualquier lado.

/** Lo que tarda el cajón en irse antes de arrancar la guía en la misma pantalla (la salida del cajón, `MS_SALIDA` de `Cajon`). */
const TRAS_CERRAR_MS = 260;

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

function CajonAsistente({ rutasDelMenu, onCerrar }: { rutasDelMenu: readonly string[]; onCerrar: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pregunta, setPregunta] = useState("");
  const aqui = guiaDeRuta(pathname, GUIAS);
  const sugerencias = useMemo(() => preseleccionar({ pregunta, guias: GUIAS, rutasDelMenu, rutaActual: pathname }), [pregunta, rutasDelMenu, pathname]);
  const escribio = pregunta.trim().length > 0;

  function llevar(s: Pick<Sugerencia, "href">, cerrar: () => void) {
    cerrar();
    if (s.href === null) setTimeout(abrirGuiaAqui, TRAS_CERRAR_MS);
    else router.push(`${s.href}${s.href.includes("?") ? "&" : "?"}demo=1`);
  }

  return (
    <Cajon
      onCerrar={onCerrar}
      marca={
        <span className="grid h-10 w-10 place-items-center rounded-full bg-sand/60 text-tinta">
          <MessageCircleQuestion className="h-5 w-5" aria-hidden />
        </span>
      }
      sobre="Pregúntale a CAYLA"
      titulo="¿Qué quieres hacer?"
      frase="Escríbelo con tus palabras y te muestro, en la pantalla de verdad, dónde se hace. No se guarda nada."
    >
      {(cerrar) => (
        <div className="space-y-5">
          <Buscador
            valor={pregunta}
            onCambio={setPregunta}
            placeholder="Escribe lo que quieres hacer"
            etiqueta="Lo que quieres hacer"
            autoFocus
            conteo={escribio && sugerencias.length > 0 ? `${sugerencias.length === 1 ? "1 demo" : `${sugerencias.length} demos`} pueden ayudarte` : undefined}
          />

          {!escribio ? (
            aqui ? (
              <section>
                <TituloGrupo className="mb-2">En esta pantalla</TituloGrupo>
                <FilaGuia titulo={aqui.titulo} detalle={aqui.resumen} onClick={() => llevar({ href: null }, cerrar)} />
              </section>
            ) : null
          ) : sugerencias.length > 0 ? (
            <ul className="overflow-hidden rounded-xl border border-sand bg-papel" aria-label="Demos que pueden ayudarte">
              {sugerencias.map((s, i) => (
                <li key={s.guia.id} className={i > 0 ? "border-t border-sand" : ""}>
                  <FilaGuia
                    titulo={s.guia.titulo}
                    detalle={s.paso ? `Paso: ${s.paso.titulo}` : s.guia.resumen}
                    aqui={s.href === null}
                    onClick={() => llevar(s, cerrar)}
                    enLista
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Borrar la búsqueda", onClick: () => setPregunta("") }}>
              No encontré una demo para «{pregunta.trim()}». Prueba con otras palabras, las que usarías en la tienda.
            </Vacio>
          )}
        </div>
      )}
    </Cajon>
  );
}

function FilaGuia({ titulo, detalle, aqui = false, enLista = false, onClick }: { titulo: string; detalle: string; aqui?: boolean; enLista?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sand/35 ${enLista ? "" : "rounded-xl border border-tinta/25 bg-papel"}`}
    >
      <PlayCircle className="h-4 w-4 shrink-0 text-tinta/70" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-tinta">
          {titulo}
          {aqui ? <span className="ml-2 text-[11px] text-taupe-profundo">· esta pantalla</span> : null}
        </span>
        <span className="mt-0.5 block text-xs text-tinta/60">{detalle}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-tinta/40 transition-transform duration-200 ease-cayla group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}
