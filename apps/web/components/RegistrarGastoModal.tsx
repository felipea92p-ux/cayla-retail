"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GASTO_CATEGORIAS, type GastoCategoria } from "@cayla-retail/shared";

const IGV = 0.18;

const ETIQUETA_CATEGORIA: Record<GastoCategoria, string> = {
  alquiler: "Alquiler",
  servicios: "Servicios (luz, agua, internet)",
  planilla: "Planilla / honorarios",
  transporte: "Transporte / envíos",
  marketing: "Marketing",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};

type Props = {
  sedeId: string;
  sedeCodigo: string;
  otrasSedes: { id: string; codigo: string }[];
  onClose: () => void;
};

export function RegistrarGastoModal({ sedeId, sedeCodigo, otrasSedes, onClose }: Props) {
  const router = useRouter();
  const [sedeSeleccionada, setSedeSeleccionada] = useState(sedeId);
  const [categoria, setCategoria] = useState<GastoCategoria>(GASTO_CATEGORIAS[0]);
  const [total, setTotal] = useState(0);
  const [especificacion, setEspecificacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // El comprobante casi siempre muestra el total pagado, no el subtotal — se pide el
  // total y se calcula el resto al revés, en vez de al contrario.
  const subtotal = Math.round((total / (1 + IGV)) * 100) / 100;
  const igv = Math.round((total - subtotal) * 100) / 100;

  const todasLasSedes = [{ id: sedeId, codigo: sedeCodigo }, ...otrasSedes];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!total) {
      setError("El total debe ser mayor a 0");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_gasto", {
      p_sede_id: sedeSeleccionada,
      p_categoria: categoria,
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_especificacion: especificacion || undefined,
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
        <h2 className="text-base font-semibold text-neutral-900">Registrar gasto</h2>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Sede</label>
              <select
                value={sedeSeleccionada}
                onChange={(e) => setSedeSeleccionada(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {todasLasSedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as GastoCategoria)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {GASTO_CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CATEGORIA[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Total pagado (S/)</label>
            <input
              type="number"
              min={0}
              step="0.10"
              autoFocus
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-neutral-400">Lo que dice el comprobante — el subtotal e IGV se calculan solos.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Subtotal (S/)</label>
              <input
                type="number"
                value={subtotal}
                readOnly
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">IGV (S/)</label>
              <input
                type="number"
                value={igv}
                readOnly
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Especificación</label>
            <input
              value={especificacion}
              onChange={(e) => setEspecificacion(e.target.value)}
              placeholder="Ej. Alquiler julio, luz, etc."
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
              {loading ? "Guardando…" : "Guardar gasto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
