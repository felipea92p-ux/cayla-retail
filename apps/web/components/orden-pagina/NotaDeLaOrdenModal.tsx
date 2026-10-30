"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { camposDeNota } from "@/lib/orden-pagina-guia";
import { MAX_NOTA_ORDEN, RPC_COMENTAR_ORDEN, problemaDeNota, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// Una nota del equipo en la historia de la orden (ADR-0570, actividad 3): lo que hay que saber de esta orden y no es una anotación («la tela llegó con una mancha», «Rosa se lleva
// diez para terminar en casa»). Queda con quién y cuándo (`comentar_orden`); no se borra: si algo cambió, se escribe otra. Vale también en una orden que ya pasó al stock.

export function NotaDeLaOrdenModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const problema = problemaDeNota(texto);
  const guia = useGuiaCampos(camposDeNota({ problema, responsableListo: responsable.listo }));

  const fotoActual = fotoFormulario({ texto });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Escribiste una nota y todavía no se guardó. Si cierras ahora, se pierde lo que escribiste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (problema) {
      avisar.error(problema);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      resultado = await firmar(createClient().rpc(RPC_COMENTAR_ORDEN as never, { p_produccion_id: datos.orden.id, p_texto: texto.trim() } as never), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "escribir la nota", { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    avisar.exito("Escribiste una nota en la historia", { detalle: datos.orden.numeroTexto });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo="Escribe una nota para el equipo"
      subtitulo="Lo que hay que saber de esta orden y no es una anotación. Queda en la historia con tu nombre y la hora."
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-nota.texto">
          <CampoGuiado id="texto" guia={guia}>
            <CampoTexto id="nota-texto" etiqueta={guia.etiqueta("texto", "La nota")} pie={`Hasta ${MAX_NOTA_ORDEN} letras`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={MAX_NOTA_ORDEN} />
          </CampoGuiado>
        </div>

        <div data-guia="prod-orden-nota.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar la nota." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="border-t border-sand pt-3">
            <PieAcciones>
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                Guardar la nota
              </Boton>
            </PieAcciones>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
