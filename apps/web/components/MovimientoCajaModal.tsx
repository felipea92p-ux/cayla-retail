"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";

const MOTIVO_AJUSTE_INGRESO = "Ajuste de caja (sobrante)";
const MOTIVO_AJUSTE_EGRESO = "Ajuste de caja (faltante)";

// "Retiro de efectivo" y "Depósito bancario" son un egreso con motivo
// predefinido — mismo caso que registrar_movimiento_caja() en SQL: un tipo,
// no una tabla. "Ajuste de caja" además marca es_ajuste=true, que la RPC
// exige que solo un líder pueda registrar (rechaza si no lo es).
const MOTIVOS_EGRESO_RAPIDO = ["Retiro de efectivo", "Depósito bancario", MOTIVO_AJUSTE_EGRESO, "Compra de insumos", "Otro"];
const MOTIVOS_INGRESO_RAPIDO = [MOTIVO_AJUSTE_INGRESO, "Otro"];

export function MovimientoCajaModal({ cajaId, onClose }: { cajaId: string; onClose: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const [monto, setMonto] = useState("");
  const [motivoRapido, setMotivoRapido] = useState(MOTIVOS_EGRESO_RAPIDO[0]);
  const [motivoLibre, setMotivoLibre] = useState("");
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);

  const motivosRapidos = tipo === "egreso" ? MOTIVOS_EGRESO_RAPIDO : MOTIVOS_INGRESO_RAPIDO;
  const motivo = motivoRapido === "Otro" ? motivoLibre : motivoRapido;
  const esAjuste = motivoRapido === MOTIVO_AJUSTE_INGRESO || motivoRapido === MOTIVO_AJUSTE_EGRESO;

  function cambiarTipo(t: "ingreso" | "egreso") {
    setTipo(t);
    setMotivoRapido(t === "egreso" ? MOTIVOS_EGRESO_RAPIDO[0] : MOTIVOS_INGRESO_RAPIDO[0]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) {
      avisar.error("Escribe el motivo.", { enfocar: "mov-motivo-libre" });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_movimiento_caja", {
      p_caja_id: cajaId,
      p_tipo: tipo,
      p_monto: Number(monto) || 0,
      p_motivo: motivo,
      p_nota: nota.trim() || undefined,
      p_es_ajuste: esAjuste,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el movimiento de caja"));
      return;
    }
    avisar.exito(`${tipo === "ingreso" ? "Ingreso" : "Egreso"} de caja registrado`, { detalle: `S/ ${(Number(monto) || 0).toFixed(2)} · ${motivo}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Ingreso o egreso de caja" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <span className={campoEtiqueta}>Tipo</span>
          <div className="flex gap-2">
            {(["ingreso", "egreso"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => cambiarTipo(t)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize transition-colors ${
                  tipo === t ? "border-rojo bg-rojo/8 text-rojo" : "border-tinta/20 text-tinta/70"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mov-monto">
            Monto
          </label>
          <input
            id="mov-monto"
            type="number"
            min={0.01}
            step="0.10"
            required
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={campoTexto}
          />
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mov-motivo-rapido">
            Motivo
          </label>
          <select
            id="mov-motivo-rapido"
            value={motivoRapido}
            onChange={(e) => setMotivoRapido(e.target.value)}
            className={campoSelect}
          >
            {motivosRapidos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {motivoRapido === "Otro" && (
            <input
              id="mov-motivo-libre"
              placeholder="Describe el motivo"
              value={motivoLibre}
              onChange={(e) => setMotivoLibre(e.target.value)}
              className={campoTexto}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mov-nota">
            Referencia (opcional)
          </label>
          <input
            id="mov-nota"
            placeholder="N° de operación, voucher, u otra nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className={campoTexto}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className={botonPrimario}>
            {loading ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
