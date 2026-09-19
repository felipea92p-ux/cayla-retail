"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { MOTIVOS_NO_GASTO } from "@/lib/gastos-reglas";
import type { EgresoSinClasificar, GastoFila } from "@/lib/gastos";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * «Este egreso de caja no es un gasto» (depósito al banco, retiro, ajuste de conteo). Se marca
 * con un motivo, y se puede REVERTIR: un clic irreversible que esconde plata sería un mal diseño.
 */
export function NoEsGastoModal({ egreso, onClose }: { egreso: EgresoSinClasificar; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState(egreso.esAjuste ? "Ajuste de conteo de caja" : /dep[oó]sito/i.test(egreso.motivo) ? "Depósito al banco" : "");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) {
      avisar.error("Di por qué no es un gasto (ej. depósito al banco).", { enfocar: "nogasto-motivo" });
      return;
    }
    setGuardando(true);
    const { error } = await createClient().rpc("marcar_egreso_no_gasto", { p_caja_movimiento_id: egreso.id, p_motivo: motivo.trim() });
    setGuardando(false);
    if (error) {
      avisar.error(traducirError(error, "marcar el egreso"));
      return;
    }
    avisar.exito("Marcado como «no es gasto»", { detalle: `${soles(egreso.monto)} · ${motivo.trim()}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Este egreso no es un gasto" subtitulo={`${egreso.ubicacionNombre} · ${soles(egreso.monto)} · «${egreso.motivo}»`} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={guardar} className="space-y-4">
          <p className="text-xs text-tinta/70">La plata salió de la caja, pero no se gastó: pasó a otro lado (al banco, al dueño) o es una corrección de conteo. No entrará en ninguna tarjeta de gastos.</p>
          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="nogasto-motivo">
              ¿Qué fue?
            </label>
            <input id="nogasto-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campoTexto} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {MOTIVOS_NO_GASTO.map((m) => (
                <button key={m} type="button" onClick={() => setMotivo(m)} className="rounded-full border border-tinta/20 px-2.5 py-0.5 text-[11px] text-tinta/70 hover:border-rojo hover:text-rojo">
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className={botonPrimario}>
              {guardando ? "Guardando…" : "Marcar"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Anular un gasto. No toca la caja: si el gasto había creado su egreso, la plata sí salió. */
export function AnularGastoModal({ gasto, onClose }: { gasto: GastoFila; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) {
      avisar.error("Escribe por qué se anula el gasto.", { enfocar: "anular-motivo" });
      return;
    }
    setGuardando(true);
    const { error } = await createClient().rpc("anular_gasto", { p_gasto_id: gasto.id, p_motivo: motivo.trim() });
    setGuardando(false);
    if (error) {
      avisar.error(traducirError(error, "anular el gasto"));
      return;
    }
    avisar.exito("Gasto anulado", { detalle: `${soles(gasto.montoTotal)} · ${gasto.descripcion}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Anular gasto" subtitulo={`${gasto.descripcion} · ${soles(gasto.montoTotal)}`} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={guardar} className="space-y-4">
          <p className="text-xs text-tinta/70">
            El gasto deja de sumar en las tarjetas, pero queda en la lista con su motivo. Un gasto no se corrige ni se borra: se anula y se registra uno nuevo.
            {gasto.conEgresoDeCaja && " Como se pagó en efectivo desde una caja, el egreso de la caja NO se deshace (la plata sí salió): volverá a la lista «Egresos sin clasificar»."}
          </p>
          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="anular-motivo">
              Motivo
            </label>
            <input id="anular-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Monto mal tipeado" className={campoTexto} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className={botonPrimario}>
              {guardando ? "Anulando…" : "Anular gasto"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
