"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDestinoFlotante } from "./useAnclaje";

/** El «?» junto al título de una pantalla y su globo de vidrio (ADR-0358, ronda 18 de `/unificar`; Felipe 2026-10-30).
 *
 *  La frase bajo el título no se leía (15 px gris en todas las pantallas): ahora vive aquí, y también lo que la pantalla
 *  explicaba aparte con un «!» (`mas`). Se abre al tocar el «?», se cierra al tocarlo otra vez, al tocar afuera o con Escape,
 *  y cada vez que se entra a la pantalla vuelve cerrado. El globo cuelga de la capa flotante (`position: fixed`), como el de
 *  `<Ayuda>`: no mueve la página ni lo recorta el panel que lo contiene. Lo coloca este componente, debajo del «?» o, si no
 *  cabe, arriba; en el celular ocupa el ancho de la pantalla. Aspecto y movimiento: `app/estilos/ayuda-cabecera.css`.
 *
 *  Ronda 19 (Felipe 2026-10-30, A1 + F1): el mismo «?» explica también una sección (`tamano="seccion"`, en `<TituloSeccion ayuda>`)
 *  y una cifra o un campo (`tamano="texto"`, lo que dibuja `<Ayuda>`, que antes era un «!»): más chico, siempre arriba a la derecha
 *  de la última palabra. `etiqueta` es su nombre para el lector cuando el del globo no sirve («Cómo se lee»). */
export function AyudaCabecera({
  nombre,
  children,
  mas,
  guia,
  tamano = "cabecera",
  etiqueta,
}: {
  nombre?: string;
  children?: ReactNode;
  mas?: ReactNode;
  guia?: string;
  tamano?: "cabecera" | "seccion" | "texto";
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const globo = useRef<HTMLDivElement>(null);
  const pico = useRef<HTMLSpanElement>(null);
  const id = useId();
  const destino = useDestinoFlotante(boton, abierto);

  // Se escribe directo en el estilo (no en estado), en `useLayoutEffect`: el primer cuadro ya sale en su lugar.
  useLayoutEffect(() => {
    if (!abierto || !destino) return;
    const colocar = () => {
      const b = boton.current;
      const g = globo.current;
      const p = pico.current;
      if (!b || !g || !p) return;
      const margen = 16;
      // El ancho del documento y no `window.innerWidth` (lo mismo que `<Ayuda>`, 2026-10-09): en el celular la ventana «visible»
      // crece si algo se sale por la derecha.
      const anchoVentana = document.documentElement.clientWidth || window.innerWidth;
      const ancho = anchoVentana < 640 ? anchoVentana - 2 * margen : Math.min(380, anchoVentana - 2 * margen);
      g.style.width = `${ancho}px`;
      const r = b.getBoundingClientRect();
      const izquierda = Math.min(Math.max(margen, r.left - 8), anchoVentana - margen - ancho);
      g.style.left = `${izquierda}px`;
      const alto = g.offsetHeight;
      const cabeAbajo = r.bottom + 12 + alto + margen <= window.innerHeight;
      const arriba = !cabeAbajo && r.top - 12 - alto - margen >= 0;
      g.style.top = arriba ? `${r.top - 12 - alto}px` : `${r.bottom + 12}px`;
      const centro = r.left + r.width / 2;
      g.style.setProperty("--pico-x", `${Math.round(centro - izquierda)}px`);
      g.dataset.lado = arriba ? "arriba" : "abajo";
      p.dataset.lado = g.dataset.lado;
      p.style.left = `${Math.round(centro - 6)}px`;
      p.style.top = arriba ? `${r.top - 12 - 6}px` : `${r.bottom + 12 - 6}px`;
    };
    colocar();
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    return () => {
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", colocar, true);
    };
  }, [abierto, destino]);

  useEffect(() => {
    if (!abierto) return;
    const alTocarAfuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boton.current?.contains(t) && !globo.current?.contains(t)) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener("mousedown", alTocarAfuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alTocarAfuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  return (
    <>
      {/* Unión de palabra (U+2060): el «?» nunca baja solo a otra línea, se queda pegado a la última palabra del título. */}
      {"⁠"}
      <button
        ref={boton}
        type="button"
        className="ayuda-cab-q"
        data-tamano={tamano === "cabecera" ? undefined : tamano}
        data-guia={guia}
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={etiqueta ?? (nombre ? `Qué es ${nombre}` : tamano === "cabecera" ? "Qué es esta pantalla" : "Más información")}
        onClick={(e) => {
          // Un título puede vivir dentro de un enlace o una fila clicable: el «?» no la activa.
          e.preventDefault();
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
      >
        <span aria-hidden>?</span>
      </button>
      {abierto &&
        destino &&
        createPortal(
          // Al estar en un portal, React sube sus clics por el árbol de React (ADR-0128): se cortan aquí.
          <>
            <span ref={pico} className="ayuda-cab-pico" aria-hidden />
            <div ref={globo} id={id} role="note" className="ayuda-cab-globo" onClick={(e) => e.stopPropagation()}>
              {nombre && <p className="ayuda-cab-nombre">{nombre}</p>}
              {children && <div className="ayuda-cab-texto">{children}</div>}
              {mas && <div className="ayuda-cab-mas">{mas}</div>}
            </div>
          </>,
          destino,
        )}
    </>
  );
}
