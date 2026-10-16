"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CamposDeLaFicha } from "@/components/insumos-taller/CamposDeLaFicha";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { valoresDeLaFicha, type VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import { camposDeFichaDeLaTela } from "@/lib/insumos-guia";
import type { InsumoVista } from "@/lib/insumos";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// La ficha de una tela o un avío que ya está en el catálogo: de qué tejido y de qué color es (ADR-0400, actividad 8e). «Nueva orden» propone la tela del color de la prenda leyendo esto, pero hasta hoy
// ninguna pantalla lo escribía. Solo el líder (la política `insumos_update_lider` lo vuelve a comprobar). Guardar lo mismo dos veces no cambia nada: no hace falta marca de doble clic.

type Actualiza = { update: (v: { tejido_id: string | null; color_codigo: string | null }) => { eq: (c: string, v: string) => PromiseLike<{ error: { message: string; code?: string } | null }> & { setHeader(n: string, v: string): unknown } } };

export function FichaDeLaTelaModal({ insumo, vocabulario, leyo, onClose }: { insumo: InsumoVista; vocabulario: VocabularioDeTelas; leyo: boolean; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [tejidoId, setTejidoId] = useState(insumo.tipo === "tela" ? (insumo.tejidoId ?? "") : "");
  const [colorCodigo, setColorCodigo] = useState(insumo.colorCodigo ?? "");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  const guia = useGuiaCampos(camposDeFichaDeLaTela({ tipo: insumo.tipo, tejidoId, colorCodigo, responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): solo cuenta lo que cambió respecto de lo que ya tenía la ficha.
  const fotoActual = fotoFormulario({ tejidoId, colorCodigo });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste la ficha y todavía no se guardó. Si cierras ahora, se pierde el cambio.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

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
      // Las columnas son nuevas (ADR-0400) y los tipos generados todavía no las traen: la consulta se tipa a mano, como la lectura de insumos.
      const consulta = (createClient().from("insumos") as unknown as Actualiza).update(valoresDeLaFicha({ tipo: insumo.tipo, tejidoId, colorCodigo }, vocabulario)).eq("id", insumo.id);
      resultado = await (firmar(consulta as never, responsable.firma()) as unknown as PromiseLike<{ error: { message: string; code?: string } | null }>);
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "guardar la ficha", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`Ficha de ${insumo.nombre} guardada`, { detalle: insumo.tipo === "tela" ? "«Nueva orden» ya puede proponerla para las prendas de ese color." : "Quedó anotado su color." });
    cerrarTrasGuardar();
  }

  return (
    <Modal titulo={insumo.tipo === "tela" ? "Ficha de la tela" : "Ficha del insumo"} subtitulo={insumo.nombre} variante="hoja" tamano="mediana" onClose={onClose} antesDeCerrar={avisoSalida.pedirAccion}>
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <p className="text-sm text-tinta/75">
          {insumo.tipo === "tela" ? "Dile de qué tejido y de qué color es. Al armar una orden, «Nueva orden» propone la tela del color de la prenda." : "Dile de qué color es."}
        </p>

        <CamposDeLaFicha tipo={insumo.tipo} tejidoId={tejidoId} colorCodigo={colorCodigo} onTejido={setTejidoId} onColor={setColorCodigo} vocabulario={vocabulario} leyo={leyo} foco={guia} guia="prod-ficha-tela.campos" />

        <div data-guia="prod-ficha-tela.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar la ficha." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Guardar la ficha
            </Boton>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
