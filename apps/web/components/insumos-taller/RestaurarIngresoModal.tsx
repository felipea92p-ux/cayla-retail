"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import { diaLima, diaMes } from "@/lib/fechas-lima";
import { MAX_MOTIVO_INGRESO, MOTIVOS_RESTAURAR_INGRESO, RPC_RESTAURAR_INGRESO, problemaDeMotivoIngreso } from "@/lib/ingreso-insumo-reglas";
import type { InsumoVista, IngresoEliminado } from "@/lib/insumos";
import { cantidadTexto } from "@/lib/insumos-reglas";
import { camposDeCambioConMotivo } from "@/lib/orden-pagina-guia";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Restaurar» un ingreso eliminado (ADR-0570, actividad 6a). Lo eliminado nunca se borró: la base lo tiene con su cantidad de antes y la historia dice quién lo sacó y por qué. Restaurar lo devuelve al
// estante tal como era (`restaurar_ingreso_insumo`), con su porqué y quién, y queda escrito como un cambio más. Dos controles —el porqué y quién—, igual que «Restaurar» en la orden. Restaurar un ingreso que ya
// está activo es inofensivo (la base lo dice «ya estaba»): repetir tras un corte de red no duplica nada.

export function RestaurarIngresoModal({ insumo, eliminado, onClose }: { insumo: InsumoVista; eliminado: IngresoEliminado; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [porque, setPorque] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const problemaMotivo = problemaDeMotivoIngreso(porque);
  const guia = useGuiaCampos(camposDeCambioConMotivo({ problema: problemaMotivo, responsableListo: responsable.listo }));
  const eliminadoElDia = diaLima(eliminado.eliminadoEn);

  async function restaurar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (problemaMotivo) {
      avisar.error(problemaMotivo);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let fallo: Parameters<typeof traducirError>[0] = null;
    try {
      // La función es nueva (ADR-0570) y los tipos generados todavía no la traen: la llamada se tipa a mano.
      const { error } = await firmar(createClient().rpc(RPC_RESTAURAR_INGRESO as never, { p_lote_id: eliminado.loteId, p_motivo: porque.trim() } as never), responsable.firma());
      responsable.despues(error);
      fallo = error;
    } finally {
      enVuelo.current = false;
    }
    setCargando(false);
    if (fallo) {
      avisar.error(traducirError(fallo, "restaurar el ingreso", { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    avisar.exito(`Restauraste el ingreso de ${cantidadTexto(eliminado.cantidad, insumo.unidad)}`, { detalle: `${insumo.nombre} · volvió al estante con lo que tenía` });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="Restaurar este ingreso" subtitulo="Vuelve al estante con la cantidad que tenía. Queda escrito en la historia, igual que cuando se eliminó." variante="hoja" onClose={onClose}>
      <form onSubmit={restaurar} className="mt-3.5 space-y-4">
        <div className="nota-cayla sin-i space-y-0.5">
          <p className="text-tinta">
            <b className="font-medium tabular-nums">{cantidadTexto(eliminado.cantidad, insumo.unidad)}</b> de {insumo.nombre}, del {diaMes(eliminado.ingreso)}
            {eliminado.documento ? ` · ${eliminado.documento}` : ""}
          </p>
          <p className="text-sm text-tinta/70">
            {eliminado.quien ? `Lo eliminó ${eliminado.quien}` : "Se eliminó"}
            {eliminadoElDia ? ` el ${diaMes(eliminadoElDia)}` : ""}: «{eliminado.motivo}».
          </p>
        </div>

        <CampoGuiado id="porque" guia={guia} className="space-y-2">
          <span className={campoEtiqueta}>{guia.etiqueta("porque", "¿Por qué lo restauras?")}</span>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_RESTAURAR_INGRESO.map((m) => (
              <button key={m} type="button" className="pildora-cayla" aria-pressed={porque === m} onClick={() => setPorque(m)}>
                {m}
              </button>
            ))}
          </div>
          <CampoTexto etiqueta="O cuéntalo con tus palabras" id="restaurar-ingreso-porque" pie="Queda en la historia del ingreso" value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={MAX_MOTIVO_INGRESO} />
        </CampoGuiado>

        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para restaurar." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="border-t border-sand pt-3">
            <PieAcciones>
              <Boton type="button" onClick={onClose}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Restaurando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                Restaurar el ingreso
              </Boton>
            </PieAcciones>
          </div>
        </div>
      </form>
    </Modal>
  );
}
