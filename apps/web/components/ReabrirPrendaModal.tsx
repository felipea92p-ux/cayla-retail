"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { MOTIVOS_REAPERTURA, type MotivoReapertura } from "@/lib/cola-arranque-reglas";
import { sePuedeConfirmar, type CampoDeGuia } from "@/lib/guia-campos";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";

/**
 * «Reabrir una venta cerrada sin prenda» (ADR-0334, Felipe 2026-10-04): la salida cuando una cliente devuelve o quiere cambiar una
 * prenda cuya venta se cerró sin identificarla. La fila vuelve a «Pendiente» y se regulariza como cualquier otra. Solo un líder, desde su
 * propia cuenta (la base lo exige con `fn_es_lider`: una terminal de caja no puede, ni con un líder identificado en ella).
 * Sin combo «Responsable»: firma la cuenta (`cola_arranque_reabrir`). Un solo control obligatorio: el motivo.
 */
export function ReabrirPrendaModal({ fila, onClose }: { fila: FilaPorRegularizar; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<MotivoReapertura | null>(null);
  const [guardando, setGuardando] = useState(false);

  const campos: CampoDeGuia[] = [{ id: "motivo", nombre: "Motivo", requerido: true, hecho: motivo !== null, pendiente: "Elige por qué se reabre la venta." }];
  const guia = useGuiaCampos(campos);

  async function reabrir() {
    if (!motivo || !sePuedeConfirmar(campos)) return;
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("reabrir_prenda_cerrada", { p_id: fila.id, p_motivo: motivo }),
      firmaOmitida("cola_arranque_reabrir"),
    );
    setGuardando(false);
    if (error) {
      avisar.error(traducirError(error, "reabrir la venta"));
      return;
    }
    avisar.exito("Venta reabierta", { detalle: `«${fila.descripcion}» vuelve a Pendientes: regularízala con su prenda real para poder devolverla o cambiarla.` });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="Reabrir una venta cerrada" subtitulo={`${fila.descripcion} · ${[fila.categoria, fila.talla, fila.color].join(" · ")}`} onClose={onClose}>
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void reabrir();
          }}
          className="space-y-5"
        >
          <CampoGuiado id="motivo" guia={guia} titulo="¿Por qué la reabres?">
            <div role="radiogroup" aria-label="Motivo de la reapertura" className="grid gap-2">
              {MOTIVOS_REAPERTURA.map((m) => {
                const elegido = motivo === m.clave;
                return (
                  <button
                    key={m.clave}
                    type="button"
                    role="radio"
                    aria-checked={elegido}
                    onClick={() => setMotivo(m.clave)}
                    className={`rounded-md border px-3.5 py-2.5 text-left transition-colors ease-cayla ${
                      elegido ? "border-tinta bg-hueso" : "border-tinta/15 bg-papel hover:border-tinta/40"
                    }`}
                  >
                    <span className="block text-sm text-tinta">{m.titulo}</span>
                    <span className="mt-0.5 block text-xs text-taupe">{m.ayuda}</span>
                  </button>
                );
              })}
            </div>
          </CampoGuiado>

          <p className="rounded-md bg-hueso px-3.5 py-2.5 text-[13px] text-tinta/80">
            <strong className="font-semibold text-tinta">Ojo con el stock.</strong> Si ya hiciste un conteo que corrigió el stock de esa prenda,
            regularizarla «como ya registrada» la descontaría otra vez. Confírmalo con almacén antes de regularizar.
          </p>

          <PieGuia guia={guia} listo="Todo listo para reabrir." />
          <div className="flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Reabrir
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
