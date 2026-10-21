"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { traducirError } from "@/lib/error-escritura";
import { RPC_ANULAR_PRODUCCION, insumosPorDevolver, prendasAfuera, textoAnulasteLaOrden, textoPrendasAfuera, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Anular» la orden (ADR-0133, F2; rehecha en la página de la orden en ADR-0400, actividad 6): una orden que se abrió por error o que se canceló. No toca el stock de prendas y SIGUE VISIBLE en
// Terminadas, con su nota, para que no se pierda el registro. Lo que ya se usó de tela y avíos vuelve al estante, cada uno a su lote y a su costo. Con prendas todavía en un servicio no se anula:
// primero su Vuelta, o los faltantes con su motivo (`anular_con_prendas_afuera`). Un solo dato obligatorio —quién la anula—; el motivo es opcional pero queda escrito.

export function AnularLaOrdenModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const { orden, fases, insumos } = datos;
  const responsable = useResponsable({ ubicacionId: orden.ubicacionId, etiqueta: orden.ubicacionNombre });
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const afuera = prendasAfuera(fases);
  const devuelve = insumosPorDevolver(insumos);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || afuera) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      resultado = await firmar(createClient().rpc(RPC_ANULAR_PRODUCCION as never, { p_produccion_id: orden.id, p_motivo: motivo.trim() === "" ? null : motivo.trim() } as never), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "anular la orden", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(textoAnulasteLaOrden(orden.producto.referencia));
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="¿Anulamos esta orden?" subtitulo={`${orden.numeroTexto} · ${orden.producto.referencia} · ${orden.cantidadPlan} ${orden.cantidadPlan === 1 ? "prenda" : "prendas"}`} variante="hoja" tamano="mediana" onClose={onClose}>
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        <p className="text-sm text-tinta/75">
          La orden queda anulada y no toca el stock de prendas. Sigue a la vista en Terminadas, para que no se pierda el registro.
        </p>
        {afuera && (
          <Aviso tono="atencion" chico>
            {textoPrendasAfuera(afuera)}
          </Aviso>
        )}
        {devuelve.length > 0 && (
          <Aviso tono="info" chico>
            <b className="font-semibold">La tela y los avíos que ya se usaron vuelven al estante</b> ({devuelve.map((g) => `${g.nombre} ${g.texto}`).join(", ")}), cada uno a su lote y a su costo. Queda anotado como devolución.
          </Aviso>
        )}
        <CampoTexto id="anular-orden-motivo" etiqueta="Por qué la anulas" pie="Opcional · queda escrito en la orden" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={onClose}>
              Volver
            </Boton>
            <Boton type="submit" peso="peligro" cargando={cargando} textoCargando="Anulando…" disabled={!responsable.listo || afuera !== null} title={afuera ? textoPrendasAfuera(afuera) : (responsable.motivo ?? undefined)}>
              Anular orden
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
