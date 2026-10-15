"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal, botonCancelar } from "@/components/ui/Modal";
import { traducirError } from "@/lib/error-escritura";
import { RPC_REVERTIR_PRODUCCION, textoQuePasaAlRevertir, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Revertir el cierre» (ADR-0133, F2; en la página de la orden desde ADR-0400, actividad 6): una orden que pasó al stock vuelve a estar en proceso. Las prendas salen del stock con un movimiento
// de reversión (la entrada original no se borra). Un solo dato: quién lo revierte.

export function RevertirLaOrdenModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const { orden } = datos;
  const responsable = useResponsable({ ubicacionId: orden.ubicacionId, etiqueta: orden.ubicacionNombre });
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      resultado = await firmar(createClient().rpc(RPC_REVERTIR_PRODUCCION as never, { p_produccion_id: orden.id } as never), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "revertir el cierre", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`Orden de ${orden.producto.referencia} vuelve a estar en proceso`);
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="¿Revertimos el cierre?" subtitulo={`${orden.numeroTexto} · ${orden.producto.referencia} · ${orden.cantidadBuenas ?? 0} buenas`} variante="hoja" conCerrar ancho="max-w-lg" onClose={onClose}>
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        <p className="text-sm text-tinta/75">{textoQuePasaAlRevertir(orden)}</p>
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <div className="pie-hoja-fijo">
          <div className="flex gap-2 border-t border-sand pt-3">
            <button type="button" onClick={onClose} className={botonCancelar}>
              Volver
            </button>
            <Boton type="submit" peso="peligro" cargando={cargando} disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
              {cargando ? "Revirtiendo…" : "Revertir cierre"}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
