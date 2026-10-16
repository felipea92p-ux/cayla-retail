"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { camposDeAnulacion } from "@/lib/orden-pagina-guia";
import { MAX_MOTIVO_ANULACION, problemaDeAnulacion, rpcDeAnulacion, textoAnulaste, textoQuePasaAlAnular, type EntradaDeTiempo, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Anular» una Salida o una Vuelta mal anotada (ADR-0400, actividad 4b; decisión de Felipe, 2026-10-15). Lo anotado no se edita ni se borra (principio 4): la base escribe una fila contraria con el
// motivo y todas las sumas cuadran solas (`anular_salida` / `anular_vuelta`). Solo se ofrece mientras nada haya avanzado después —de esa salida no volvió nada; las buenas de esa vuelta no las usó la
// fase siguiente— y la base lo vuelve a comprobar. Dos controles: por qué (obligatorio, queda escrito) y quién lo anota. Un doble clic no anula dos veces: una marca síncrona corta la segunda llamada.

export function AnularSalidaOVueltaModal({ datos, entrada, onClose }: { datos: OrdenPagina; entrada: EntradaDeTiempo; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const anulable = entrada.anulable;
  const que = anulable?.que ?? "salida";

  const problema = problemaDeAnulacion(motivo);
  const guia = useGuiaCampos(camposDeAnulacion({ problema, responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): solo cuenta lo que la persona escribió.
  const fotoActual = fotoFormulario({ motivo });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Escribiste un motivo y todavía no se anuló nada. Si cierras ahora, se pierde lo que escribiste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !anulable) return;
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
      const args = anulable.que === "salida" ? { p_salida_id: anulable.id, p_motivo: motivo.trim() } : { p_vuelta_id: anulable.id, p_motivo: motivo.trim() };
      resultado = await firmar(createClient().rpc(rpcDeAnulacion(anulable.que) as never, args as never), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // La base pudo guardar y la respuesta perderse: se dice que no se sabe y se pide mirar la línea de tiempo antes de repetir.
      avisar.error(traducirError(error, `anular la ${anulable.que}`, { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    avisar.exito(textoAnulaste(anulable.que), { detalle: `${datos.orden.numeroTexto} · ${entrada.titulo}` });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={`¿Anulamos esta ${que}?`}
      subtitulo={`${entrada.titulo}${entrada.cuanto ? ` · ${entrada.cuanto}` : ""}${entrada.detalle ? ` · ${entrada.detalle}` : ""}`}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <p className="text-sm text-tinta/75">
          {textoQuePasaAlAnular(que)}
        </p>

        <div data-guia="prod-orden-anular.motivo">
          <CampoGuiado id="motivo" guia={guia}>
            <CampoTexto id="anular-motivo" etiqueta={guia.etiqueta("motivo", "Por qué la anulas")} pie="Obligatorio: queda escrito en la línea de tiempo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={MAX_MOTIVO_ANULACION} />
          </CampoGuiado>
        </div>

        <div data-guia="prod-orden-anular.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para anular." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="peligro" cargando={cargando} textoCargando="Anulando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Anular {que}
            </Boton>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
