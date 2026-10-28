"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import { RPC_QUITAR_PASO, type FasePagina, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Quitar este paso» (ADR-0551, actividad 1b): una orden que se abrió con un paso que ya no se hace (Limpiar hilos y revisar, Etiquetar y embolsar) lo deja salir de su ruta mientras
// el paso no tenga NADA anotado. Quitar es de un solo sentido —la base no tiene «agregar paso»—, por eso es una hoja con su confirmación y no un clic suelto, y el botón es el rojo de
// lo que borra. Un solo control, quién lo quita: la base firma cada escritura (ADR-0161/0162). No decide nada: `quitar_paso_orden` rechaza lo que no se puede (`fase_empezada`,
// `paso_fijo`, `orden_cerrada`) y `traducirError` lo dice en palabras de tienda.

export function QuitarPasoModal({ datos, fase, onClose }: { datos: OrdenPagina; fase: FasePagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const nombreMinuscula = fase.nombre.toLocaleLowerCase("es");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let fallo: Parameters<typeof traducirError>[0] = null;
    try {
      const { error } = await firmar(createClient().rpc(RPC_QUITAR_PASO as never, { p_fase_id: fase.id } as never), responsable.firma());
      responsable.despues(error);
      fallo = error;
    } finally {
      enVuelo.current = false;
    }
    setCargando(false);
    if (fallo) {
      avisar.error(traducirError(fallo, `quitar ${nombreMinuscula}`, { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    avisar.exito(`${fase.nombre} salió de la orden`, { detalle: datos.orden.numeroTexto });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo={`¿Quitar ${fase.nombre}?`}
      subtitulo={`La ${datos.orden.numeroTexto} deja de hacer este paso. No se puede volver a agregar.`}
      variante="hoja"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <PieAcciones>
          <Boton type="button" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="peligro" cargando={cargando} textoCargando="Quitando…" disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
            Quitar paso
          </Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
