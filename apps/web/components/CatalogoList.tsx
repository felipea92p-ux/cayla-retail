"use client";

import { useMemo, useState } from "react";
import type { VarianteConStock } from "@/lib/catalogo";
import { MovimientoModal } from "@/components/MovimientoModal";

type Sede = { id: string; codigo: string };

export function CatalogoList({
  variantes,
  sedeActual,
  todasLasSedes,
}: {
  variantes: VarianteConStock[];
  sedeActual: Sede;
  todasLasSedes: Sede[];
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<VarianteConStock | null>(null);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return variantes;
    return variantes.filter((v) =>
      `${v.sku} ${v.referencia} ${v.categoria ?? ""} ${v.talla ?? ""} ${v.color ?? ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [variantes, q]);

  const otrasSedes = todasLasSedes.filter((s) => s.id !== sedeActual.id);

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar prenda, color, categoría, SKU…"
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm"
      />

      {filtradas.length === 0 && (
        <p className="py-8 text-center text-sm italic text-neutral-400">
          {variantes.length === 0 ? "Aún no hay prendas cargadas." : "Sin resultados."}
        </p>
      )}

      <div className="space-y-2">
        {filtradas.map((v) => {
          const stockAqui = v.stockPorSede[sedeActual.codigo] ?? 0;
          const bajo = v.stockTotal <= v.stockMinimo;
          return (
            <div key={v.varianteId} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">{v.referencia}</span>
                    {bajo && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                        Bajo stock
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {[v.talla, v.color, v.categoria].filter(Boolean).join(" · ")}
                  </p>
                  {v.precio != null && (
                    <p className="mt-0.5 text-xs text-neutral-400">
                      Costo S/{v.costo?.toFixed(2)} · Precio S/{v.precio.toFixed(2)}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[11px] text-neutral-300">{v.sku}</p>
                </div>
                <button
                  onClick={() => setAbierto(v)}
                  className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                >
                  Mover
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {todasLasSedes.map((s) => (
                  <span
                    key={s.id}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      s.id === sedeActual.id
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {s.codigo} <b>{v.stockPorSede[s.codigo] ?? 0}</b>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {abierto && (
        <MovimientoModal
          varianteId={abierto.varianteId}
          referencia={abierto.referencia}
          sku={abierto.sku}
          sedeId={sedeActual.id}
          sedeCodigo={sedeActual.codigo}
          otrasSedes={otrasSedes}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
