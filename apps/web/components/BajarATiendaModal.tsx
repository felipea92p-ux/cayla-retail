"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  varianteId: string;
  referencia: string;
  sku: string;
  sedeAlmacenId: string;
  sedeTiendaId: string;
  sedeTiendaCodigo: string;
  stockDisponible: number;
  onClose: () => void;
};

export function BajarATiendaModal({
  varianteId,
  referencia,
  sku,
  sedeAlmacenId,
  sedeTiendaId,
  sedeTiendaCodigo,
  stockDisponible,
  onClose,
}: Props) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState(Math.min(1, stockDisponible));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_movimiento", {
      p_variante_id: varianteId,
      p_sede_id: sedeAlmacenId,
      p_tipo: "traslado",
      p_cantidad: cantidad,
      p_sede_destino_id: sedeTiendaId,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <h2 className="text-base font-semibold text-neutral-900">Bajar a tienda</h2>
        <p className="mb-4 text-xs text-neutral-400">
          {referencia} · {sku} → {sedeTiendaCodigo}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Cantidad (hay {stockDisponible} en almacén)</label>
            <input
              type="number"
              min={1}
              max={stockDisponible}
              required
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {loading ? "Bajando…" : "Bajar a tienda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
