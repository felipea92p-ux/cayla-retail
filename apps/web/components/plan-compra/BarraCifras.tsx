"use client";

import type { ReactNode } from "react";

// La barra de cifras del Plan de campaña (Felipe 2026-10-12: «compacto por defecto, en una barra»; «los KPI de Historial iguales o similares a
// Resultados»): una sola fila de celdas separadas por una línea fina; «¿Cómo va?» (o lo que vaya primero) más ancha. Una celda con `onClick` es
// un filtro: la elegida se rellena de arena. Se decide por el ancho de la barra (consulta de contenedor), no de la ventana: angosta, de a dos.
// Con el «!» abierto, la barra sube sobre lo de abajo (`@container` encierra al globo).

export type CeldaBarra = {
  clave: string;
  etiqueta: string;
  /** La cifra grande; null = sin dato (se ve «—»). */
  valor: string | null;
  /** La unidad junto a la cifra («prendas»). */
  unidad?: string;
  /** La línea de abajo, en chico. */
  bajo?: string;
  /** Si filtra: está elegida o no. */
  activa?: boolean;
  onClick?: () => void;
};

export function BarraCifras({ celdas, primero, guia }: { celdas: readonly CeldaBarra[]; primero?: ReactNode; guia?: string }) {
  return (
    <div data-guia={guia} className="card-cayla @container has-[.anim-globo]:relative has-[.anim-globo]:z-30">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-3 @3xl:flex @3xl:items-stretch @3xl:gap-x-0 @3xl:px-2">
        {primero && <div className="col-span-2 flex min-w-0 flex-col justify-center gap-0.5 px-1 @3xl:flex-[1.6] @3xl:px-3">{primero}</div>}
        {celdas.map((x, k) => {
          const cuerpo = (
            <>
              <span className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">{x.etiqueta}</span>
              <span className="whitespace-nowrap">
                <span className="font-display text-xl leading-tight tabular-nums text-tinta">{x.valor ?? "—"}</span>
                {x.unidad && x.valor !== null && <span className="ml-1 text-xs text-taupe">{x.unidad}</span>}
              </span>
              {x.bajo && <span className="truncate text-xs text-tinta/65">{x.bajo}</span>}
            </>
          );
          return (
            <div key={x.clave} className={`min-w-0 @3xl:flex-1 @3xl:px-1.5 ${k > 0 || primero ? "@3xl:border-l @3xl:border-sand" : ""}`}>
              {x.onClick ? (
                <button
                  type="button"
                  aria-pressed={x.activa ?? false}
                  onClick={x.onClick}
                  className={`flex h-full w-full min-w-0 cursor-pointer flex-col justify-center rounded-xl px-3 py-1.5 text-left transition-colors hover:bg-hueso/70 ${x.activa ? "bg-hueso" : ""}`}
                >
                  {cuerpo}
                </button>
              ) : (
                // Sin clic, `activa` marca la tienda en la que estás (Historial, Felipe 2026-10-12): la misma arena que la elegida en Resultados.
                <div className={`flex h-full min-w-0 flex-col justify-center px-3 py-1.5 ${x.activa ? "rounded-xl bg-hueso" : ""}`}>{cuerpo}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
