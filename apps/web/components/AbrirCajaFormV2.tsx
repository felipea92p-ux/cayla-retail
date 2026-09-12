"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { campoEtiqueta, campoTexto, botonPrimario } from "@/components/ui/Modal";

export function AbrirCajaFormV2({ ubicacionId, ubicacionEtiqueta }: { ubicacionId: string; ubicacionEtiqueta: string }) {
  const router = useRouter();
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("abrir_caja", {
      p_ubicacion_id: ubicacionId,
      p_monto_apertura: Number(monto) || 0,
    });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "abrir la caja"));
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card-cayla space-y-4 p-5">
      <p className="text-sm text-tinta/70">{ubicacionEtiqueta} no tiene una caja abierta ahora mismo.</p>
      <div className="space-y-1.5">
        <label className={campoEtiqueta} htmlFor="apertura-monto">
          Monto con el que abres (efectivo en el cajón)
        </label>
        <input
          id="apertura-monto"
          type="number"
          min={0}
          step="0.10"
          required
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className={campoTexto}
        />
      </div>
      {error && <p className="text-sm text-rojo">{error}</p>}
      <button type="submit" disabled={loading} className={botonPrimario}>
        {loading ? "Abriendo…" : "Abrir caja"}
      </button>
    </form>
  );
}
