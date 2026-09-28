"use client";

import { MuestraTejido } from "@/components/MuestraTejido";
import type { ValorVocabulario } from "@/lib/catalogo-v2";

// La fila «Tejido» del paso 3 del alta: una tarjeta con muestra por cada tejido que la categoría ofrece. Tocar la elegida la suelta.

export function TarjetaTejido({ tejido, elegido, onClick }: { tejido: ValorVocabulario; elegido: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={elegido}
      className={`flex w-[96px] flex-col gap-1.5 rounded-md border p-1.5 text-left text-[12.5px] transition-colors ${
        elegido ? "border-tinta bg-tinta/[0.07] text-tinta" : "border-tinta/15 text-tinta/75 hover:border-tinta/40"
      }`}
    >
      <MuestraTejido nombre={tejido.texto} />
      <span className="px-0.5">
        {elegido && <span aria-hidden>✓ </span>}
        {tejido.texto}
      </span>
    </button>
  );
}

export function ElegirTejido({
  deLaCategoria,
  tejidoId,
  onElegir,
}: {
  /** Los tejidos que la categoría ofrece (`categoria_tejidos`): la base solo acepta uno de estos al crear el producto. */
  deLaCategoria: ValorVocabulario[];
  tejidoId: string;
  onElegir: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {deLaCategoria.map((t) => (
        <TarjetaTejido key={t.id} tejido={t} elegido={tejidoId === t.id} onClick={() => onElegir(tejidoId === t.id ? "" : t.id)} />
      ))}
    </div>
  );
}
