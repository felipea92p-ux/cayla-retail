"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { claveResponsableConteo } from "@/lib/responsable-conteo";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";

/* ====================================================================
   CancelarConteoModal · «¿Cancelar el conteo 12?» (Inventario ▸ Conteo, rediseño 2026-09-29)

   Cancelar un conteo no mueve ninguna existencia: solo tira lo contado. Aun así se pregunta, con la consecuencia dicha
   ANTES de apretar, porque lo contado son horas de trabajo de pie frente al rack y no se recupera. Es un modal (no la
   confirmación en línea de antes) porque no toca la lista de abajo: se abre, se decide y se va.

   Lo abren dos pantallas — el inicio, desde la tarjeta «Conteo N en curso», y Contar, desde la cabecera— y las dos
   necesitan lo mismo: quién firma la cancelación (el combo «Responsable», ADR-0161: `anular_conteo` firma con
   `fn_actor_persona_id(true)`), y a dónde va la persona después. Por eso el modal lleva su PROPIO `useResponsable` y su
   propia navegación: quien lo abre solo le dice cuál conteo es.

   Al terminar lleva al inicio del Conteo y lo relee (`router.refresh`): la tarjeta «en curso» ya no debe estar. El
   aviso de éxito («Conteo cancelado») sale del sistema DESPUÉS del loader global (ADR-0149): nadie lo coordina aquí.

   Los errores se dicen en el mismo modal, con la frase de `traducirError`: un rechazo por el responsable (asistencia)
   o por un conteo que otro ya cerró se lee y se corrige sin salir de la hoja.
   ==================================================================== */
export function CancelarConteoModal({ conteoId, numero, onClose }: { conteoId: string; numero: number; onClose: () => void }) {
  const router = useRouter();
  // El responsable se eligió al abrir el conteo: cancelar lo reutiliza y solo pregunta si ya no hay uno vigente.
  const responsable = useResponsable(undefined, { recordarEn: claveResponsableConteo(conteoId) });
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelar(cerrar: () => void) {
    if (!responsable.listo) {
      setError(responsable.motivo);
      return;
    }
    setCancelando(true);
    setError(null);
    const { error: fallo } = await firmar(createClient().rpc("anular_conteo", { p_conteo_id: conteoId }), responsable.firma());
    setCancelando(false);
    responsable.despues(fallo);
    if (fallo) {
      setError(traducirError(fallo, "cancelar el conteo"));
      return;
    }
    avisar.exito("Conteo cancelado", { detalle: "Las existencias no cambiaron." });
    router.push("/inventario/conteo");
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo={`¿Cancelar el conteo ${numero}?`} subtitulo="Se pierde lo contado. Las existencias no cambian." ancho="max-w-md" bloqueado={cancelando} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          {!responsable.listo && <ComboResponsable control={responsable} deshabilitado={cancelando} />}
          {error && (
            <Aviso tono="error">{error}</Aviso>
          )}
          {/* En el celular la salida segura («Seguir contando») queda arriba, la más a mano: cancelar tira lo contado y no debe ser el botón más fácil de tocar. */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <button type="button" onClick={cerrar} disabled={cancelando} className="btn-cayla btn-secundario h-11">
              Seguir contando
            </button>
            <button
              type="button"
              onClick={() => void cancelar(cerrar)}
              disabled={cancelando || !responsable.listo}
              title={responsable.motivo ?? undefined}
              className="btn-cayla btn-peligro h-11"
            >
              {cancelando ? "Cancelando…" : "Sí, cancelar conteo"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
