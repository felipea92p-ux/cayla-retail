"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";

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
    <Modal titulo="Registrar venta" subtitulo={`Sede ${sedeCodigo}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className={campoEtiqueta}>Buscar prenda</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Referencia, SKU, talla, color…"
            className={campoTexto}
          />
          {resultados.length > 0 && (
            <div className="card-cayla divide-y divide-sand">
              {resultados.map((v) => (
                <button
                  type="button"
                  key={v.varianteId}
                  onClick={() => agregar(v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-sand"
                >
                  <span>
                    {v.referencia} <span className="text-tinta/45">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                  </span>
                  <span className="text-xs text-tinta/45">stock {v.stockAqui}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {carrito.length > 0 && (
          <div className="space-y-2">
            {carrito.map((it) => (
              <div key={it.varianteId} className="card-cayla flex items-center gap-2 p-2 text-sm">
                <div className="flex-1">
                  <p className="font-medium text-tinta">{it.referencia}</p>
                  <p className="font-mono text-[11px] text-tinta/45">{it.sku}</p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={it.cantidad}
                  onChange={(e) => actualizar(it.varianteId, "cantidad", Number(e.target.value))}
                  className="w-14 border border-sand px-1.5 py-1 text-center text-xs text-tinta outline-none focus:border-rojo"
                />
                <input
                  type="number"
                  min={0}
                  step="0.10"
                  value={it.monto}
                  onChange={(e) => actualizar(it.varianteId, "monto", Number(e.target.value))}
                  className="w-20 border border-sand px-1.5 py-1 text-right text-xs text-tinta outline-none focus:border-rojo"
                />
                <button type="button" onClick={() => quitar(it.varianteId)} className="text-xs text-rojo">
                  Quitar
                </button>
              </div>
            ))}
            <div className="flex justify-between border-t border-sand pt-2 text-sm font-semibold text-tinta">
              <span>Total</span>
              <span>S/{total.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className={campoEtiqueta}>Método de pago</label>
          <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as MetodoPago)} className={campoSelect}>
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_METODO[m]}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading || carrito.length === 0} className={botonPrimario}>
            {loading ? "Guardando…" : "Registrar venta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
