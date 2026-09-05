"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";

type Props = {
  varianteId: string;
  referencia: string;
  sku: string;
  sedeId: string;
  sedeCodigo: string;
  stockDisponible: number;
  onClose: () => void;
};

export function BajarATiendaModal({
  varianteId,
  referencia,
  sku,
  sedeId,
  sedeCodigo,
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
    const { error } = await supabase.rpc("bajar_a_piso", {
      p_sede_id: sedeId,
      p_variante_id: varianteId,
      p_cantidad: cantidad,
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
    <Modal titulo="Bajar a tienda" subtitulo={`${referencia} · ${sku} → piso de ${sedeCodigo}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className={campoEtiqueta}>Cantidad (hay {stockDisponible} en almacén)</label>
          <input
            type="number"
            min={1}
            max={stockDisponible}
            required
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className={campoTexto}
          />
        </div>

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className={botonPrimario}>
            {loading ? "Bajando…" : "Bajar a tienda"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
