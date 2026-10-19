"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import type { EstadoDiseno } from "@/lib/campana-diseno";
import { unaSolaPasada } from "@/lib/una-sola-pasada";
import { adondeVuelve } from "@/lib/campana-diseno";

/**
 * «Volver al anterior» (ADR-0436, actividad 4): el diseño publicado y el anterior cambian de lugar, en un toque y con quién lo hace. Sin
 * un anterior, la portada vuelve a la de siempre (y el que estaba queda como anterior: otra vez lo regresa).
 */
export function VolverAlAnterior({ campana, estado, onClose }: { campana: { id: string; nombre: string }; estado: EstadoDiseno; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [volviendo, setVolviendo] = useState(false);
  // Diez clics en el mismo instante son una sola llamada (el estado de arriba tarda un momento en apagar el botón: `una-sola-pasada.ts`).
  const [unaVez] = useState(unaSolaPasada);
  const guia = useGuiaCampos([{ id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: "Elige quién lo hace." }]);
  const adonde = adondeVuelve(Boolean(estado.anterior));

  async function volver(cerrar: () => void) {
    if (!responsable.listo) return;
    await unaVez(async () => {
      setVolviendo(true);
      try {
        const { error } = await firmar(createClient().rpc("volver_al_diseno_anterior" as never, { p_etiqueta_id: campana.id } as never), responsable.firma());
        responsable.despues(error);
        if (error) {
          avisar.error(traducirError(error, "volver al diseño anterior"));
          return;
        }
        avisar.exito(`${campana.nombre}: volvió ${adonde}`, { detalle: "Se ve en la web en menos de 5 minutos." });
        cerrar();
        router.refresh();
      } catch {
        avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
      } finally {
        setVolviendo(false);
      }
    });
  }

  return (
    <Modal
      titulo="Volver al anterior"
      subtitulo={
        estado.publicado
          ? `La portada de ${campana.nombre} vuelve ${adonde}. El diseño de ahora queda guardado: puedes regresarlo igual.`
          : `La portada de ${campana.nombre} vuelve a mostrar el diseño que tenía.`
      }
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="mt-5 space-y-5">
          <CampoGuiado id="responsable" guia={guia}>
            <p className="campo-etiqueta">{guia.etiqueta("responsable", "Quién lo hace")}</p>
            <ComboResponsable control={responsable} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo." />
          <PieAcciones>
            <Boton peso="fantasma" onClick={cerrar} disabled={volviendo}>
              Cancelar
            </Boton>
            <Boton peso="primario" onClick={() => void volver(cerrar)} cargando={volviendo} textoCargando="Volviendo…" disabled={!responsable.listo} title={guia.frase ?? undefined}>
              Volver al anterior {/* unificar-fijo: regresa el diseño que estaba publicado (maqueta aprobada), no es la vuelta de una pantalla */}
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}
