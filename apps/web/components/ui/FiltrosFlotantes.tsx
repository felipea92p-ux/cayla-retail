"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BotonFiltros } from "@/components/ui/FiltrosPildora";
import { useDestinoFlotante, usePosicionLista } from "@/components/ui/useAnclaje";

/** Ancho del panel (px): cabe una píldora de filtro con su valor («Categoría: Accesorios de moda») sin cortarla. */
const ANCHO_PANEL = 320;

/**
 * Los filtros detrás del botón «Filtros» (la píldora de siempre, `BotonFiltros`), en un panel que FLOTA bajo el botón y no empuja la lista
 * (Felipe 2026-10-26, Vitrina ▸ Modelos: «esos filtros pueden estar dentro de un ícono de filtro y que sea flotante»). Bajo `sm` el botón es
 * solo el ícono, con un punto si hay algo puesto: la barra del buscador conserva su ancho. Lo que va adentro son las píldoras de siempre
 * (`DesplegablePildora`): sus listas cuelgan aparte, y tocar una no cierra el panel, para poner varios filtros seguidos.
 *
 * Se cierra con un toque afuera o con Escape (el Escape de una lista abierta es de la lista: primero la cierra, después el panel). Cuelga de
 * un portal, como las demás listas (ADR-0211): una tarjeta con `@container` no lo tapa. Sin `role="dialog"` a propósito: las listas de
 * adentro buscan su lugar en la hoja más cercana, y aquí quedarían atrapadas dentro del panel.
 */
export function FiltrosFlotantes({ activos, children, pie, guia }: { activos: number; children: ReactNode; /** Lo que va al fondo del panel (típico: «Limpiar filtros»). */ pie?: ReactNode; /** Ancla de la guía interactiva (ADR-0389), en el botón. */ guia?: string }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const pos = usePosicionLista(contenedor, abierto, 360);
  const destino = useDestinoFlotante(contenedor, abierto);
  const visible = abierto && !!pos && !!destino;

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      const t = e.target as Element | null;
      // Las listas de las píldoras de adentro cuelgan de su propio portal (`lista-flotante`): tocarlas no es tocar afuera.
      if (contenedor.current?.contains(t) || t?.closest?.(".lista-flotante")) return;
      setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      contenedor.current?.querySelector<HTMLElement>("button")?.focus();
    };
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className="shrink-0">
      <BotonFiltros abierto={abierto} activos={activos} onClick={() => setAbierto((a) => !a)} soloIcono data-guia={guia} />
      {visible &&
        createPortal(
          <div
            id="filtros-panel"
            role="group"
            aria-label="Filtros"
            style={{
              position: "fixed",
              top: "top" in pos ? pos.top : undefined,
              bottom: "bottom" in pos ? pos.bottom : undefined,
              maxHeight: pos.maxHeight,
              width: `min(${ANCHO_PANEL}px, calc(100vw - 24px))`,
              // Pegado al botón, sin salirse por la derecha en una pantalla angosta.
              left: Math.max(12, Math.min(pos.left, window.innerWidth - ANCHO_PANEL - 12)),
            }}
            className="anim-revelar lista-flotante z-50 flex flex-col gap-3 overflow-y-auto rounded-lg p-3"
          >
            {children}
            {pie}
          </div>,
          destino,
        )}
    </div>
  );
}
