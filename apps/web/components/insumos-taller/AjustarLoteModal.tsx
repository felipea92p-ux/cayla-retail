"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import type { InsumoVista } from "@/lib/insumos";
import { UNIDADES_INSUMO, cantidadTexto, leerCantidad, type LoteConSaldo } from "@/lib/insumos-reglas";
import { RPC_AJUSTAR_LOTE_USADO, camposDelAjuste, problemaDelAjuste } from "@/lib/regularizar-insumos-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// Ajustar lo que queda de un lote ya usado (ADR-0614, actividad 7; Felipe, ADR-0570: «si ya se usó, solo se ajusta lo que queda»). Lo que falta sale del lote como
// merma, a su costo. Lo que entró no cambia. Si hay más de lo que dice el sistema, no es este lote: se anota aparte como «Saldo inicial», con su propio costo.
export function AjustarLoteModal({ insumo, lote, onClose }: { insumo: InsumoVista; lote: LoteConSaldo; onClose: () => void }) {
  const router = useRouter();
  const [queda, setQueda] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const responsable = useResponsable();
  const problema = problemaDelAjuste(queda, lote.saldo);
  const guia = useGuiaCampos(camposDelAjuste({ problema, motivo, responsableListo: responsable.listo }));
  const listo = guia.faltan.length === 0;
  const unidad = UNIDADES_INSUMO[insumo.unidad].corta;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo || cargando) return;
    setCargando(true);
    const { error } = await firmar(
      createClient().rpc(RPC_AJUSTAR_LOTE_USADO as never, { p_lote_id: lote.id, p_queda_que_vio: lote.saldo, p_queda: leerCantidad(queda), p_motivo: motivo.trim() } as never),
      responsable.firma(),
    );
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "ajustar lo que queda"));
      return;
    }
    avisar.exito(`Ahora quedan ${cantidadTexto(leerCantidad(queda) ?? 0, insumo.unidad)} en este lote`, { detalle: insumo.nombre });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Ajustar lo que queda" subtitulo={`${insumo.nombre} · el sistema dice ${cantidadTexto(lote.saldo, insumo.unidad)}`} tamano="mediana" onClose={onClose}>
      <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="space-y-4">
        <CampoGuiado id="queda" guia={guia}>
          <CampoTexto
            etiqueta={guia.etiqueta("queda", `Cuánto queda de verdad (${unidad})`)}
            inputMode="decimal"
            value={queda}
            onChange={(e) => setQueda(e.target.value)}
            tono={queda.trim() !== "" && problema ? "error" : undefined}
            pie={queda.trim() !== "" && problema ? problema : "Lo que falta sale del lote a su costo. Lo que entró no cambia."}
          />
        </CampoGuiado>
        <CampoGuiado id="porque" guia={guia}>
          <CampoTexto etiqueta={guia.etiqueta("porque", "Por qué")} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
        </CampoGuiado>
        <CampoGuiado id="quien" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        </CampoGuiado>
        <PieGuia guia={guia} listo="Todo listo para ajustar." />
        <PieAcciones className="pie-hoja-fijo">
          <Boton type="button" peso="fantasma" onClick={onClose} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} disabled={!listo}>
            Guardar
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
