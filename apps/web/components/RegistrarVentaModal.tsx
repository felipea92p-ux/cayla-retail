"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";

type VarianteBusqueda = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number | null;
  stockAqui: number;
};

type ItemCarrito = {
  varianteId: string;
  referencia: string;
  sku: string;
  cantidad: number;
  monto: number; // precio unitario
};

type Props = {
  sedeCodigo: string;
  cajaId: string;
  variantes: VarianteBusqueda[];
  onClose: () => void;
};

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  pos: "POS",
  yape: "Yape",
  transferencia: "Transferencia",
};

export function RegistrarVentaModal({ sedeCodigo, cajaId, variantes, onClose }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resultados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return variantes
      .filter((v) => `${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""}`.toLowerCase().includes(term))
      .slice(0, 6);
  }, [variantes, q]);

  function agregar(v: VarianteBusqueda) {
    setCarrito((actual) => {
      const existente = actual.find((it) => it.varianteId === v.varianteId);
      if (existente) {
        return actual.map((it) => (it.varianteId === v.varianteId ? { ...it, cantidad: it.cantidad + 1 } : it));
      }
      return [...actual, { varianteId: v.varianteId, referencia: v.referencia, sku: v.sku, cantidad: 1, monto: v.precio ?? 0 }];
    });
    setQ("");
  }

  function quitar(varianteId: string) {
    setCarrito((actual) => actual.filter((it) => it.varianteId !== varianteId));
  }

  function actualizar(varianteId: string, campo: "cantidad" | "monto", valor: number) {
    setCarrito((actual) => actual.map((it) => (it.varianteId === varianteId ? { ...it, [campo]: valor } : it)));
  }

  const total = carrito.reduce((acc, it) => acc + it.cantidad * it.monto, 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (carrito.length === 0) {
      setError("El carrito está vacío");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_venta", {
      p_caja_id: cajaId,
      p_metodo_pago: metodoPago,
      p_items: carrito.map((it) => ({ variante_id: it.varianteId, cantidad: it.cantidad, monto: it.monto })),
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
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <h2 className="text-base font-semibold text-neutral-900">Registrar venta</h2>
        <p className="mb-4 text-xs text-neutral-400">Sede {sedeCodigo}</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Buscar prenda</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Referencia, SKU, talla, color…"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            {resultados.length > 0 && (
              <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {resultados.map((v) => (
                  <button
                    type="button"
                    key={v.varianteId}
                    onClick={() => agregar(v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    <span>
                      {v.referencia}{" "}
                      <span className="text-neutral-400">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                    </span>
                    <span className="text-xs text-neutral-400">stock {v.stockAqui}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {carrito.length > 0 && (
            <div className="space-y-2">
              {carrito.map((it) => (
                <div key={it.varianteId} className="flex items-center gap-2 rounded-lg border border-neutral-200 p-2 text-sm">
                  <div className="flex-1">
                    <p className="font-medium text-neutral-900">{it.referencia}</p>
                    <p className="font-mono text-[11px] text-neutral-400">{it.sku}</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={it.cantidad}
                    onChange={(e) => actualizar(it.varianteId, "cantidad", Number(e.target.value))}
                    className="w-14 rounded border border-neutral-300 px-1.5 py-1 text-center text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.10"
                    value={it.monto}
                    onChange={(e) => actualizar(it.varianteId, "monto", Number(e.target.value))}
                    className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-right text-xs"
                  />
                  <button type="button" onClick={() => quitar(it.varianteId)} className="text-xs text-red-500">
                    Quitar
                  </button>
                </div>
              ))}
              <div className="flex justify-between border-t border-neutral-200 pt-2 text-sm font-semibold text-neutral-900">
                <span>Total</span>
                <span>S/{total.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Método de pago</label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO[m]}
                </option>
              ))}
            </select>
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
              disabled={loading || carrito.length === 0}
              className="flex-1 rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Registrar venta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
