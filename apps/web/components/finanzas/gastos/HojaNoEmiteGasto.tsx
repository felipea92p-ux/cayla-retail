"use client";

// «No emite comprobante» (ADR-0588): un gasto grande sin comprobante que nunca lo tendrá se marca con su motivo y deja de pedir algo (sale de la marca,
// del chip, de la bandeja y de «Te toca»). Se abre en el lugar de la hoja del gasto y vuelve a ella con la flecha. Si después llega el papel, «Llegó el
// comprobante» lo agrega igual. Las reglas, en `lib/gastos-no-emite-reglas.ts`.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Volver } from "@/components/ui/Volver";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import type { GastoFila } from "@/lib/gastos-reglas";
import {
  MAX_NOTA_NO_EMITE,
  MOTIVOS_NO_EMITE,
  RPC_MARCAR_NO_EMITE,
  camposNoEmite,
  payloadNoEmite,
  problemaNoEmite,
  type BorradorNoEmite,
} from "@/lib/gastos-no-emite-reglas";

export function HojaNoEmiteGasto({ gasto: g, onVolver, onCerrar }: { gasto: GastoFila; onVolver: () => void; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [b, setB] = useState<BorradorNoEmite>({ motivo: "", nota: "" });
  const [guardando, setGuardando] = useState(false);
  const problema = problemaNoEmite(b);
  const guia = useGuiaCampos(camposNoEmite(b, { listo: responsable.listo, motivo: responsable.motivo }));

  async function guardar() {
    if (problema) return avisar.error(problema);
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(createClient().rpc(RPC_MARCAR_NO_EMITE as never, payloadNoEmite(g.id, b) as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "marcar el gasto"));
    avisar.exito("Marcado sin comprobante", { detalle: "Ya no lo pide «Te toca». Si después llega, se lo agregas igual." });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      variante="hoja"
      titulo="No tendrá comprobante"
      subtitulo={`${g.descripcion}. Dinos por qué y deja de pedirlo en «Te toca». Si después llega, se lo agregas igual.`}
      onClose={onCerrar}
      tamano="mediana"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <CampoGuiado id="motivo" guia={guia} titulo="¿Por qué?">
          <div className="hoja-gasto-opciones" role="radiogroup" aria-label="Por qué no tiene comprobante">
            {MOTIVOS_NO_EMITE.map((m) => (
              <button
                key={m.valor}
                type="button"
                role="radio"
                aria-checked={b.motivo === m.valor}
                className="pildora-cayla"
                data-activa={b.motivo === m.valor ? "true" : undefined}
                onClick={() => setB((x) => ({ ...x, motivo: m.valor }))}
              >
                {m.texto}
              </button>
            ))}
          </div>
        </CampoGuiado>

        {b.motivo === "otro" && (
          <CampoGuiado id="nota" guia={guia} titulo="El motivo">
            <CampoTexto
              etiqueta="El motivo"
              caja
              sinPie
              value={b.nota}
              onChange={(e) => setB((x) => ({ ...x, nota: e.target.value }))}
              placeholder="Ej. el maestro trabaja sin RUC" /* sugerir-fijo: el ejemplo es del motivo «otro», que no depende de nada más elegido */
              maxLength={MAX_NOTA_NO_EMITE}
              autoFocus
            />
          </CampoGuiado>
        )}

        <CampoGuiado id="responsable" guia={guia} titulo="Responsable">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </CampoGuiado>

        <PieGuia guia={guia} listo="Todo listo para marcarlo." />
        <div className="pie-acciones pie-hoja-fijo mt-4">
          <Volver onClick={onVolver} a="Volver al gasto" />
          <Boton peso="primario" type="submit" cargando={guardando} disabled={guardando || Boolean(problema) || !responsable.listo} className="ml-auto">
            Marcar sin comprobante
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
