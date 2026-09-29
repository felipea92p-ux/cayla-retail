"use client";

import { ROTULO_TAMANO_GRILLA, TAMANOS_GRILLA, type TamanoGrilla } from "@/lib/tamano-grilla";

/**
 * «Tamaño: Grande · Mediano · Pequeño» de la Grilla de Productos (Felipe, 2026-09-29). Es solo el control: quien lo pinta
 * (`ProductosGrilla`) guarda la elección en su cookie y cambia las columnas. Va con el mismo aspecto que el «Grilla · Tabla»
 * de la cabecera (grupo en hueso, la opción activa en papel) para que se lea como un interruptor de vista, no como un filtro.
 */
export function SelectorTamanoGrilla({ valor, onCambiar }: { valor: TamanoGrilla; onCambiar: (t: TamanoGrilla) => void }) {
  return (
    <div className="flex items-center justify-end gap-2.5">
      <span id="tamano-grilla-rotulo" className="label-cayla text-[10.5px] text-tinta/60">
        Tamaño
      </span>
      <div role="group" aria-labelledby="tamano-grilla-rotulo" className="flex gap-0.5 rounded-lg bg-sand p-0.5">
        {TAMANOS_GRILLA.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onCambiar(t)}
            aria-pressed={valor === t}
            className={`label-cayla inline-flex items-center rounded-md px-3 py-1.5 text-[10.5px] transition-colors ${
              valor === t ? "bg-papel text-tinta shadow-sm" : "text-tinta/60 hover:text-tinta"
            }`}
          >
            {ROTULO_TAMANO_GRILLA[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
