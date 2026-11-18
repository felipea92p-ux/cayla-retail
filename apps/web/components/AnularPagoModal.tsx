"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { AvisoNoSeDeshace } from "@/components/ui/Aviso";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { MAX_MOTIVO, RPC_ANULAR_PAGO, camposDelMotivo } from "@/lib/anular-documento-reglas";
import { ETIQUETA_METODO_PAGO, fechaCorta, soles } from "@/lib/compras-reglas";
import { traducirError } from "@/lib/error-escritura";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Anular pago» (tarea 21 de «Las 36»; Felipe 2026-11-06: con motivo y con su mes abierto). El pago sale de la factura y queda en el archivo, entero y con su motivo; la factura vuelve
// a deberlo. No devuelve plata a ningún banco: corrige el registro. La base lo vuelve a exigir todo (`anular_pago_compra`).
export function AnularPagoModal({ pago, onClose }: { pago: { id: string; fecha: string; metodo: string; monto: number }; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const campos = camposDelMotivo(motivo, "se anula el pago");
  const guia = useGuiaCampos(campos);

  async function anular() {
    if (!sePuedeConfirmar(campos)) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(createClient().rpc(RPC_ANULAR_PAGO as never, { p_pago_id: pago.id, p_motivo: motivo.trim() } as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "anular el pago", { confirmarAntesDeRepetir: true }));
    avisar.exito("Pago anulado", { detalle: `La factura vuelve a deber ${soles(pago.monto)}.` });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="Anular pago" subtitulo={`${ETIQUETA_METODO_PAGO[pago.metodo] ?? pago.metodo} · ${fechaCorta(pago.fecha)} · ${soles(pago.monto)}`} onClose={onClose}>
      {(cerrar) => (
        <form
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void anular();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-tinta/75">
            El pago sale de la factura y queda guardado con su motivo; la factura vuelve a deberlo. No devuelve plata al banco: si de verdad salió, regístralo bien
            después.
          </p>
          <CampoGuiado id="motivo" guia={guia}>
            <CampoTexto
              etiqueta="Motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MAX_MOTIVO}
              placeholder="Ej. el monto era otro" // sugerir-fijo: el motivo de anular un pago no depende de nada elegido antes
            />
          </CampoGuiado>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          <PieGuia guia={guia} listo="Todo listo para anular." />
          <AvisoNoSeDeshace />
          <div className="pie-acciones pt-1">
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" textoCargando="Anulando…" cargando={guardando} confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Anular pago
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
