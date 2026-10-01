"use client";

import { Minus, Plus } from "lucide-react";
import { acotarCantidad, cantidadDe, leerCantidadTecleada, type Cantidades, type FilaDelSelector } from "@/lib/reponer-prenda-reglas";

// La lista de tallas de «Reponer» y de «Subir a almacén» (ADR-0295, ADR-0296): una fila por talla con lo que hay de cada lado y un
// control − 0 + para elegir cuántas se mueven. Lo único que cambia entre las dos ventanas es QUÉ lado manda (`tope`, `principal`,
// `secundaria` vienen de `filasDelSelector`); el marcado es uno solo para que se vean y se toquen igual.
//
// Lo que se ve es lo que se envía: la cifra se recorta al tope vivo (si tras refrescar quedó menos de lo elegido, baja).
export function SelectorDeTallas({
  filas,
  cantidades,
  problemas,
  bloqueado,
  onCambiar,
}: {
  filas: readonly FilaDelSelector[];
  cantidades: Cantidades;
  /** Lo que la base contestó fila por fila («Solo quedan 3 libres…»), por variante. */
  problemas: Readonly<Record<string, string>>;
  /** Mientras guarda o tras un corte de red (las cifras quedan fijas): los controles se apagan. */
  bloqueado: boolean;
  onCambiar: (varianteId: string, cantidad: number) => void;
}) {
  return (
    <ul className="divide-y divide-tinta/10 rounded-lg border border-tinta/10 px-3">
      {filas.map((f) => {
        const puede = f.tope > 0;
        const n = acotarCantidad(cantidadDe(cantidades, f.varianteId), f.tope);
        const problema = problemas[f.varianteId];
        return (
          <li key={f.varianteId} className="py-2.5">
            <div className={`flex items-center gap-3 ${puede ? "" : "opacity-60"}`}>
              <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-hueso px-1.5 text-sm font-semibold text-tinta">{f.talla}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-tinta">{f.principal}</p>
                <p className="text-xs text-taupe">{f.secundaria}</p>
              </div>
              {puede && (
                <span className="inline-flex h-9 shrink-0 items-center rounded-lg border border-sand bg-papel">
                  <button
                    type="button"
                    aria-label={`Una menos de la talla ${f.talla}`}
                    disabled={bloqueado || n <= 0}
                    onClick={() => onCambiar(f.varianteId, acotarCantidad(n - 1, f.tope))}
                    className="grid h-9 w-9 place-items-center text-tinta/70 disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <input
                    inputMode="numeric"
                    aria-label={`Cuántas de la talla ${f.talla}`}
                    value={n}
                    disabled={bloqueado}
                    onChange={(e) => onCambiar(f.varianteId, leerCantidadTecleada(e.target.value, f.tope))}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-9 bg-transparent text-center text-sm tabular-nums text-tinta outline-none"
                  />
                  <button
                    type="button"
                    aria-label={`Una más de la talla ${f.talla}`}
                    disabled={bloqueado || n >= f.tope}
                    onClick={() => onCambiar(f.varianteId, acotarCantidad(n + 1, f.tope))}
                    className="grid h-9 w-9 place-items-center text-tinta/70 disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              )}
            </div>
            {problema && (
              <p role="alert" className="mt-1.5 pl-12 text-xs text-rojo-profundo">
                {problema}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
