"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";

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
    <Modal titulo="Cerrar caja" subtitulo={`Sede ${sedeCodigo}`} onClose={onClose}>
      {!resultado ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Efectivo contado físicamente (S/)</label>
            <input
              type="number"
              min={0}
              step="0.10"
              required
              autoFocus
              value={montoContado}
              onChange={(e) => setMontoContado(Number(e.target.value))}
              className={campoTexto}
            />
            <p className="text-xs text-tinta/45">
              Cuenta el efectivo antes de confirmar — el sistema recién te muestra cuánto debería haber después.
            </p>
          </div>

          {error && <p className="text-sm text-rojo">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} className={botonPrimario}>
              {loading ? "Cerrando…" : "Confirmar conteo"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="card-cayla space-y-2 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-tinta/50">Esperado</span>
              <span className="font-medium text-tinta">{money(resultado.montoEsperado)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-tinta/50">Contado</span>
              <span className="font-medium text-tinta">{money(resultado.montoContado)}</span>
            </div>
            <div className="flex justify-between border-t border-sand pt-2">
              <span className="text-tinta/50">Diferencia</span>
              <span
                className={`font-semibold ${
                  resultado.diferencia === 0 ? "text-tinta" : resultado.diferencia > 0 ? "text-verde" : "text-rojo"
                }`}
              >
                {resultado.diferencia > 0 ? "+" : ""}
                {money(resultado.diferencia)}
              </span>
            </div>
          </div>
          <button onClick={onDone} className={`${botonPrimario} w-full`}>
            Listo
          </button>
        </div>
      )}
    </Modal>
  );
}
