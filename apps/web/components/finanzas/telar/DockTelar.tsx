"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";

export type AccionDock = {
  texto: string;
  /** Una letra: la tecla que hace lo mismo (sin Ctrl ni ⌘), fuera de un campo y sin una hoja abierta. */
  tecla: string;
  icono: ReactNode;
  principal?: boolean;
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

/**
 * El dock del telar: abajo y al centro, las cuatro cosas que más se hacen en ESTE submódulo de Finanzas, cada una con su tecla. Lo
 * arma cada submódulo con sus acciones; solo en escritorio (en el celular, lo de abajo es la Isla, `BarraDeAbajo`). Entra subiendo
 * una vez (ADR-0136). Una tecla no hace nada mientras se escribe en un campo o hay una hoja abierta.
 */
export function DockTelar({ acciones }: { acciones: AccionDock[] }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='combobox'], [role='dialog']")) return;
      if (document.querySelector("[role='dialog']")) return;
      const a = acciones.find((x) => x.tecla.toLowerCase() === e.key.toLowerCase());
      if (!a) return;
      e.preventDefault();
      if (a.onClick) a.onClick();
      else document.querySelector<HTMLAnchorElement>(`.dock-telar a[data-tecla="${a.tecla}"]`)?.click();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [acciones]);

  return (
    <nav className="dock-telar" aria-label="Lo que más se usa" data-guia="telar.dock">
      {acciones.map((a, i) => {
        const cuerpo = (
          <>
            {a.icono}
            <span>{a.texto}</span>
            <kbd className="dock-telar-tecla">{a.tecla.toUpperCase()}</kbd>
          </>
        );
        const clase = `dock-telar-accion${a.principal ? " es-principal" : ""}`;
        const estilo = { ["--i" as string]: i };
        return a.href ? (
          <Link key={a.texto} href={a.href} className={clase} style={estilo} data-tecla={a.tecla} title={`${a.texto} (${a.tecla.toUpperCase()})`}>
            {cuerpo}
          </Link>
        ) : (
          <button key={a.texto} type="button" onClick={a.onClick} className={clase} style={estilo} title={`${a.texto} (${a.tecla.toUpperCase()})`}>
            {cuerpo}
          </button>
        );
      })}
    </nav>
  );
}
