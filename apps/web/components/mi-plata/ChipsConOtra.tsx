"use client";

import type { ReactNode } from "react";
import { Desplegable, type Opcion } from "@/components/ui/campos";
import { chipsDeLoHabitual } from "@/lib/compra-rapida-reglas";

// «¿Qué es?» y «¿De qué marca?» de «Algo nuevo» (maqueta docs/maquetas/mis-compras-rediseno-2026-10/, Felipe 2026-10-26): como chips solo lo
// habitual de este proveedor (hasta 4) y, al final, «Otra…», que abre la lista completa con su buscador (ADR-0209). Con muchas categorías o
// marcas la hoja no se alarga. Un proveedor sin nada habitual no tiene chips: un solo campo, «Elige una categoría», abre la misma lista
// («Otra…» solo existe cuando hay chips al lado). Lo elegido en la lista se ve en el mismo control, con su nombre.
export function ChipsConOtra({
  todas,
  habituales,
  valor,
  onValor,
  opciones,
  etiqueta,
  marcadorSinChips,
  guia,
  alFinal,
}: {
  todas: readonly { id: string; nombre: string }[];
  /** Los ids que se ofrecen como chips, en su orden. */
  habituales: readonly string[];
  valor: string | null;
  onValor: (id: string) => void;
  /** La lista completa del combo, ya agrupada. */
  opciones: readonly Opcion<string>[];
  etiqueta: string;
  marcadorSinChips: string;
  guia?: string;
  /** Una píldora más al final del grupo (ADR-0660: «Por definir» en «¿Qué es?»). */
  alFinal?: ReactNode;
}) {
  const { chips, fuera } = chipsDeLoHabitual(todas, habituales, valor);
  if (chips.length === 0) {
    return (
      <div data-guia={guia} className={alFinal ? "flex flex-wrap items-center gap-2" : undefined}>
        <div className={alFinal ? "min-w-[11.5rem] flex-1" : undefined}>
          <Desplegable valor={fuera} onValor={onValor} opciones={opciones} marcador={marcadorSinChips} etiquetaAccesible={etiqueta} />
        </div>
        {alFinal}
      </div>
    );
  }
  return (
    <div role="group" aria-label={etiqueta} data-guia={guia} className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={c.id} type="button" aria-pressed={valor === c.id} onClick={() => onValor(c.id)} className="pildora-cayla">
          {c.nombre}
        </button>
      ))}
      <Desplegable forma="pildora" className="inline-block min-w-[11.5rem]" valor={fuera} onValor={onValor} opciones={opciones} marcador="Otra…" etiquetaAccesible={`${etiqueta}: otra`} />
      {alFinal}
    </div>
  );
}
