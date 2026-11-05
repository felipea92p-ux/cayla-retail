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
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { camposDeCambioConMotivo } from "@/lib/orden-pagina-guia";
import { MAX_MOTIVO_CAMBIO, MOTIVOS_QUITAR_MARCA, MOTIVOS_RESTAURAR, RPC_ELIMINAR_ANOTACION, RPC_RESTAURAR_ANOTACION, problemaDeMotivoCambio, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// Dos cambios de la historia que solo piden el porqué (ADR-0570, actividad 3): quitar la marca de una fase que no cuenta prendas (Ploteo), y «Restaurar» lo que se eliminó. Nada se
// borra: quitar la marca escribe su Deshacer, y restaurar vuelve a anotar lo eliminado tal como era y con su día, con las mismas reglas (si mientras tanto la fase se llenó, la base lo
// dice). Los dos quedan en la historia con su motivo (`eliminar_anotacion_orden`, `restaurar_anotacion_orden`). Un doble clic no escribe dos veces.

export type CambioConMotivo =
  | { que: "quitar-marca"; marcaId: string; faseNombre: string }
  | { que: "restaurar"; cambioId: string; titulo: string; detalle: string | null };

export function CambioConMotivoModal({ datos, cambio, onClose }: { datos: OrdenPagina; cambio: CambioConMotivo; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [porque, setPorque] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const problema = problemaDeMotivoCambio(porque);
  const guia = useGuiaCampos(camposDeCambioConMotivo({ problema, responsableListo: responsable.listo }));
  const quita = cambio.que === "quitar-marca";
  const atajos = quita ? MOTIVOS_QUITAR_MARCA : MOTIVOS_RESTAURAR;

  // «¿Salir sin guardar?» (ADR-0136): solo cuenta lo que la persona escribió.
  const fotoActual = fotoFormulario({ porque });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Escribiste el porqué y todavía no se guardó nada. Si cierras ahora, se pierde lo que escribiste.");
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
      const llamada = quita
        ? createClient().rpc(RPC_ELIMINAR_ANOTACION as never, { p_ids: [cambio.marcaId], p_motivo: porque.trim() } as never)
        : createClient().rpc(RPC_RESTAURAR_ANOTACION as never, { p_cambio_id: cambio.cambioId, p_motivo: porque.trim() } as never);
      resultado = await firmar(llamada, responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // La base pudo guardar y la respuesta perderse: se dice que no se sabe y se pide mirar la historia antes de repetir.
      avisar.error(traducirError(error, quita ? "quitar la marca" : "restaurar lo eliminado", { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    avisar.exito(quita ? `Quitaste la marca de ${cambio.faseNombre}` : "Restauraste lo eliminado", { detalle: `${datos.orden.numeroTexto} · queda en la historia` });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={quita ? `¿Quitamos la marca de ${cambio.faseNombre.toLocaleLowerCase("es")}?` : "¿Restauramos lo eliminado?"}
      subtitulo={
        quita
          ? `${cambio.faseNombre} vuelve a quedar por hacer. Queda en la historia, con «Restaurar».`
          : `${cambio.titulo}${cambio.detalle ? ` · ${cambio.detalle}` : ""}. Vuelve tal como era y con su día.`
      }
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-cambio.porque">
          <CampoGuiado id="porque" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("porque", quita ? "¿Por qué la quitas?" : "¿Por qué lo restauras?")}</span>
            <div className="flex flex-wrap gap-2">
              {atajos.map((m) => (
                <button key={m} type="button" className="pildora-cayla" aria-pressed={porque === m} onClick={() => setPorque(m)}>
                  {m}
                </button>
              ))}
            </div>
            <CampoTexto etiqueta="O cuéntalo con tus palabras" id="cambio-porque" pie="Queda en la historia de la orden" value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={MAX_MOTIVO_CAMBIO} />
          </CampoGuiado>
        </div>

        <div data-guia="prod-orden-cambio.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo={quita ? "Todo listo para quitar la marca." : "Todo listo para restaurar."} conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="border-t border-sand pt-3">
            <PieAcciones>
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso={quita ? "peligro" : "primario"}
                cargando={cargando}
                textoCargando={quita ? "Quitando…" : "Restaurando…"}
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? responsable.motivo ?? undefined}
                className={guia.claseConfirmar}
              >
                {quita ? "Quitar la marca" : "Restaurar"}
              </Boton>
            </PieAcciones>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
