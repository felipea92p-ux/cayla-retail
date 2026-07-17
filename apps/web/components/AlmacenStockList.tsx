"use client";

import { useState } from "react";
import { BajarATiendaModal } from "@/components/BajarATiendaModal";

type ItemAlmacen = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
  contenedorCodigo: string | null;
};

export function AlmacenStockList({
  items,
  sedeAlmacenId,
  sedeTiendaId,
  sedeTiendaCodigo,
}: {
  items: ItemAlmacen[];
  sedeAlmacenId: string;
  sedeTiendaId: string;
  sedeTiendaCodigo: string;
}) {
  const [abierto, setAbierto] = useState<ItemAlmacen | null>(null);

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm italic text-neutral-400">El almacén está vacío por ahora.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.varianteId} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
          <div>
            <p className="text-sm font-medium text-neutral-900">{it.referencia}</p>
            <p className="text-xs text-neutral-500">{[it.talla, it.color].filter(Boolean).join(" · ")}</p>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-300">{it.sku}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-neutral-900">{it.cantidad}</p>
              <p className="text-xs text-neutral-400">{it.contenedorCodigo ?? "sin contenedor"}</p>
            </div>
            <button
              onClick={() => setAbierto(it)}
              className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Bajar a tienda
            </button>
          </div>
        </div>
      ))}

      {abierto && (
        <BajarATiendaModal
          varianteId={abierto.varianteId}
          referencia={abierto.referencia}
          sku={abierto.sku}
          sedeAlmacenId={sedeAlmacenId}
          sedeTiendaId={sedeTiendaId}
          sedeTiendaCodigo={sedeTiendaCodigo}
          stockDisponible={abierto.cantidad}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
