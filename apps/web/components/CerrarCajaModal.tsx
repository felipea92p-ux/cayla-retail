"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  cajaId: string;
  sedeCodigo: string;
  onClose: () => void;
};

type Resultado = { montoEsperado: number; montoContado: number; diferencia: number };

function money(n: number) {
  return "S/" + n.toFixed(2);
}

export function CerrarCajaModal({ cajaId, sedeCodigo, onClose }: Props) {
  const router = useRouter();
  const [montoContado, setMontoContado] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .rpc("cerrar_caja", { p_caja_id: cajaId, p_monto_contado: montoContado })
      .single();

    setLoading(false);
    if (error || !data) {
      setError(error?.message ?? "No se pudo cerrar la caja");
      return;
    }
    setResultado({
      montoEsperado: Number(data.monto_esperado),
      montoContado: Number(data.monto_contado),
      diferencia: Number(data.diferencia),
    });
  }

  function onDone() {
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <h2 className="text-base font-semibold text-neutral-900">Cerrar caja</h2>
        <p className="mb-4 text-xs text-neutral-400">Sede {sedeCodigo}</p>

        {!resultado ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Efectivo contado físicamente (S/)</label>
              <input
                type="number"
                min={0}
                step="0.10"
                required
                autoFocus
                value={montoContado}
                onChange={(e) => setMontoContado(Number(e.target.value))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-neutral-400">
                Cuenta el efectivo antes de confirmar — el sistema recién te muestra cuánto debería haber después.
              </p>
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
                {loading ? "Cerrando…" : "Confirmar conteo"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border border-neutral-200 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Esperado</span>
                <span className="font-medium text-neutral-900">{money(resultado.montoEsperado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Contado</span>
                <span className="font-medium text-neutral-900">{money(resultado.montoContado)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2">
                <span className="text-neutral-500">Diferencia</span>
                <span
                  className={`font-semibold ${
                    resultado.diferencia === 0
                      ? "text-neutral-900"
                      : resultado.diferencia > 0
                        ? "text-green-600"
                        : "text-red-600"
                  }`}
                >
                  {resultado.diferencia > 0 ? "+" : ""}
                  {money(resultado.diferencia)}
                </span>
              </div>
            </div>
            <button
              onClick={onDone}
              className="w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
