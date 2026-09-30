"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ItemMenu = {
  clave: string;
  etiqueta: string;
  onSelect: () => void;
  /** Baja definitiva o algo que no se deshace solo: el texto va en rojo profundo. */
  peligro?: boolean;
  /** La opción se ve pero no se elige, y dice por qué debajo («ya se vendió: solo un líder la corrige», ADR-0263). Sigue
   *  alcanzable con las flechas (`aria-disabled`, no `disabled`): un lector de pantalla también tiene que oír el porqué. */
  motivo?: string;
};

const ANCHO = 208; // w-52
const ALTO_ITEM = 40;
const MARGEN = 8;

type Posicion = { top: number; left: number; maxHeight?: number };

/**
 * Dónde va un menú de `alto` px junto al botón `r`: abajo si cabe; si no, arriba si cabe; si no cabe en ninguno, del lado
 * con más lugar y con alto máximo (se desplaza por dentro). Nunca queda una opción fuera de la pantalla.
 */
function colocar(r: DOMRect, alto: number): Posicion {
  const left = Math.min(Math.max(MARGEN, r.right - ANCHO), window.innerWidth - ANCHO - MARGEN);
  const abajo = window.innerHeight - r.bottom - 4 - MARGEN;
  const arriba = r.top - 4 - MARGEN;
  if (alto <= abajo) return { top: r.bottom + 4, left };
  if (alto <= arriba) return { top: r.top - 4 - alto, left };
  return abajo >= arriba ? { top: r.bottom + 4, left, maxHeight: Math.max(ALTO_ITEM, abajo) } : { top: MARGEN, left, maxHeight: Math.max(ALTO_ITEM, arriba) };
}

/**
 * El menú «⋯» de una fila. Se dibuja en un portal con `position: fixed` (una tabla con `overflow-x-auto` recortaría
 * un menú absoluto) y se recoloca sobre el botón: hacia abajo si cabe, hacia arriba si no. Primero se ubica con un alto
 * estimado y, ya montado, con su alto REAL: una opción con `motivo` ocupa varias líneas, y con el estimado el menú se
 * abría hacia abajo y «Desactivar» quedaba fuera de la pantalla del celular (revisión 2026-09-28). Se cierra con Escape,
 * con un clic afuera, al desplazarse la página (no el propio menú) o al cambiar el tamaño de la ventana, y devuelve el
 * foco al botón. Flechas arriba y abajo recorren las opciones. Sin animación de entrada a propósito: es un menú, no un modal.
 *
 * `texto` (Clientas, 2026-09-30): el mismo menú detrás de un botón secundario con palabra («Más ▾») en vez del «⋯», para la
 * cabecera de una pantalla, donde las acciones de vez en cuando no deben ocupar una fila entera cada una.
 */
export function MenuAcciones({
  etiqueta,
  items,
  deshabilitado = false,
  texto,
}: {
  etiqueta: string;
  items: ItemMenu[];
  deshabilitado?: boolean;
  /** Si viene, el botón dice esto (con la forma de un botón secundario) en vez de «⋯». */
  texto?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<Posicion | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const cerrar = useCallback((devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    setPos(colocar(boton.current.getBoundingClientRect(), items.length * ALTO_ITEM + 12));
  }, [abierto, items.length]);

  // El menú existe recién cuando ya hay posición (segundo render): el foco a la primera opción se pide entonces,
  // no al abrir — si no, `menu.current` todavía es nulo y el teclado se queda en el botón.
  const montado = abierto && pos !== null;

  // Ya montado, se mide su alto de verdad (antes de pintar: no se ve el salto) y se recoloca si el estimado no alcanzaba.
  useLayoutEffect(() => {
    if (!montado || !menu.current || !boton.current) return;
    const alto = Math.max(menu.current.scrollHeight, menu.current.getBoundingClientRect().height);
    const real = colocar(boton.current.getBoundingClientRect(), alto);
    setPos((p) => (p && p.top === real.top && p.left === real.left && p.maxHeight === real.maxHeight ? p : real));
  }, [montado]);

  useEffect(() => {
    if (montado) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [montado]);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !boton.current?.contains(t)) cerrar(false);
    };
    const cierra = () => cerrar(false);
    // Desplazar la página cierra el menú (quedaría flotando lejos de su botón); desplazar el propio menú, no.
    const alDesplazar = (e: Event) => {
      if (e.target instanceof Node && menu.current?.contains(e.target)) return;
      cerrar(false);
    };
    document.addEventListener("pointerdown", afuera);
    window.addEventListener("resize", cierra);
    window.addEventListener("scroll", alDesplazar, true);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      window.removeEventListener("resize", cierra);
      window.removeEventListener("scroll", alDesplazar, true);
    };
  }, [abierto, cerrar]);

  function alTeclear(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      // Este Escape cerró el menú: que no siga hasta un modal o un atajo de la pantalla (useEscapeLibre.ts).
      e.stopPropagation();
      cerrar(true);
    } else if (e.key === "Tab") {
      cerrar(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const filas = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const i = filas.indexOf(document.activeElement as HTMLElement);
      const sig = e.key === "ArrowDown" ? (i + 1) % filas.length : (i - 1 + filas.length) % filas.length;
      filas[sig]?.focus();
    }
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        disabled={deshabilitado}
        onClick={() => setAbierto((a) => !a)}
        className={
          texto
            ? "label-cayla inline-flex items-center gap-2 rounded-md border border-tinta/25 px-4 py-3 max-sm:px-3 text-[11px] text-tinta outline-none transition-colors ease-cayla hover:border-rojo hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60 disabled:opacity-40 aria-expanded:border-rojo aria-expanded:text-rojo"
            : "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-tinta/20 text-lg leading-none text-tinta/75 transition-colors hover:border-tinta/40 hover:text-tinta disabled:opacity-40"
        }
      >
        {texto ? (
          <>
            {texto}
            <svg aria-hidden viewBox="0 0 10 6" className={`h-1.5 w-2.5 shrink-0 transition-transform duration-300 ease-cayla motion-reduce:transition-none ${abierto ? "-rotate-180" : ""}`}>
              <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
            </svg>
          </>
        ) : (
          <span aria-hidden>⋯</span>
        )}
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={etiqueta}
            onKeyDown={alTeclear}
            style={{ top: pos.top, left: pos.left, width: ANCHO, maxHeight: pos.maxHeight }}
            className={`card-cayla fixed z-[60] py-1.5 text-sm ${pos.maxHeight ? "overflow-y-auto overscroll-contain" : ""}`}
          >
            {items.map((it) => (
              <button
                key={it.clave}
                type="button"
                role="menuitem"
                aria-disabled={it.motivo ? true : undefined}
                onClick={() => {
                  if (it.motivo) return;
                  cerrar(false);
                  it.onSelect();
                }}
                className={`block w-full px-4 py-2.5 text-left transition-colors focus:outline-none ${
                  it.motivo ? "cursor-not-allowed text-tinta/45 focus:bg-tinta/[0.03]" : `hover:bg-tinta/[0.05] focus:bg-tinta/[0.05] ${it.peligro ? "text-rojo-profundo" : "text-tinta"}`
                }`}
              >
                {it.etiqueta}
                {it.motivo && <span className="mt-0.5 block text-[11.5px] leading-snug text-tinta/60">{it.motivo}</span>}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
