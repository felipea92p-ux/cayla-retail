"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ItemMenu = {
  clave: string;
  etiqueta: string;
  onSelect: () => void;
  /** Baja definitiva o algo que no se deshace solo: el texto va en rojo profundo. */
  peligro?: boolean;
};

const ANCHO = 208; // w-52
const ALTO_ITEM = 40;

/**
 * El menú «⋯» de una fila. Se dibuja en un portal con `position: fixed` (una tabla con `overflow-x-auto` recortaría
 * un menú absoluto) y se recoloca sobre el botón: hacia abajo si cabe, hacia arriba si no. Se cierra con Escape, con
 * un clic afuera, al desplazarse o al cambiar el tamaño de la ventana, y devuelve el foco al botón. Flechas arriba
 * y abajo recorren las opciones. Sin animación de entrada a propósito: es un menú, no un modal.
 */
export function MenuAcciones({ etiqueta, items, deshabilitado = false }: { etiqueta: string; items: ItemMenu[]; deshabilitado?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const cerrar = useCallback((devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const alto = items.length * ALTO_ITEM + 12;
    const cabeAbajo = r.bottom + 4 + alto <= window.innerHeight;
    setPos({
      top: cabeAbajo ? r.bottom + 4 : Math.max(8, r.top - 4 - alto),
      left: Math.min(Math.max(8, r.right - ANCHO), window.innerWidth - ANCHO - 8),
    });
  }, [abierto, items.length]);

  // El menú existe recién cuando ya hay posición (segundo render): el foco a la primera opción se pide entonces,
  // no al abrir — si no, `menu.current` todavía es nulo y el teclado se queda en el botón.
  const montado = abierto && pos !== null;
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
    document.addEventListener("pointerdown", afuera);
    window.addEventListener("resize", cierra);
    window.addEventListener("scroll", cierra, true);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      window.removeEventListener("resize", cierra);
      window.removeEventListener("scroll", cierra, true);
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
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-tinta/20 text-lg leading-none text-tinta/75 transition-colors hover:border-tinta/40 hover:text-tinta disabled:opacity-40"
      >
        <span aria-hidden>⋯</span>
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={etiqueta}
            onKeyDown={alTeclear}
            style={{ top: pos.top, left: pos.left, width: ANCHO }}
            className="card-cayla fixed z-[60] py-1.5 text-sm"
          >
            {items.map((it) => (
              <button
                key={it.clave}
                type="button"
                role="menuitem"
                onClick={() => {
                  cerrar(false);
                  it.onSelect();
                }}
                className={`block w-full px-4 py-2.5 text-left transition-colors hover:bg-tinta/[0.05] focus:bg-tinta/[0.05] focus:outline-none ${it.peligro ? "text-rojo-profundo" : "text-tinta"}`}
              >
                {it.etiqueta}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
