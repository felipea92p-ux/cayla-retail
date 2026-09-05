"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";

type Props = {
  sedeId: string;
  sedeCodigo: string;
  onClose: () => void;
};

export function AbrirCajaModal({ sedeId, sedeCodigo, onClose }: Props) {
  const router = useRouter();
  const [montoApertura, setMontoApertura] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("abrir_caja", {
      p_sede_id: sedeId,
      p_monto_apertura: montoApertura,
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
    <Modal titulo="Abrir caja" subtitulo={`Sede ${sedeCodigo}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className={campoEtiqueta}>Monto de apertura (S/)</label>
          <input
            type="number"
            min={0}
            step="0.10"
            required
            value={montoApertura}
            onChange={(e) => setMontoApertura(Number(e.target.value))}
            className={campoTexto}
          />
          <p className="text-xs text-tinta/45">El efectivo con el que arranca la caja hoy, para poder comparar al cierre.</p>
        </div>

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className={botonPrimario}>
            {loading ? "Abriendo…" : "Abrir caja"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
