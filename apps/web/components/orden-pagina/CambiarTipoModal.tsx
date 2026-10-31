"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { traducirError } from "@/lib/error-escritura";
import type { OrdenPagina } from "@/lib/orden-pagina-reglas";
import {
  MAX_MOTIVO_TIPO,
  RPC_CAMBIAR_TIPO_ORDEN,
  avisoDePrecioParaLote,
  destinoDeTipo,
  leerRespuestaDeCambioDeTipo,
  motivoParaLaBase,
  queCambiaAlCerrar,
  textoCambiasteElTipo,
  textoYaEraDeEseTipo,
} from "@/lib/orden-tipo-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Pasar a lote de producción» / «Pasar a muestra» (ADR-0581): corrige el tipo de una orden que sigue abierta. Nació de tres lotes de 16, 54 y 69 prendas que se abrieron como muestra con
// «Crear un modelo nuevo» (donde el formulario arranca en Muestra) y no tenían cómo corregirse: una muestra, al cerrarse, no entra al stock. La hoja dice qué cambia al cerrar la orden y no
// pide nada más que quién lo hace; el motivo es opcional, y el cambio queda en la historia de la orden aunque no se escriba. Mientras la orden está abierta se puede volver atrás con el
// mismo botón. De muestra a lote la base exige el precio a tienda de cada talla y color (`precio_obligatorio`) y lo dice con los códigos que faltan.

export function CambiarTipoModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const { orden } = datos;
  const destino = destinoDeTipo(orden.esMuestra);
  const responsable = useResponsable({ ubicacionId: orden.ubicacionId, etiqueta: orden.ubicacionNombre });
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const sinPrecio = avisoDePrecioParaLote(destino, orden.producto.precio);

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
      resultado = await firmar(
        createClient().rpc(RPC_CAMBIAR_TIPO_ORDEN as never, { p_produccion_id: orden.id, p_es_muestra: destino.esMuestra, p_motivo: motivoParaLaBase(motivo) } as never),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { data, error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "cambiar el tipo de la orden", { confirmarAntesDeRepetir: true }));
      // Si otra persona la cerró o la cambió mientras tanto, la página tiene que mostrar cómo quedó de verdad.
      router.refresh();
      return;
    }
    const respuesta = leerRespuestaDeCambioDeTipo(data);
    if (respuesta?.cambio === false) avisar.aviso(textoYaEraDeEseTipo(orden.producto.referencia, destino));
    else avisar.exito(textoCambiasteElTipo(orden.producto.referencia, destino), { detalle: orden.numeroTexto });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo={destino.titulo}
      subtitulo={`${orden.numeroTexto} · ${orden.producto.referencia} · ${orden.cantidadPlan} ${orden.cantidadPlan === 1 ? "prenda" : "prendas"}`}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        <div data-guia="prod-orden-tipo.efecto" className="space-y-3">
          <p className="text-sm text-tinta/75">
            Hoy es {orden.esMuestra ? "una muestra" : "un lote de producción"}. {queCambiaAlCerrar(destino, orden.cantidadPlan)}
          </p>
          {sinPrecio && (
            <Aviso tono="atencion" chico>
              {sinPrecio}
            </Aviso>
          )}
          <p className="text-sm text-tinta/70">No toca prendas, stock ni costos de hoy. Mientras la orden siga abierta, lo puedes volver a cambiar.</p>
        </div>
        <CampoTexto
          id="cambiar-tipo-motivo"
          etiqueta="Por qué lo cambias"
          pie="Opcional · queda escrito en la orden"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={MAX_MOTIVO_TIPO}
        />
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <div className="pie-hoja-fijo">
          <div className="border-t border-sand pt-3">
            <div className="pie-acciones">
              <Boton type="button" onClick={onClose}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Cambiando…" disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
                {destino.confirmar}
              </Boton>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
