"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoTexto, botonPrimario } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

export function AbrirCajaFormV2({ ubicacionId, ubicacionEtiqueta }: { ubicacionId: string; ubicacionEtiqueta: string }) {
  const router = useRouter();
  const [monto, setMonto] = useState("");
  const [loading, setLoading] = useState(false);
  // Abrir caja es una acción que guarda en la tienda: pide Responsable (ADR-0161).
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("abrir_caja", {
        p_ubicacion_id: ubicacionId,
        p_monto_apertura: Number(monto) || 0,
      }),
      responsable.firma(),
    );
    setLoading(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "abrir la caja"));
      return;
    }
    avisar.exito("Caja abierta", { detalle: `Con S/ ${(Number(monto) || 0).toFixed(2)} de apertura.` });
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
      <ComboResponsable control={responsable} deshabilitado={loading} />
      <button type="submit" disabled={loading || !responsable.listo} title={responsable.motivo ?? undefined} className={botonPrimario}>
        {loading ? "Abriendo…" : "Abrir caja"}
      </button>
    </form>
  );
}
