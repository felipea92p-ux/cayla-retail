"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

export function CerrarCajaModalV2({
  cajaId,
  esperadoEnCajon,
  onClose,
}: {
  cajaId: string;
  esperadoEnCajon: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [montoReal, setMontoReal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ diferencia: number } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .rpc("cerrar_caja", { p_caja_id: cajaId, p_monto_real: Number(montoReal) || 0 })
      .single();
    setLoading(false);
    if (error) {
      setError(traducirError(error, "cerrar la caja"));
      return;
    }
    setResultado({ diferencia: Number(data.diferencia) });
    router.refresh();
  }

  if (resultado) {
    const cuadra = Math.abs(resultado.diferencia) < 0.01;
    return (
      <Modal titulo="Caja cerrada" onClose={onClose}>
        <div className="space-y-4 text-center">
          <p className={`label-cayla text-[11px] ${cuadra ? "text-verde-profundo" : "text-rojo"}`}>
            {cuadra ? "Cuadró" : "No cuadró"}
          </p>
          <p className={`font-display text-3xl ${cuadra ? "text-tinta" : "text-rojo"}`}>
            {resultado.diferencia >= 0 ? "+" : ""}
            {money(resultado.diferencia)}
          </p>
          <p className="text-sm text-tinta/70">
            {cuadra
              ? "El efectivo contado coincide con lo esperado."
              : resultado.diferencia > 0
                ? "Hay más efectivo del que el sistema esperaba."
                : "Falta efectivo respecto a lo que el sistema esperaba."}
          </p>
          <button type="button" autoFocus onClick={onClose} className={`${botonPrimario} w-full`}>
            Listo
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Cerrar caja" subtitulo={`El sistema espera ${money(esperadoEnCajon)} en efectivo`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="cierre-monto">
            Cuenta el efectivo físico y escribe el total
          </label>
          <input
            id="cierre-monto"
            type="number"
            min={0}
            step="0.10"
            required
            autoFocus
            value={montoReal}
            onChange={(e) => setMontoReal(e.target.value)}
            className={campoTexto}
          />
        </div>
        {error && <p className="text-sm text-rojo">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className={botonPrimario}>
            {loading ? "Cerrando…" : "Cerrar caja"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
