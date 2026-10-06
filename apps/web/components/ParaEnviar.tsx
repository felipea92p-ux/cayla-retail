"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, botonCancelar, botonPrimario, campoTexto } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { MAX_MOTIVO_YA_NO, etiquetaParaEnviar, motivoYaNoValido, type PrendaParaEnviar } from "@/lib/para-enviar-reglas";

// «Para enviar» en Traslados (ADR-0328 act. 17; Felipe: lo colgado se manda en DOS pasos). Lo que la sede subió al almacén
// para mandarlo a otra queda, por sede de destino, hasta que sale en un traslado —la base lo descuenta sola, salga como salga—
// o alguien dice «Ya no la envío» con su motivo. Desde ADR-0355 se ve como un pase de la billetera
// (`components/traslados-pases/PasePedido.tsx`); aquí queda la ventana «Ya no la envío».

type Ubicacion = { ubicacionId: string; etiqueta: string };

/** «Ya no la envío»: sale de la lista con su porqué (`cancelar_para_enviar`). La prenda sigue en el almacén. */
export function YaNoLaEnvioModal({ prenda, ubicacion, onClose }: { prenda: PrendaParaEnviar; ubicacion: Ubicacion; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const responsable = useResponsable(ubicacion);
  // La guía mira lo mismo que apaga el botón: el porqué (la base lo exige) y quién lo hace.
  const guia = useGuiaCampos([
    { id: "motivo", nombre: "Por qué", requerido: true, hecho: motivoYaNoValido(motivo), pendiente: "Escribe por qué ya no la envías." },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo hace." },
  ]);

  async function quitar(cerrar: () => void) {
    if (!motivoYaNoValido(motivo) || !responsable.listo) return;
    setEnviando(true);
    const { error } = await firmar(createClient().rpc("cancelar_para_enviar", { p_id: prenda.id, p_motivo: motivo.trim() }), responsable.firma());
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "sacarla de la lista"));
    avisar.exito("Ya no está para enviar", { detalle: `${etiquetaParaEnviar(prenda)} sigue en tu almacén.` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="¿Ya no la envías?" subtitulo={`${etiquetaParaEnviar(prenda)} · a ${prenda.destino}`} onClose={onClose} ancho="max-w-md" bloqueado={enviando}>
      {(cerrar) => (
        <div className="space-y-4">
          <CampoGuiado id="motivo" guia={guia} titulo="Por qué ya no la envías">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MAX_MOTIVO_YA_NO}
              aria-label="Por qué ya no la envías"
              placeholder="Se vendió aquí" /* sugerir-fijo: el porqué de sacar una prenda de la lista no depende de nada elegido antes en esta ventana */
              className={campoTexto}
              disabled={enviando}
            />
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={enviando}>
              Mejor no
            </button>
            <button
              type="button"
              disabled={enviando || !guia.puedeConfirmar}
              title={responsable.motivo ?? guia.frase ?? undefined}
              onClick={() => quitar(cerrar)}
              className={`${botonPrimario} ${guia.claseConfirmar}`}
            >
              {enviando ? "Guardando…" : "Ya no la envío"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
